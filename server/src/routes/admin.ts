import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAdmin, safeCompare, signAdminToken } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import { serializeAthlete } from "../lib/serialize.js";
import { generateCertificatePdf } from "../services/certificateService.js";
import { dispatchCertificateEmail } from "../services/certificateDispatch.js";
import { recomputeAthletePaymentStatus } from "../services/paymentService.js";

export const adminRouter = Router();

const JERSEY_CUTS = ["caballero", "dama"] as const;
const JERSEY_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const JERSEY_SIZES_BY_CUT: Record<string, readonly string[]> = {
  caballero: ["S", "M", "L", "XL", "XXL"],
  dama: ["XS", "S", "M", "L", "XL"],
};
const ROUTES = ["33K_REDOMA", "22K_ILUSTRES"] as const;
const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

const idNumberSchema = z
  .string()
  .trim()
  .min(5, "Cédula o pasaporte inválido.")
  .max(20, "Cédula o pasaporte inválido.")
  .regex(/^[A-Za-z0-9-]+$/, "Cédula o pasaporte inválido.");

const phoneSchema = z
  .string()
  .trim()
  .min(7, "Teléfono inválido.")
  .max(20, "Teléfono inválido.")
  .regex(/^[0-9+()\- ]+$/, "Teléfono inválido.");

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// --- Auth -------------------------------------------------------------

const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

adminRouter.post("/login", loginLimiter, validateBody(loginSchema), (req, res) => {
  const { password } = req.body as z.infer<typeof loginSchema>;
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!adminPassword || !safeCompare(password, adminPassword)) {
    res.status(401).json({ error: "Contraseña incorrecta." });
    return;
  }

  res.json({ token: signAdminToken() });
});

// --- Métricas HUD -------------------------------------------------------

adminRouter.get("/metrics", requireAdmin, async (_req, res) => {
  const totalsRes = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE route = '33K_REDOMA')::int AS total_33k,
      COUNT(*) FILTER (WHERE route = '22K_ILUSTRES')::int AS total_22k,
      COUNT(*) FILTER (WHERE checked_in)::int AS checked_in
    FROM athletes
  `);

  const revenueRes = await pool.query(`
    SELECT COALESCE(SUM(amount_usd_equiv), 0) AS usd, COALESCE(SUM(amount_bs), 0) AS bs
    FROM payments WHERE status = 'APPROVED'
  `);

  res.json({
    totalAthletes: totalsRes.rows[0].total,
    total33k: totalsRes.rows[0].total_33k,
    total22k: totalsRes.rows[0].total_22k,
    checkedIn: totalsRes.rows[0].checked_in,
    totalRevenueUsd: Number(revenueRes.rows[0].usd),
    totalRevenueBs: Number(revenueRes.rows[0].bs),
  });
});

// --- Listado de atletas -------------------------------------------------

export const ATHLETE_WITH_PAYMENTS_SELECT = `
  SELECT a.*,
      t.name AS team_name,
      COALESCE(paid.paid_usd, 0) AS paid_amount_usd,
      COALESCE(pays.payments, '[]') AS payments
   FROM athletes a
   LEFT JOIN teams t ON t.id = a.team_id
   LEFT JOIN (
     SELECT athlete_id, SUM(amount_usd_equiv) AS paid_usd
     FROM payments WHERE status = 'APPROVED' GROUP BY athlete_id
   ) paid ON paid.athlete_id = a.id
   LEFT JOIN (
     SELECT athlete_id, json_agg(p.* ORDER BY p.created_at DESC) AS payments
     FROM payments p GROUP BY athlete_id
   ) pays ON pays.athlete_id = a.id
`;

adminRouter.get("/athletes", requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (req.query.route) {
    params.push(req.query.route);
    conditions.push(`a.route = $${params.length}`);
  }
  if (req.query.teamId) {
    params.push(req.query.teamId);
    conditions.push(`a.team_id = $${params.length}`);
  }
  if (req.query.paymentStatus) {
    params.push(req.query.paymentStatus);
    conditions.push(`a.payment_status = $${params.length}`);
  }
  if (req.query.checkedIn !== undefined) {
    params.push(req.query.checkedIn === "true");
    conditions.push(`a.checked_in = $${params.length}`);
  }
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    params.push(`%${req.query.q.trim()}%`);
    const i = params.length;
    conditions.push(`(a.full_name ILIKE $${i} OR a.ci ILIKE $${i} OR a.phone ILIKE $${i} OR a.email ILIKE $${i})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM athletes a ${whereClause}`, params);

  const listParams = [...params, pageSize, offset];
  const itemsRes = await pool.query(
    `${ATHLETE_WITH_PAYMENTS_SELECT}
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  res.json({
    items: itemsRes.rows.map(serializeAthlete),
    total: totalRes.rows[0].count,
    page,
    pageSize,
  });
});

// Ficha completa de un atleta (incluye historial de pagos con proofUrl) — usada por el
// Centro de Mando del CRM al vincular o seleccionar una conversación.
adminRouter.get("/athletes/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { rows } = await pool.query(`${ATHLETE_WITH_PAYMENTS_SELECT} WHERE a.id = $1`, [id]);
  if (rows.length === 0) {
    res.status(404).json({ error: "Atleta no encontrado." });
    return;
  }
  res.json({ athlete: serializeAthlete(rows[0]) });
});

// --- Editar / eliminar atleta ---------------------------------------------

const EDITABLE_FIELDS = [
  "fullName",
  "ci",
  "phone",
  "emergencyContact",
  "bloodType",
  "route",
  "jerseyCut",
  "jerseySize",
] as const;
const FIELD_TO_COLUMN: Record<(typeof EDITABLE_FIELDS)[number], string> = {
  fullName: "full_name",
  ci: "ci",
  phone: "phone",
  emergencyContact: "emergency_contact",
  bloodType: "blood_type",
  route: "route",
  jerseyCut: "jersey_cut",
  jerseySize: "jersey_size",
};

const editAthleteSchema = z
  .object({
    fullName: z.string().trim().min(3, "Nombre inválido.").max(150),
    ci: idNumberSchema,
    phone: phoneSchema,
    emergencyContact: z.string().trim().min(3, "Contacto de emergencia inválido.").max(100),
    bloodType: z.enum(BLOOD_TYPES, { message: "Tipo de sangre inválido." }),
    route: z.enum(ROUTES, { message: "Ruta inválida." }),
    jerseyCut: z.enum(JERSEY_CUTS, { message: "Corte de jersey inválido." }),
    jerseySize: z.enum(JERSEY_SIZES, { message: "Talla inválida." }),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No hay campos para actualizar." })
  .refine(
    (data) =>
      !data.jerseySize || !data.jerseyCut || (JERSEY_SIZES_BY_CUT[data.jerseyCut]?.includes(data.jerseySize) ?? true),
    { message: "La talla no corresponde al corte seleccionado.", path: ["jerseySize"] },
  );

adminRouter.patch("/athletes/:id", requireAdmin, validateBody(editAthleteSchema), async (req, res) => {
  const id = String(req.params.id);
  const body = req.body as z.infer<typeof editAthleteSchema>;

  const updates = EDITABLE_FIELDS.filter((field) => body[field] !== undefined);

  const setClauses = updates.map((field, i) => `${FIELD_TO_COLUMN[field]} = $${i + 1}`);
  const values = updates.map((field) => body[field]);

  try {
    const result = await pool.query(
      `UPDATE athletes SET ${setClauses.join(", ")} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Atleta no encontrado." });
      return;
    }
    res.json({ athlete: serializeAthlete(result.rows[0]) });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      res.status(409).json({ error: "Ya existe otro atleta con esa cédula." });
      return;
    }
    console.error("Error editando atleta:", err);
    res.status(500).json({ error: "No se pudo actualizar el atleta." });
  }
});

adminRouter.delete("/athletes/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const result = await pool.query("DELETE FROM athletes WHERE id = $1 RETURNING id, team_id", [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Atleta no encontrado." });
    return;
  }

  // Si el atleta borrado pertenecía a un equipo, el conteo guardado en teams.member_count
  // queda desactualizado; se resincroniza aquí igual que en cada mutación del roster desde
  // el panel de equipos (ver adminTeams.ts).
  const teamId = result.rows[0].team_id;
  if (teamId) {
    await pool.query(
      "UPDATE teams SET member_count = (SELECT COUNT(*) FROM athletes WHERE team_id = $1), updated_at = NOW() WHERE id = $1",
      [teamId],
    );
  }

  res.status(204).send();
});

// --- Aprobar / rechazar / registrar abono --------------------------------

const paymentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), paymentId: z.string().uuid("paymentId inválido.") }),
  z.object({ action: z.literal("reject"), paymentId: z.string().uuid("paymentId inválido.") }),
  z.object({
    action: z.literal("add_payment"),
    amountBs: z.coerce.number().positive("amountBs inválido.").max(100_000_000),
    bcvRate: z.coerce.number().positive("bcvRate inválido.").max(1_000_000),
    reference: z.string().trim().min(1, "Falta la referencia.").max(50),
    bankOrigin: z.string().trim().max(50).optional(),
  }),
]);

adminRouter.patch("/athletes/:id/payment", requireAdmin, validateBody(paymentActionSchema), async (req, res) => {
  const id = String(req.params.id);
  const body = req.body as z.infer<typeof paymentActionSchema>;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const beforeRes = await client.query("SELECT payment_status FROM athletes WHERE id = $1", [id]);
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Atleta no encontrado." });
      return;
    }
    const previousPaymentStatus = beforeRes.rows[0].payment_status;

    if (body.action === "approve" || body.action === "reject") {
      const newStatus = body.action === "approve" ? "APPROVED" : "REJECTED";
      const updateRes = await client.query(
        "UPDATE payments SET status = $1 WHERE id = $2 AND athlete_id = $3 RETURNING id",
        [newStatus, body.paymentId, id],
      );
      if (updateRes.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Pago no encontrado." });
        return;
      }
    } else {
      const amountUsdEquiv = body.amountBs / body.bcvRate;
      await client.query(
        `INSERT INTO payments (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED')`,
        [id, body.amountBs, amountUsdEquiv, body.bcvRate, body.reference, body.bankOrigin ?? null],
      );
    }

    const status = await recomputeAthletePaymentStatus(client, id);
    if (!status) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Atleta no encontrado." });
      return;
    }

    const athleteRes = await client.query("SELECT * FROM athletes WHERE id = $1", [id]);
    await client.query("COMMIT");
    const athlete = athleteRes.rows[0];
    res.json({ athlete: serializeAthlete(athlete) });

    if (previousPaymentStatus !== "PAID" && status === "PAID" && athlete.email) {
      dispatchCertificateEmail({
        athleteId: athlete.id,
        fullName: athlete.full_name,
        ci: athlete.ci,
        route: athlete.route,
        jerseyCut: athlete.jersey_cut,
        jerseySize: athlete.jersey_size,
        bibNumber: athlete.bib_number,
        qrToken: athlete.qr_token,
        email: athlete.email,
      }).catch((err) => console.error("Error despachando certificado por correo:", err));
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error actualizando pago:", err);
    res.status(500).json({ error: "No se pudo actualizar el pago." });
  } finally {
    client.release();
  }
});

// --- Check-in ------------------------------------------------------------

// Lookup de solo lectura para que el escáner del paddock muestre talla/estatus
// ANTES de que el organizador confirme el check-in (que sí asigna dorsal).
adminRouter.get("/check-in/preview/:qrToken", requireAdmin, async (req, res) => {
  const { qrToken } = req.params;

  const athleteRes = await pool.query("SELECT * FROM athletes WHERE qr_token = $1", [qrToken]);
  if (athleteRes.rows.length === 0) {
    res.status(404).json({ error: "QR no reconocido." });
    return;
  }
  const athlete = athleteRes.rows[0];

  const sumRes = await pool.query(
    "SELECT COALESCE(SUM(amount_usd_equiv), 0) AS paid FROM payments WHERE athlete_id = $1 AND status = 'APPROVED'",
    [athlete.id],
  );
  const owedUsd = Math.max(Number(athlete.total_amount_usd) - Number(sumRes.rows[0].paid), 0);

  res.json({
    fullName: athlete.full_name,
    route: athlete.route,
    jerseyCut: athlete.jersey_cut,
    jerseySize: athlete.jersey_size,
    paymentStatus: athlete.payment_status,
    checkedIn: athlete.checked_in,
    bibNumber: athlete.bib_number,
    owedUsd,
  });
});

const checkInSchema = z.object({ qrToken: z.string().uuid("qrToken inválido.") });

adminRouter.post("/check-in", requireAdmin, validateBody(checkInSchema), async (req, res) => {
  const { qrToken } = req.body as z.infer<typeof checkInSchema>;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const athleteRes = await client.query("SELECT * FROM athletes WHERE qr_token = $1 FOR UPDATE", [qrToken]);
    if (athleteRes.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "QR no reconocido." });
      return;
    }
    const athlete = athleteRes.rows[0];

    if (athlete.checked_in) {
      await client.query("COMMIT");
      res.json({
        status: "already_checked_in",
        fullName: athlete.full_name,
        route: athlete.route,
        jerseyCut: athlete.jersey_cut,
        jerseySize: athlete.jersey_size,
        bibNumber: athlete.bib_number,
      });
      return;
    }

    if (athlete.payment_status !== "PAID") {
      const sumRes = await client.query(
        "SELECT COALESCE(SUM(amount_usd_equiv), 0) AS paid FROM payments WHERE athlete_id = $1 AND status = 'APPROVED'",
        [athlete.id],
      );
      const owedUsd = Math.max(Number(athlete.total_amount_usd) - Number(sumRes.rows[0].paid), 0);
      await client.query("COMMIT");
      res.json({
        status: "blocked",
        paymentStatus: athlete.payment_status,
        fullName: athlete.full_name,
        owedUsd,
      });
      return;
    }

    // El dorsal puede haber sido asignado antes desde el CRM ("Aprobar Pago Completo");
    // solo se genera uno nuevo aquí si el atleta todavía no tiene, para no pisar el
    // que ya se le comunicó por certificado.
    let bibNumber = athlete.bib_number;
    if (bibNumber == null) {
      const bibRes = await client.query("SELECT nextval('bib_number_seq') AS bib");
      bibNumber = bibRes.rows[0].bib;
    }

    await client.query(
      "UPDATE athletes SET bib_number = $1, checked_in = true, checked_in_at = NOW() WHERE id = $2",
      [bibNumber, athlete.id],
    );

    await client.query("COMMIT");
    res.json({
      status: "checked_in",
      fullName: athlete.full_name,
      route: athlete.route,
      jerseyCut: athlete.jersey_cut,
      jerseySize: athlete.jersey_size,
      bibNumber,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error en check-in:", err);
    res.status(500).json({ error: "No se pudo procesar el check-in." });
  } finally {
    client.release();
  }
});

// --- Certificado PDF -------------------------------------------------------

adminRouter.get("/athletes/:id/certificate", requireAdmin, async (req, res) => {
  const id = String(req.params.id);

  const athleteRes = await pool.query("SELECT * FROM athletes WHERE id = $1", [id]);
  if (athleteRes.rows.length === 0) {
    res.status(404).json({ error: "Atleta no encontrado." });
    return;
  }
  const athlete = athleteRes.rows[0];

  const pdfBuffer = await generateCertificatePdf({
    athleteId: athlete.id,
    fullName: athlete.full_name,
    ci: athlete.ci,
    route: athlete.route,
    jerseyCut: athlete.jersey_cut,
    jerseySize: athlete.jersey_size,
    bibNumber: athlete.bib_number,
    qrToken: athlete.qr_token,
    email: athlete.email ?? "",
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="certificado-${athlete.ci}.pdf"`);
  res.send(pdfBuffer);
});

// --- Exportación CSV -------------------------------------------------------

adminRouter.get("/export", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, t.name AS team_name FROM athletes a LEFT JOIN teams t ON t.id = a.team_id ORDER BY a.route, a.full_name`,
  );

  const header = ["Dorsal", "Nombre", "Cédula", "Teléfono", "Equipo", "Ruta", "Corte", "Talla", "Estatus de Pago", "Check-in", "Fecha Check-in"];
  const lines = [header.join(",")];

  const sizeCountsByCut: Record<string, Record<string, number>> = {
    caballero: Object.fromEntries(JERSEY_SIZES_BY_CUT.caballero.map((s) => [s, 0])),
    dama: Object.fromEntries(JERSEY_SIZES_BY_CUT.dama.map((s) => [s, 0])),
  };

  for (const a of rows) {
    lines.push(
      [
        a.bib_number ?? "",
        csvEscape(a.full_name),
        a.ci,
        a.phone,
        csvEscape(a.team_name ?? ""),
        a.route,
        a.jersey_cut,
        a.jersey_size,
        a.payment_status,
        a.checked_in ? "SI" : "NO",
        a.checked_in_at ? new Date(a.checked_in_at).toISOString() : "",
      ].join(","),
    );

    if (sizeCountsByCut[a.jersey_cut] && a.jersey_size in sizeCountsByCut[a.jersey_cut]) {
      sizeCountsByCut[a.jersey_cut][a.jersey_size] += 1;
    }
  }

  for (const cut of JERSEY_CUTS) {
    lines.push("");
    lines.push(`RESUMEN DE TALLAS — ${cut.toUpperCase()}`);
    for (const size of JERSEY_SIZES_BY_CUT[cut]) {
      lines.push(`${size},${sizeCountsByCut[cut][size]}`);
    }
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="corredores-reto-virgen-de-la-paz.csv"');
  res.send(lines.join("\n"));
});
