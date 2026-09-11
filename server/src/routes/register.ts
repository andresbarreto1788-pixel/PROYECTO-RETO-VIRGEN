import { Router } from "express";
import { pool } from "../db/pool.js";
import { uploadProof } from "../middleware/upload.js";
import { serializeAthlete } from "../lib/serialize.js";

export const registerRouter = Router();

const MODALITY_TO_ROUTE: Record<string, string> = {
  "reto-33k": "33K_REDOMA",
  "reto-22k": "22K_ILUSTRES",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  "pago-movil": "Pago Móvil",
  efectivo: "Efectivo",
};

const REQUIRED_FIELDS = [
  "fullName",
  "idNumber",
  "phone",
  "emergencyContact",
  "bloodType",
  "modality",
  "jerseySize",
  "paymentMethod",
  "paymentReference",
  "paymentPlan",
  "amountUsd",
  "bcvRate",
] as const;

registerRouter.post("/", uploadProof.single("proof"), async (req, res) => {
  const body = req.body as Record<string, string | undefined>;

  const missing = REQUIRED_FIELDS.filter((field) => !body[field]);
  if (missing.length > 0) {
    res.status(400).json({ error: `Faltan campos obligatorios: ${missing.join(", ")}` });
    return;
  }

  const route = MODALITY_TO_ROUTE[body.modality!];
  if (!route) {
    res.status(400).json({ error: "Modalidad inválida." });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Debes adjuntar el comprobante de pago." });
    return;
  }

  const amountUsd = Number(body.amountUsd);
  const bcvRate = Number(body.bcvRate);
  const paidAmountBs = Number(body.paidAmountBs ?? amountUsd * bcvRate);
  const paidAmountUsd = Number(body.paidAmountUsd ?? paidAmountBs / bcvRate);
  const paymentStatus = body.paymentPlan === "partial" ? "PARTIAL" : "PENDING_REVIEW";
  const proofUrl = `/uploads/${req.file.filename}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const athleteResult = await client.query(
      `INSERT INTO athletes
        (full_name, ci, phone, emergency_contact, blood_type, route, jersey_size, payment_status, total_amount_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        body.fullName,
        body.idNumber,
        body.phone,
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
        PAYMENT_METHOD_LABEL[body.paymentMethod!] ?? body.paymentMethod,
        proofUrl,
      ],
    );

    await client.query("COMMIT");

    res.status(201).json({ athlete: serializeAthlete(athlete), qrToken: athlete.qr_token });
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
});
