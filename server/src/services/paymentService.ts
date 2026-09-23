import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { fetchBcvRate } from "./bcvService.js";
import { dispatchCertificateEmail } from "./certificateDispatch.js";

export async function recomputeAthletePaymentStatus(client: PoolClient, athleteId: string): Promise<string | null> {
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

export interface ApproveFullPaymentResult {
  athlete: Record<string, unknown>;
  becamePaid: boolean;
}

// Usado por el botón "Aprobar Pago Completo" del CRM: cierra el saldo pendiente con un
// pago sintético (para que el ledger de `payments` siga cuadrando con total_amount_usd),
// y si con eso el atleta queda PAID, asigna dorsal de una vez (con el mismo bloqueo de fila
// que usa el check-in, para que ambos puntos de entrada no puedan asignar dos dorsales).
export async function approveFullPaymentAndAssignBib(athleteId: string): Promise<ApproveFullPaymentResult | null> {
  const client = await pool.connect();
  let becamePaid: boolean;
  try {
    await client.query("BEGIN");

    const athleteRes = await client.query("SELECT * FROM athletes WHERE id = $1 FOR UPDATE", [athleteId]);
    if (athleteRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const before = athleteRes.rows[0];
    const previousStatus = before.payment_status;

    const sumRes = await client.query(
      "SELECT COALESCE(SUM(amount_usd_equiv), 0) AS paid FROM payments WHERE athlete_id = $1 AND status = 'APPROVED'",
      [athleteId],
    );
    const paid = Number(sumRes.rows[0].paid);
    const owed = Math.max(Number(before.total_amount_usd) - paid, 0);

    if (owed > 0) {
      const bcvRate = await fetchBcvRate();
      const amountBs = owed * bcvRate;
      await client.query(
        `INSERT INTO payments (athlete_id, amount_bs, amount_usd_equiv, bcv_rate, reference, bank_origin, status)
         VALUES ($1, $2, $3, $4, 'APROBACION-MANUAL-CRM', 'CRM', 'APPROVED')`,
        [athleteId, amountBs, owed, bcvRate],
      );
    }

    const status = await recomputeAthletePaymentStatus(client, athleteId);
    becamePaid = previousStatus !== "PAID" && status === "PAID";

    if (status === "PAID" && before.bib_number == null) {
      const bibRes = await client.query("SELECT nextval('bib_number_seq') AS bib");
      await client.query("UPDATE athletes SET bib_number = $1 WHERE id = $2", [bibRes.rows[0].bib, athleteId]);
    }

    const afterRes = await client.query("SELECT * FROM athletes WHERE id = $1", [athleteId]);
    await client.query("COMMIT");

    const athlete = afterRes.rows[0];

    if (becamePaid && athlete.email) {
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
      }).catch((err) => console.error("Error despachando certificado tras aprobación manual:", err));
    }

    return { athlete, becamePaid };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
