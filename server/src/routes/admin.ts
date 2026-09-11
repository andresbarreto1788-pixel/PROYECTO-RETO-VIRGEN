import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireAdmin, signAdminToken } from "../middleware/auth.js";
import { serializeAthlete } from "../lib/serialize.js";

export const adminRouter = Router();

const JERSEY_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

async function recomputeAthletePaymentStatus(client: PoolClient, athleteId: string): Promise<string | null> {
  const totalRes = await client.query("SELECT total_amount_usd FROM athletes WHERE id = $1", [athleteId]);
  if (totalRes.rows.length === 0) return null;
  const total = Number(totalRes.rows[0].total_amount_usd);

  const sumRes = await client.query(
    "SELECT COALESCE(SUM(amount_usd_equiv), 0) AS paid FROM payments WHERE athlete_id = $1 AND status = 'APPROVED'",
    [athleteId],
  );
  const paid = Number(sumRes.rows[0].paid);

  let status: string;
  if (total > 0 && paid >= total) {
    status = "PAID";
  } else if (paid > 0) {
    status = "PARTIAL";
  } else {
    const pendingRes = await client.query(
      "SELECT 1 FROM payments WHERE athlete_id = $1 AND status = 'PENDING' LIMIT 1",
      [athleteId],
    );
    status = pendingRes.rows.length > 0 ? "PENDING_REVIEW" : "REJECTED";
  }

  await client.query("UPDATE athletes SET payment_status = $1 WHERE id = $2", [status, athleteId]);
  return status;
}

// --- Auth -------------------------------------------------------------

adminRouter.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };

  if (!password || password !== process.env.ADMIN_PASSWORD) {
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
  if (req.query.paymentStatus) {
    params.push(req.query.paymentStatus);
    conditions.push(`a.payment_status = $${params.length}`);
  }
  if (req.query.checkedIn !== undefined) {
    params.push(req.query.checkedIn === "true");
    conditions.push(`a.checked_in = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM athletes a ${whereClause}`, params);

  const listParams = [...params, pageSize, offset];
  const itemsRes = await pool.query(
    `SELECT a.*,
        COALESCE(paid.paid_usd, 0) AS paid_amount_usd,
        COALESCE(pays.payments, '[]') AS payments
     FROM athletes a
     LEFT JOIN (
       SELECT athlete_id, SUM(amount_usd_equiv) AS paid_usd
       FROM payments WHERE status = 'APPROVED' GROUP BY athlete_id
     ) paid ON paid.athlete_id = a.id
     LEFT JOIN (
       SELECT athlete_id, json_agg(p.* ORDER BY p.created_at DESC) AS payments
       FROM payments p GROUP BY athlete_id
     ) pays ON pays.athlete_id = a.id
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

// --- Aprobar / rechazar / registrar abono --------------------------------

interface PaymentActionBody {
  action: "approve" | "reject" | "add_payment";
  paymentId?: string;
  amountBs?: number;
  bcvRate?: number;
  reference?: string;
  bankOrigin?: string;
}

adminRouter.patch("/athletes/:id/payment", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const body = req.body as PaymentActionBody;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (body.action === "approve" || body.action === "reject") {
      if (!body.paymentId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Falta paymentId." });
        return;
      }

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
    } else if (body.action === "add_payment") {
      if (!body.amountBs || !body.bcvRate || !body.reference) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Faltan amountBs, bcvRate o reference." });
        return;
      }

      const amountUsdEquiv = body.amountBs / body.bcvRate;
      await client.query(
        `INSERT INTO payments (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED')`,
        [id, body.amountBs, amountUsdEquiv, body.bcvRate, body.reference, body.bankOrigin ?? null],
      );
    } else {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Acción inválida." });
      return;
    }

    const status = await recomputeAthletePaymentStatus(client, id);
    if (!status) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Atleta no encontrado." });
      return;
    }

    const athleteRes = await client.query("SELECT * FROM athletes WHERE id = $1", [id]);
    await client.query("COMMIT");
    res.json({ athlete: serializeAthlete(athleteRes.rows[0]) });
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
    jerseySize: athlete.jersey_size,
    paymentStatus: athlete.payment_status,
    checkedIn: athlete.checked_in,
    bibNumber: athlete.bib_number,
    owedUsd,
  });
});

adminRouter.post("/check-in", requireAdmin, async (req, res) => {
  const { qrToken } = req.body as { qrToken?: string };
  if (!qrToken) {
    res.status(400).json({ error: "Falta qrToken." });
    return;
  }

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

    const bibRes = await client.query("SELECT nextval('bib_number_seq') AS bib");
    const bibNumber = bibRes.rows[0].bib;

    await client.query(
      "UPDATE athletes SET bib_number = $1, checked_in = true, checked_in_at = NOW() WHERE id = $2",
      [bibNumber, athlete.id],
    );

    await client.query("COMMIT");
    res.json({
      status: "checked_in",
      fullName: athlete.full_name,
      route: athlete.route,
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

// --- Exportación CSV -------------------------------------------------------

adminRouter.get("/export", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM athletes ORDER BY route, full_name");

  const header = ["Dorsal", "Nombre", "Cédula", "Teléfono", "Ruta", "Talla", "Estatus de Pago", "Check-in", "Fecha Check-in"];
  const lines = [header.join(",")];

  const sizeCounts: Record<string, number> = { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };

  for (const a of rows) {
    lines.push(
      [
        a.bib_number ?? "",
        csvEscape(a.full_name),
        a.ci,
        a.phone,
        a.route,
        a.jersey_size,
        a.payment_status,
        a.checked_in ? "SI" : "NO",
        a.checked_in_at ? new Date(a.checked_in_at).toISOString() : "",
      ].join(","),
    );

    if (a.jersey_size in sizeCounts) sizeCounts[a.jersey_size] += 1;
  }

  lines.push("");
  lines.push("RESUMEN DE TALLAS");
  for (const size of JERSEY_SIZES) {
    lines.push(`${size},${sizeCounts[size]}`);
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="corredores-reto-virgen-de-la-paz.csv"');
  res.send(lines.join("\n"));
});
