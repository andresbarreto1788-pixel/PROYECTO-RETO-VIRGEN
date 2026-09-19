import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { persistValidatedProof, uploadProof } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { registerLimiter } from "../middleware/rateLimit.js";
import { serializeAthlete } from "../lib/serialize.js";
import * as metaWhatsAppService from "../services/metaWhatsAppService.js";

export const registerRouter = Router();

const MODALITY_TO_ROUTE: Record<string, string> = {
  "reto-33k": "33K_REDOMA",
  "reto-22k": "22K_ILUSTRES",
};

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  "pago-movil": "Pago Móvil",
  transferencia: "Transferencia",
};

// idNumber acepta cédula (V-12345678) o pasaporte (formatos alfanuméricos variados),
// por eso el patrón es permisivo en forma y solo acota longitud/caracteres válidos.
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

const emailSchema = z.string().trim().toLowerCase().email("Correo electrónico inválido.").max(150);

const registerSchema = z.object({
  fullName: z.string().trim().min(3, "Nombre inválido.").max(150),
  idNumber: idNumberSchema,
  phone: phoneSchema,
  email: emailSchema,
  emergencyContact: z.string().trim().min(3, "Contacto de emergencia inválido.").max(100),
  bloodType: z.enum(["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"], { message: "Tipo de sangre inválido." }),
  modality: z.enum(["reto-33k", "reto-22k"], { message: "Modalidad inválida." }),
  jerseySize: z.enum(["S", "M", "L", "XL", "XXL"], { message: "Talla inválida." }),
  paymentMethod: z.enum(["pago-movil", "transferencia"], { message: "Método de pago inválido." }),
  paymentReference: z.string().trim().min(1, "Falta la referencia de pago.").max(50),
  paymentPlan: z.enum(["full", "partial"], { message: "Plan de pago inválido." }),
  amountUsd: z.coerce.number().positive("Monto inválido.").max(100_000),
  bcvRate: z.coerce.number().positive("Tasa BCV inválida.").max(1_000_000),
  paidAmountBs: z.coerce.number().positive().max(100_000_000).optional(),
  paidAmountUsd: z.coerce.number().positive().max(100_000).optional(),
});

registerRouter.post(
  "/",
  registerLimiter,
  uploadProof.single("proof"),
  persistValidatedProof,
  validateBody(registerSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof registerSchema>;

    const route = MODALITY_TO_ROUTE[body.modality];

    if (!req.file) {
      res.status(400).json({ error: "Debes adjuntar el comprobante de pago." });
      return;
    }

    const amountUsd = body.amountUsd;
    const bcvRate = body.bcvRate;
    const paidAmountBs = body.paidAmountBs ?? amountUsd * bcvRate;
    const paidAmountUsd = body.paidAmountUsd ?? paidAmountBs / bcvRate;
    const paymentStatus = body.paymentPlan === "partial" ? "PARTIAL" : "PENDING_REVIEW";
    const proofUrl = `/uploads/${req.file.filename}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const athleteResult = await client.query(
        `INSERT INTO athletes
          (full_name, ci, phone, email, emergency_contact, blood_type, route, jersey_size, payment_status, total_amount_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          body.fullName,
          body.idNumber,
          body.phone,
          body.email,
          body.emergencyContact,
          body.bloodType,
          route,
          body.jerseySize,
          paymentStatus,
          amountUsd,
        ],
      );
      const athlete = athleteResult.rows[0];

      await client.query(
        `INSERT INTO payments
          (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, proof_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
        [
          athlete.id,
          paidAmountBs,
          paidAmountUsd,
          bcvRate,
          body.paymentReference,
          PAYMENT_METHOD_LABEL[body.paymentMethod] ?? body.paymentMethod,
          proofUrl,
        ],
      );

      await client.query("COMMIT");

      res.status(201).json({ athlete: serializeAthlete(athlete), qrToken: athlete.qr_token });

      // Alerta al organizador — no bloquea la respuesta al atleta si Meta tarda o falla.
      metaWhatsAppService.sendOrganizerAlert(
        `🆕 Nueva inscripción: ${athlete.full_name} · ${ROUTE_LABELS[route] ?? route} · $${amountUsd} · ` +
          `${PAYMENT_METHOD_LABEL[body.paymentMethod] ?? body.paymentMethod} (${paymentStatus})`,
      );
    } catch (err) {
      await client.query("ROLLBACK");

      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        res.status(409).json({ error: "Ya existe una inscripción con esa cédula." });
        return;
      }

      console.error("Error registrando atleta:", err);
      res.status(500).json({ error: "No se pudo completar la inscripción." });
    } finally {
      client.release();
    }
  },
);
