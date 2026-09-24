import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { persistValidatedProof, uploadProof } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { registerLimiter } from "../middleware/rateLimit.js";
import { serializeAthlete, serializeTeam } from "../lib/serialize.js";
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
  zelle: "Zelle",
  "binance-pay": "Binance Pay",
};

const PAYMENT_METHODS = ["pago-movil", "transferencia", "zelle", "binance-pay"] as const;

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

const JERSEY_SIZES_BY_CUT: Record<string, readonly string[]> = {
  caballero: ["S", "M", "L", "XL", "XXL"],
  dama: ["XS", "S", "M", "L", "XL"],
};

// Debe mantenerse igual a ROUTE_MODALITIES[].priceUsd en src/data/raceData.ts. Se
// recalcula aquí (en vez de confiar en el monto que manda el cliente) porque el precio
// por integrante es la base del descuento grupal.
const MODALITY_PRICE_USD: Record<string, number> = {
  "reto-33k": 30,
  "reto-22k": 30,
};

const TEAM_MIN_SIZE = 2;
const TEAM_MAX_SIZE = 80;
const TEAM_DISCOUNT_MIN_SIZE = 10;
const TEAM_DISCOUNT_PERCENT = 10;

const registerSchema = z
  .object({
    fullName: z.string().trim().min(3, "Nombre inválido.").max(150),
    idNumber: idNumberSchema,
    phone: phoneSchema,
    email: emailSchema,
    emergencyContact: z.string().trim().min(3, "Contacto de emergencia inválido.").max(100),
    bloodType: z.enum(["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"], { message: "Tipo de sangre inválido." }),
    modality: z.enum(["reto-33k", "reto-22k"], { message: "Modalidad inválida." }),
    jerseyCut: z.enum(["caballero", "dama"], { message: "Corte de jersey inválido." }),
    jerseySize: z.enum(["XS", "S", "M", "L", "XL", "XXL"], { message: "Talla inválida." }),
    paymentMethod: z.enum(PAYMENT_METHODS, { message: "Método de pago inválido." }),
    paymentReference: z.string().trim().min(1, "Falta la referencia de pago.").max(50),
    paymentPlan: z.enum(["full", "partial"], { message: "Plan de pago inválido." }),
    amountUsd: z.coerce.number().positive("Monto inválido.").max(100_000),
    bcvRate: z.coerce.number().positive("Tasa BCV inválida.").max(1_000_000),
    paidAmountBs: z.coerce.number().positive().max(100_000_000).optional(),
    paidAmountUsd: z.coerce.number().positive().max(100_000).optional(),
  })
  .refine((data) => JERSEY_SIZES_BY_CUT[data.jerseyCut]?.includes(data.jerseySize), {
    message: "La talla no corresponde al corte seleccionado.",
    path: ["jerseySize"],
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
          (full_name, ci, phone, email, emergency_contact, blood_type, route, jersey_cut, jersey_size, payment_status, total_amount_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          body.fullName,
          body.idNumber,
          body.phone,
          body.email,
          body.emergencyContact,
          body.bloodType,
          route,
          body.jerseyCut,
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

// --- Inscripción grupal (equipos) ----------------------------------------

const teamMemberSchema = z
  .object({
    fullName: z.string().trim().min(3, "Nombre inválido.").max(150),
    idNumber: idNumberSchema,
    phone: phoneSchema,
    email: emailSchema.optional(),
    emergencyContact: z.string().trim().min(3, "Contacto de emergencia inválido.").max(100),
    bloodType: z.enum(["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"], { message: "Tipo de sangre inválido." }),
    jerseyCut: z.enum(["caballero", "dama"], { message: "Corte de jersey inválido." }),
    jerseySize: z.enum(["XS", "S", "M", "L", "XL", "XXL"], { message: "Talla inválida." }),
  })
  .refine((data) => JERSEY_SIZES_BY_CUT[data.jerseyCut]?.includes(data.jerseySize), {
    message: "La talla no corresponde al corte seleccionado.",
    path: ["jerseySize"],
  });

const registerTeamSchema = z.object({
  teamName: z.string().trim().min(3, "Nombre de equipo inválido.").max(150),
  modality: z.enum(["reto-33k", "reto-22k"], { message: "Modalidad inválida." }),
  captainFullName: z.string().trim().min(3, "Nombre del capitán inválido.").max(150),
  captainPhone: phoneSchema,
  captainEmail: emailSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS, { message: "Método de pago inválido." }),
  paymentReference: z.string().trim().min(1, "Falta la referencia de pago.").max(50),
  bcvRate: z.coerce.number().positive("Tasa BCV inválida.").max(1_000_000),
  membersJson: z.string().min(2, "Faltan los integrantes del equipo."),
});

registerRouter.post(
  "/team",
  registerLimiter,
  uploadProof.single("proof"),
  persistValidatedProof,
  validateBody(registerTeamSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof registerTeamSchema>;

    if (!req.file) {
      res.status(400).json({ error: "Debes adjuntar el comprobante de pago." });
      return;
    }

    let rawMembers: unknown;
    try {
      rawMembers = JSON.parse(body.membersJson);
    } catch {
      res.status(400).json({ error: "Los datos de los integrantes son inválidos." });
      return;
    }

    const membersResult = z.array(teamMemberSchema).safeParse(rawMembers);
    if (!membersResult.success) {
      res.status(400).json({ error: membersResult.error.issues[0]?.message ?? "Datos de integrantes inválidos." });
      return;
    }
    const members = membersResult.data;

    if (members.length < TEAM_MIN_SIZE) {
      res.status(400).json({ error: `Un equipo necesita al menos ${TEAM_MIN_SIZE} integrantes.` });
      return;
    }
    if (members.length > TEAM_MAX_SIZE) {
      res.status(400).json({ error: `Un equipo no puede tener más de ${TEAM_MAX_SIZE} integrantes.` });
      return;
    }

    const idNumbers = members.map((m) => m.idNumber.toUpperCase());
    if (new Set(idNumbers).size !== idNumbers.length) {
      res.status(400).json({ error: "Hay cédulas o pasaportes repetidos entre los integrantes del equipo." });
      return;
    }

    const route = MODALITY_TO_ROUTE[body.modality];
    const pricePerMemberUsd = MODALITY_PRICE_USD[body.modality];
    const memberCount = members.length;
    const discountPercent = memberCount >= TEAM_DISCOUNT_MIN_SIZE ? TEAM_DISCOUNT_PERCENT : 0;
    const subtotalUsd = Math.round(pricePerMemberUsd * memberCount * 100) / 100;
    const totalUsd = Math.round(subtotalUsd * (1 - discountPercent / 100) * 100) / 100;
    const perMemberUsd = Math.round(pricePerMemberUsd * (1 - discountPercent / 100) * 100) / 100;
    const perMemberBs = Math.round(perMemberUsd * body.bcvRate * 100) / 100;
    const proofUrl = `/uploads/${req.file.filename}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const teamResult = await client.query(
        `INSERT INTO teams
          (name, route, member_count, discount_percent, captain_full_name, captain_phone, captain_email, subtotal_amount_usd, total_amount_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          body.teamName,
          route,
          memberCount,
          discountPercent,
          body.captainFullName,
          body.captainPhone,
          body.captainEmail ?? null,
          subtotalUsd,
          totalUsd,
        ],
      );
      const team = teamResult.rows[0];

      const athletes = [];
      for (const member of members) {
        const athleteResult = await client.query(
          `INSERT INTO athletes
            (full_name, ci, phone, email, emergency_contact, blood_type, route, jersey_cut, jersey_size, payment_status, total_amount_usd, team_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_REVIEW', $10, $11)
           RETURNING *`,
          [
            member.fullName,
            member.idNumber,
            member.phone,
            member.email ?? null,
            member.emergencyContact,
            member.bloodType,
            route,
            member.jerseyCut,
            member.jerseySize,
            perMemberUsd,
            team.id,
          ],
        );
        const athlete = athleteResult.rows[0];

        await client.query(
          `INSERT INTO payments
            (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, proof_url, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
          [
            athlete.id,
            perMemberBs,
            perMemberUsd,
            body.bcvRate,
            body.paymentReference,
            PAYMENT_METHOD_LABEL[body.paymentMethod] ?? body.paymentMethod,
            proofUrl,
          ],
        );

        athletes.push(athlete);
      }

      await client.query("COMMIT");

      res.status(201).json({
        team: serializeTeam(team),
        athletes: athletes.map((a) => ({ athlete: serializeAthlete(a), qrToken: a.qr_token })),
      });

      metaWhatsAppService.sendOrganizerAlert(
        `🆕 Nuevo equipo inscrito: "${team.name}" · ${memberCount} integrantes · ${ROUTE_LABELS[route] ?? route} · ` +
          `$${totalUsd}${discountPercent > 0 ? ` (10% dto. aplicado)` : ""} · Capitán: ${body.captainFullName} (${body.captainPhone})`,
      );
    } catch (err) {
      await client.query("ROLLBACK");

      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        res.status(409).json({ error: "Ya existe una inscripción con la cédula de uno de los integrantes." });
        return;
      }

      console.error("Error registrando equipo:", err);
      res.status(500).json({ error: "No se pudo completar la inscripción del equipo." });
    } finally {
      client.release();
    }
  },
);
