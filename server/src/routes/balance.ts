import { unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { persistValidatedProof, uploadProof, UPLOADS_DIR } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { balanceLookupLimiter, balancePayLimiter } from "../middleware/rateLimit.js";
import { fetchBcvRate } from "../services/bcvService.js";
import * as metaWhatsAppService from "../services/metaWhatsAppService.js";

// Consulta pública del saldo de un atleta y envío del comprobante de la(s) cuota(s)
// faltante(s). El pago entra como PENDING: el organizador lo aprueba desde el panel con
// el mismo flujo de siempre (PATCH /api/admin/athletes/:id/payment), y al cubrir el total
// recomputeAthletePaymentStatus lo pasa a PAID y asigna dorsal + certificado.

export const balanceRouter = Router();

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  "pago-movil": "Pago Móvil",
  transferencia: "Transferencia",
  zelle: "Zelle",
  "binance-pay": "Binance Pay",
};

const MAX_PENDING_PAYMENTS = 3;
// Margen por diferencias de tasa entre el momento de pagar y el de registrar el comprobante.
const OVERPAY_TOLERANCE_RATIO = 0.05;
const OVERPAY_TOLERANCE_USD = 1;
const MIN_PAYMENT_USD = 0.5;
// Por debajo de este saldo (USD) se considera pagado (evita centavos residuales por redondeo).
const BALANCE_EPSILON_USD = 0.5;

const NOT_FOUND_MESSAGE =
  "No encontramos una inscripción con esos datos. Verifica tu cédula y el teléfono o correo con el que te inscribiste.";

const round2 = (n: number) => Math.round(n * 100) / 100;

interface AthleteRow {
  id: string;
  ci: string;
  full_name: string;
  phone: string;
  email: string | null;
  route: string;
  payment_status: string;
  total_amount_usd: string | number;
  bib_number: number | null;
  team_id: string | null;
  team_name?: string | null;
}

interface Queryable {
  query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

// --- Tasa BCV (caché corta para no depender de la API externa en cada consulta) ---------

let cachedRate: { value: number; at: number } | null = null;
const RATE_TTL_MS = 5 * 60 * 1000;

async function currentBcvRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.at < RATE_TTL_MS) return cachedRate.value;
  const value = await fetchBcvRate();
  cachedRate = { value, at: Date.now() };
  return value;
}

// --- Verificación de identidad -----------------------------------------------------------

// La cédula se compara sin guiones/espacios y sin distinguir mayúsculas; si el atleta
// escribe solo los números ("12345678") también coincide con "V-12345678".
function normalizeId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchesContact(row: AthleteRow, contact: string): boolean {
  const value = contact.trim();
  if (value.includes("@")) {
    return typeof row.email === "string" && row.email.trim().toLowerCase() === value.toLowerCase();
  }
  const given = value.replace(/\D/g, "");
  const stored = String(row.phone ?? "").replace(/\D/g, "");
  if (given.length < 7 || stored.length < 7) return false;
  return given.slice(-7) === stored.slice(-7);
}

async function findVerifiedAthlete(idNumber: string, contact: string): Promise<AthleteRow | null> {
  const id = normalizeId(idNumber);
  const result = await pool.query<AthleteRow>(
    `SELECT a.*, t.name AS team_name
       FROM athletes a
       LEFT JOIN teams t ON t.id = a.team_id
      WHERE regexp_replace(upper(a.ci), '[^A-Z0-9]', '', 'g') = $1
         OR regexp_replace(regexp_replace(upper(a.ci), '[^A-Z0-9]', '', 'g'), '^[A-Z]', '') = $1
      LIMIT 5`,
    [id],
  );
  return result.rows.find((row) => matchesContact(row, contact)) ?? null;
}

// --- Cálculo del saldo -------------------------------------------------------------------

interface BalanceSummary {
  totalUsd: number;
  approvedUsd: number;
  pendingReviewUsd: number;
  balanceUsd: number;
  pendingCount: number;
}

async function computeBalance(queryable: Queryable, athlete: AthleteRow): Promise<BalanceSummary> {
  const sums = await queryable.query(
    `SELECT COALESCE(SUM(amount_usd_equiv) FILTER (WHERE status = 'APPROVED'), 0) AS approved,
            COALESCE(SUM(amount_usd_equiv) FILTER (WHERE status = 'PENDING'), 0) AS pending,
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count
       FROM payments WHERE athlete_id = $1`,
    [athlete.id],
  );
  const totalUsd = Number(athlete.total_amount_usd);
  const approvedUsd = Number(sums.rows[0].approved);
  const pendingReviewUsd = Number(sums.rows[0].pending);
  return {
    totalUsd: round2(totalUsd),
    approvedUsd: round2(approvedUsd),
    pendingReviewUsd: round2(pendingReviewUsd),
    // El saldo descuenta también lo ya enviado y en revisión, para no pedir dos veces lo mismo.
    balanceUsd: round2(Math.max(totalUsd - approvedUsd - pendingReviewUsd, 0)),
    pendingCount: Number(sums.rows[0].pending_count),
  };
}

// Por qué (si hay alguna razón) el atleta no puede enviar un pago ahora mismo.
function blockReason(athlete: AthleteRow, summary: BalanceSummary): string | null {
  if (athlete.payment_status === "PAID" || summary.approvedUsd >= summary.totalUsd) {
    return "Tu inscripción ya está pagada completa. ¡Nos vemos en la salida!";
  }
  if (athlete.team_id) {
    return "Tu inscripción es parte de un equipo y se paga en conjunto. Comunícate con el capitán de tu equipo o con el organizador.";
  }
  if (summary.balanceUsd <= BALANCE_EPSILON_USD) {
    return "Ya enviaste pagos que cubren tu saldo. Están en revisión; te avisaremos cuando queden aprobados.";
  }
  if (summary.pendingCount >= MAX_PENDING_PAYMENTS) {
    return "Tienes varios pagos en revisión. Espera a que el organizador los apruebe antes de enviar otro.";
  }
  return null;
}

async function removeUploadedProof(req: Request) {
  if (!req.file?.filename) return;
  await unlink(path.join(UPLOADS_DIR, req.file.filename)).catch(() => undefined);
}

// --- POST /api/balance/lookup ------------------------------------------------------------

const lookupSchema = z.object({
  idNumber: z.string().trim().min(5, "Cédula o pasaporte inválido.").max(20, "Cédula o pasaporte inválido."),
  contact: z.string().trim().min(7, "Ingresa el teléfono o correo con el que te inscribiste.").max(150),
});

balanceRouter.post("/lookup", balanceLookupLimiter, validateBody(lookupSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof lookupSchema>;

  try {
    const athlete = await findVerifiedAthlete(body.idNumber, body.contact);
    if (!athlete) {
      res.status(404).json({ error: NOT_FOUND_MESSAGE });
      return;
    }

    const [summary, bcvRate, paymentsRes] = await Promise.all([
      computeBalance(pool, athlete),
      currentBcvRate(),
      pool.query(
        `SELECT amount_usd_equiv, amount_bs, bank_origin, status, created_at
           FROM payments WHERE athlete_id = $1 ORDER BY created_at`,
        [athlete.id],
      ),
    ]);

    const reason = blockReason(athlete, summary);

    res.json({
      athlete: {
        fullName: athlete.full_name,
        route: athlete.route,
        routeLabel: ROUTE_LABELS[athlete.route] ?? athlete.route,
        paymentStatus: athlete.payment_status,
        bibNumber: athlete.bib_number,
        teamName: athlete.team_name ?? null,
      },
      ...summary,
      bcvRate,
      balanceBs: round2(summary.balanceUsd * bcvRate),
      canPay: reason === null,
      blockedReason: reason,
      payments: paymentsRes.rows.map((p) => ({
        amountUsd: round2(Number(p.amount_usd_equiv)),
        amountBs: Number(p.amount_bs),
        method: p.bank_origin,
        status: p.status,
        createdAt: p.created_at,
      })),
    });
  } catch (err) {
    console.error("Error consultando saldo:", err);
    res.status(500).json({ error: "No se pudo consultar tu saldo. Intenta de nuevo." });
  }
});

// --- POST /api/balance/pay ---------------------------------------------------------------

const paySchema = z.object({
  idNumber: lookupSchema.shape.idNumber,
  contact: lookupSchema.shape.contact,
  paymentMethod: z.enum(["pago-movil", "transferencia", "zelle", "binance-pay"], {
    message: "Método de pago inválido.",
  }),
  paymentReference: z.string().trim().min(1, "Falta la referencia de pago.").max(50),
  amountBs: z.coerce.number().positive("Monto inválido.").max(100_000_000),
});

balanceRouter.post(
  "/pay",
  balancePayLimiter,
  uploadProof.single("proof"),
  persistValidatedProof,
  validateBody(paySchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof paySchema>;

    async function reject(status: number, error: string) {
      await removeUploadedProof(req);
      res.status(status).json({ error });
    }

    if (!req.file) {
      await reject(400, "Debes adjuntar el comprobante de pago.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const verified = await findVerifiedAthlete(body.idNumber, body.contact);
      if (!verified) {
        await client.query("ROLLBACK");
        await reject(404, NOT_FOUND_MESSAGE);
        return;
      }

      // Bloquea la fila del atleta: dos envíos simultáneos no pueden pasar ambos la
      // validación del saldo y quedar sumando más de lo que debe.
      const lockRes = await client.query<AthleteRow>("SELECT * FROM athletes WHERE id = $1 FOR UPDATE", [verified.id]);
      const athlete: AthleteRow = { ...verified, ...lockRes.rows[0] };

      const summary = await computeBalance(client, athlete);
      const reason = blockReason(athlete, summary);
      if (reason) {
        await client.query("ROLLBACK");
        await reject(409, reason);
        return;
      }

      // La tasa y el equivalente en USD los fija el servidor: el cliente solo informa Bs.
      const bcvRate = await currentBcvRate();
      const amountUsd = round2(body.amountBs / bcvRate);

      if (amountUsd < MIN_PAYMENT_USD) {
        await client.query("ROLLBACK");
        await reject(400, "El monto es demasiado bajo.");
        return;
      }
      const maxAllowedUsd = summary.balanceUsd * (1 + OVERPAY_TOLERANCE_RATIO) + OVERPAY_TOLERANCE_USD;
      if (amountUsd > maxAllowedUsd) {
        await client.query("ROLLBACK");
        await reject(
          400,
          `El monto supera tu saldo pendiente (${summary.balanceUsd.toFixed(2)} USD ≈ ${round2(summary.balanceUsd * bcvRate)} Bs).`,
        );
        return;
      }

      const dup = await client.query(
        "SELECT 1 FROM payments WHERE athlete_id = $1 AND lower(reference) = lower($2) LIMIT 1",
        [athlete.id, body.paymentReference],
      );
      if (dup.rows.length > 0) {
        await client.query("ROLLBACK");
        await reject(409, "Ya registraste un pago con esa referencia.");
        return;
      }

      await client.query(
        `INSERT INTO payments
          (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, proof_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
        [
          athlete.id,
          body.amountBs,
          amountUsd,
          bcvRate,
          body.paymentReference,
          PAYMENT_METHOD_LABEL[body.paymentMethod] ?? body.paymentMethod,
          `/uploads/${req.file.filename}`,
        ],
      );

      await client.query("COMMIT");

      const remainingUsd = round2(Math.max(summary.balanceUsd - amountUsd, 0));
      res.status(201).json({
        ok: true,
        amountUsd,
        remainingUsd,
        remainingBs: round2(remainingUsd * bcvRate),
      });

      metaWhatsAppService.sendOrganizerAlert(
        `💸 Pago de saldo recibido: ${athlete.full_name} (${athlete.ci}) · ${amountUsd.toFixed(2)} USD · ` +
          `${PAYMENT_METHOD_LABEL[body.paymentMethod] ?? body.paymentMethod} · ref ${body.paymentReference}. ` +
          `Pendiente de aprobación en el panel.`,
      );
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      await removeUploadedProof(req);
      console.error("Error registrando pago de saldo:", err);
      res.status(500).json({ error: "No se pudo registrar tu pago. Intenta de nuevo." });
    } finally {
      client.release();
    }
  },
);
