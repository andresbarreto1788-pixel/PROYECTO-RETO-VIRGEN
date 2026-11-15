import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { recomputeAthletePaymentStatus } from "./paymentService.js";

// Fusiona inscripciones duplicadas de una misma persona. La cédula es única por atleta
// pero el formulario la guarda tal cual se escribe ("V-12345678", "12345678", "v12345678"),
// así que la restricción UNIQUE de la base no detecta esos duplicados.
//
// Es conservador a propósito: solo fusiona grupos donde es seguro hacerlo sin intervención
// humana y reporta el resto para revisión manual.

export type SkipReason = "NAME_MISMATCH" | "TEAM_MEMBER" | "MULTIPLE_BIBS";

interface AthleteRow {
  id: string;
  full_name: string;
  ci: string;
  email: string | null;
  state: string | null;
  payment_status: string;
  bib_number: number | null;
  checked_in: boolean;
  checked_in_at: Date | null;
  qr_token: string;
  team_id: string | null;
  created_at: Date;
}

interface PaymentRow {
  id: string;
  athlete_id: string;
  reference: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: Date;
}

export interface MergedGroupReport {
  key: string;
  survivor: { id: string; fullName: string; ci: string };
  absorbed: { id: string; fullName: string; ci: string }[];
  paymentsMoved: number;
  duplicatePaymentsRejected: number;
  statusBefore: string;
  statusAfter: string | null;
}

export interface SkippedGroupReport {
  key: string;
  reason: SkipReason;
  athletes: { id: string; fullName: string; ci: string }[];
}

export interface MergeReport {
  dryRun: boolean;
  merged: MergedGroupReport[];
  skipped: SkippedGroupReport[];
}

// V-12345678, v12345678 y 12345678 son la misma persona. Los pasaportes (alfanuméricos)
// se comparan completos, sin guiones ni espacios.
export function duplicateKey(ci: string): string {
  const normalized = ci.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = normalized.match(/^[VE]?(\d+)$/);
  return match ? match[1] : normalized;
}

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length > 1),
  );
}

// Los nombres coinciden si son iguales o uno contiene al otro (p. ej. falta el 2º apellido).
// Protege contra fusionar a dos personas distintas por una cédula mal escrita.
function namesCompatible(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const aInB = [...ta].every((t) => tb.has(t));
  const bInA = [...tb].every((t) => ta.has(t));
  return aInB || bInA;
}

const STATUS_RANK: Record<string, number> = { PAID: 0, PARTIAL: 1, PENDING_REVIEW: 2, REJECTED: 3 };
const PAYMENT_RANK: Record<string, number> = { APPROVED: 0, PENDING: 1, REJECTED: 2 };

// Sobrevive la inscripción que ya tiene dorsal, luego la que hizo check-in, luego la de
// mejor estado de pago y, a igualdad, la más antigua.
function pickSurvivor(rows: AthleteRow[]): AthleteRow {
  return [...rows].sort((a, b) => {
    if ((a.bib_number != null) !== (b.bib_number != null)) return a.bib_number != null ? -1 : 1;
    if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
    const sr = (STATUS_RANK[a.payment_status] ?? 9) - (STATUS_RANK[b.payment_status] ?? 9);
    if (sr !== 0) return sr;
    return a.created_at.getTime() - b.created_at.getTime();
  })[0];
}

const brief = (r: AthleteRow) => ({ id: r.id, fullName: r.full_name, ci: r.ci });

async function mergeGroup(client: PoolClient, key: string, rows: AthleteRow[]): Promise<MergedGroupReport> {
  const survivor = pickSurvivor(rows);
  const losers = rows.filter((r) => r.id !== survivor.id);
  const loserIds = losers.map((l) => l.id);

  // Un mismo comprobante enviado en ambas inscripciones no debe sumar dos veces: entre los
  // pagos con la misma referencia se conserva el de mejor estado y el resto se marca
  // RECHAZADO (queda el registro como rastro, pero no cuenta para el saldo).
  const paymentsRes = await client.query<PaymentRow>(
    "SELECT id, athlete_id, reference, status, created_at FROM payments WHERE athlete_id = ANY($1::uuid[])",
    [rows.map((r) => r.id)],
  );
  const byReference = new Map<string, PaymentRow[]>();
  for (const p of paymentsRes.rows) {
    const k = p.reference.trim().toLowerCase();
    byReference.set(k, [...(byReference.get(k) ?? []), p]);
  }
  const toReject: string[] = [];
  for (const group of byReference.values()) {
    if (group.length < 2) continue;
    group.sort(
      (a, b) =>
        (PAYMENT_RANK[a.status] ?? 9) - (PAYMENT_RANK[b.status] ?? 9) || a.created_at.getTime() - b.created_at.getTime(),
    );
    for (const dup of group.slice(1)) if (dup.status !== "REJECTED") toReject.push(dup.id);
  }

  const moved = await client.query("UPDATE payments SET athlete_id = $1 WHERE athlete_id = ANY($2::uuid[])", [
    survivor.id,
    loserIds,
  ]);
  if (toReject.length > 0) {
    await client.query("UPDATE payments SET status = 'REJECTED' WHERE id = ANY($1::uuid[])", [toReject]);
  }
  await client.query("UPDATE conversations SET athlete_id = $1 WHERE athlete_id = ANY($2::uuid[])", [
    survivor.id,
    loserIds,
  ]);

  // Completa en la inscripción que sobrevive lo que solo tenía el duplicado.
  const email = survivor.email ?? losers.find((l) => l.email)?.email ?? null;
  const state = survivor.state ?? losers.find((l) => l.state)?.state ?? null;
  const checkedInRow = survivor.checked_in ? survivor : losers.find((l) => l.checked_in);
  await client.query(
    "UPDATE athletes SET email = $2, state = $3, checked_in = $4, checked_in_at = $5 WHERE id = $1",
    [survivor.id, email, state, Boolean(checkedInRow), checkedInRow?.checked_in_at ?? null],
  );

  // Los QR de las inscripciones absorbidas siguen siendo válidos: quedan como alias de la
  // que sobrevive y el check-in los resuelve a ella. Los alias que ya tuvieran se reasignan
  // antes del borrado para que ON DELETE CASCADE no se los lleve.
  await client.query("UPDATE athlete_qr_aliases SET athlete_id = $1 WHERE athlete_id = ANY($2::uuid[])", [
    survivor.id,
    loserIds,
  ]);
  for (const loser of losers) {
    await client.query(
      "INSERT INTO athlete_qr_aliases (qr_token, athlete_id) VALUES ($1, $2) ON CONFLICT (qr_token) DO NOTHING",
      [loser.qr_token, survivor.id],
    );
  }

  // Los pagos ya fueron movidos, así que el borrado no arrastra nada por ON DELETE CASCADE.
  await client.query("DELETE FROM athletes WHERE id = ANY($1::uuid[])", [loserIds]);

  const statusAfter = await recomputeAthletePaymentStatus(client, survivor.id);

  return {
    key,
    survivor: brief(survivor),
    absorbed: losers.map(brief),
    paymentsMoved: moved.rowCount ?? 0,
    duplicatePaymentsRejected: toReject.length,
    statusBefore: survivor.payment_status,
    statusAfter,
  };
}

// Con dryRun=true ejecuta todo dentro de una transacción y hace ROLLBACK: el reporte es
// exactamente lo que pasaría, sin escribir nada.
export async function mergeDuplicateAthletes(dryRun: boolean): Promise<MergeReport> {
  const client = await pool.connect();
  const report: MergeReport = { dryRun, merged: [], skipped: [] };
  try {
    await client.query("BEGIN");

    const athletes = await client.query<AthleteRow>("SELECT * FROM athletes ORDER BY created_at, id FOR UPDATE");
    const groups = new Map<string, AthleteRow[]>();
    for (const row of athletes.rows) {
      const key = duplicateKey(row.ci);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    for (const [key, rows] of groups) {
      if (rows.length < 2) continue;

      const skip = (reason: SkipReason) => report.skipped.push({ key, reason, athletes: rows.map(brief) });

      if (rows.some((r) => r.team_id)) {
        skip("TEAM_MEMBER");
      } else if (rows.filter((r) => r.bib_number != null).length > 1) {
        skip("MULTIPLE_BIBS");
      } else if (!rows.every((r) => namesCompatible(rows[0].full_name, r.full_name))) {
        skip("NAME_MISMATCH");
      } else {
        report.merged.push(await mergeGroup(client, key, rows));
      }
    }

    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return report;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
