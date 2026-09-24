import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import { serializeAthlete, serializeTeamSummary } from "../lib/serialize.js";
import { recomputeAthletePaymentStatus } from "../services/paymentService.js";
import { fetchBcvRate } from "../services/bcvService.js";
import { dispatchCertificateEmail } from "../services/certificateDispatch.js";
import type { AthleteCertificateData } from "../services/certificateService.js";
import { ATHLETE_WITH_PAYMENTS_SELECT } from "./admin.js";

export const adminTeamsRouter = Router();

// Agrega en vivo sobre athletes/payments en vez de confiar en teams.member_count, que
// solo se fija en el registro inicial y queda desactualizado si el roster cambia después
// desde el panel (Fase 2: agregar/quitar integrantes).
const TEAM_SUMMARY_SELECT = `
  SELECT t.*,
      COALESCE(m.live_count, 0)::int AS live_member_count,
      COALESCE(m.paid, 0)::int AS paid_members,
      COALESCE(m.partial, 0)::int AS partial_members,
      COALESCE(m.pending, 0)::int AS pending_members,
      COALESCE(m.rejected, 0)::int AS rejected_members,
      COALESCE(m.checked_in, 0)::int AS checked_in_members,
      COALESCE(m.members_total, 0) AS members_total_usd,
      COALESCE(m.paid_usd, 0) AS paid_amount_usd,
      m.proof_url
   FROM teams t
   LEFT JOIN (
     SELECT a.team_id,
       COUNT(*) AS live_count,
       COUNT(*) FILTER (WHERE a.payment_status = 'PAID') AS paid,
       COUNT(*) FILTER (WHERE a.payment_status = 'PARTIAL') AS partial,
       COUNT(*) FILTER (WHERE a.payment_status = 'PENDING_REVIEW') AS pending,
       COUNT(*) FILTER (WHERE a.payment_status = 'REJECTED') AS rejected,
       COUNT(*) FILTER (WHERE a.checked_in) AS checked_in,
       SUM(a.total_amount_usd) AS members_total,
       COALESCE(SUM(pa.approved_usd), 0) AS paid_usd,
       MIN(pa.any_proof) AS proof_url
     FROM athletes a
     LEFT JOIN LATERAL (
       SELECT SUM(p.amount_usd_equiv) FILTER (WHERE p.status = 'APPROVED') AS approved_usd,
              MIN(p.proof_url) AS any_proof
       FROM payments p WHERE p.athlete_id = a.id
     ) pa ON TRUE
     WHERE a.team_id IS NOT NULL
     GROUP BY a.team_id
   ) m ON m.team_id = t.id
`;

// --- Listado de equipos --------------------------------------------------

adminTeamsRouter.get("/", requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (req.query.route) {
    params.push(req.query.route);
    conditions.push(`t.route = $${params.length}`);
  }
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    params.push(`%${req.query.q.trim()}%`);
    const i = params.length;
    conditions.push(`(t.name ILIKE $${i} OR t.captain_full_name ILIKE $${i} OR t.captain_phone ILIKE $${i})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM teams t ${whereClause}`, params);

  const listParams = [...params, pageSize, offset];
  const itemsRes = await pool.query(
    `${TEAM_SUMMARY_SELECT}
     ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  res.json({
    items: itemsRes.rows.map(serializeTeamSummary),
    total: totalRes.rows[0].count,
    page,
    pageSize,
  });
});

// Ficha completa de un equipo: resumen + roster de integrantes (mismo shape que usa
// Control de Atletas, así la ficha puede reutilizar los mismos botones de acción).
adminTeamsRouter.get("/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);

  const teamRes = await pool.query(`${TEAM_SUMMARY_SELECT} WHERE t.id = $1`, [id]);
  if (teamRes.rows.length === 0) {
    res.status(404).json({ error: "Equipo no encontrado." });
    return;
  }

  const membersRes = await pool.query(
    `${ATHLETE_WITH_PAYMENTS_SELECT} WHERE a.team_id = $1 ORDER BY a.full_name`,
    [id],
  );

  res.json({
    team: serializeTeamSummary(teamRes.rows[0]),
    members: membersRes.rows.map(serializeAthlete),
  });
});

// --- Aprobar el pago del equipo completo ----------------------------------

// Aprueba de un clic los pagos PENDING de todos los integrantes del equipo (el pago
// combinado que subió el capitán se reparte en una fila de payments por integrante desde
// el registro, ver routes/register.ts). Espeja el criterio de
// paymentService.approveFullPaymentAndAssignBib para cada miembro (cierra saldo residual
// con un pago sintético, asigna dorsal, despacha certificado), pero:
//  - usa UNA sola conexión/transacción para todo el equipo en vez de una por atleta,
//  - obtiene la tasa BCV una sola vez ANTES de abrir la transacción (nunca dentro, y
//    nunca por miembro),
//  - despacha los certificados en serie y después del commit, nunca en paralelo — cada
//    envío genera un PDF en memoria y abre su propia conexión SMTP.
adminTeamsRouter.post("/:id/approve-payments", requireAdmin, async (req, res) => {
  const id = String(req.params.id);

  const teamRes = await pool.query("SELECT id FROM teams WHERE id = $1", [id]);
  if (teamRes.rows.length === 0) {
    res.status(404).json({ error: "Equipo no encontrado." });
    return;
  }

  let bcvRate: number;
  try {
    bcvRate = await fetchBcvRate();
  } catch (err) {
    console.error("Error obteniendo tasa BCV para aprobar pagos del equipo:", err);
    res.status(503).json({ error: "No se pudo obtener la tasa BCV. Intenta de nuevo en un momento." });
    return;
  }

  const client = await pool.connect();
  let committed = false;
  const certificateQueue: AthleteCertificateData[] = [];
  let approvedCount = 0;
  let alreadyPaidCount = 0;
  let bibsAssigned = 0;
  let membersWithoutEmail = 0;

  try {
    await client.query("BEGIN");

    // ORDER BY id: orden de bloqueo determinista para que esta aprobación masiva y un
    // check-in concurrente sobre el mismo equipo nunca se puedan abrazar en deadlock.
    const membersRes = await client.query("SELECT * FROM athletes WHERE team_id = $1 ORDER BY id FOR UPDATE", [id]);

    for (const athlete of membersRes.rows) {
      if (athlete.payment_status === "PAID") {
        alreadyPaidCount++;
        continue;
      }

      await client.query("UPDATE payments SET status = 'APPROVED' WHERE athlete_id = $1 AND status = 'PENDING'", [
        athlete.id,
      ]);

      const sumRes = await client.query(
        "SELECT COALESCE(SUM(amount_usd_equiv), 0) AS paid FROM payments WHERE athlete_id = $1 AND status = 'APPROVED'",
        [athlete.id],
      );
      const paid = Number(sumRes.rows[0].paid);
      const owed = Math.max(Number(athlete.total_amount_usd) - paid, 0);

      if (owed > 0) {
        const amountBs = owed * bcvRate;
        await client.query(
          `INSERT INTO payments (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, status)
           VALUES ($1, $2, $3, $4, 'APROBACION-EQUIPO', 'CRM', 'APPROVED')`,
          [athlete.id, amountBs, owed, bcvRate],
        );
      }

      const status = await recomputeAthletePaymentStatus(client, athlete.id);
      if (status !== "PAID") continue;

      approvedCount++;

      let bibNumber = athlete.bib_number;
      if (bibNumber == null) {
        const bibRes = await client.query("SELECT nextval('bib_number_seq') AS bib");
        bibNumber = bibRes.rows[0].bib;
        await client.query("UPDATE athletes SET bib_number = $1 WHERE id = $2", [bibNumber, athlete.id]);
        bibsAssigned++;
      }

      if (athlete.email) {
        certificateQueue.push({
          athleteId: athlete.id,
          fullName: athlete.full_name,
          ci: athlete.ci,
          route: athlete.route,
          jerseyCut: athlete.jersey_cut,
          jerseySize: athlete.jersey_size,
          bibNumber,
          qrToken: athlete.qr_token,
          email: athlete.email,
        });
      } else {
        membersWithoutEmail++;
      }
    }

    await client.query("COMMIT");
    committed = true;
  } catch (err) {
    if (!committed) await client.query("ROLLBACK");
    console.error("Error aprobando pagos del equipo:", err);
    res.status(500).json({ error: "No se pudo aprobar el pago del equipo." });
    return;
  } finally {
    client.release();
  }

  res.json({
    approvedCount,
    alreadyPaidCount,
    bibsAssigned,
    certificatesQueued: certificateQueue.length,
    membersWithoutEmail,
  });

  // Después del commit + de responder: en serie, nunca en paralelo (ver comentario arriba).
  void (async () => {
    for (const data of certificateQueue) {
      await dispatchCertificateEmail(data).catch((err) =>
        console.error("Error despachando certificado tras aprobación de equipo:", err),
      );
    }
  })();
});
