import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { serializeAthlete, serializeTeam, serializeTeamSummary } from "../lib/serialize.js";
import { discountPercentForSize, perMemberUsd, TEAM_PRICE_PER_MEMBER_USD } from "../lib/pricing.js";
import { recomputeAthletePaymentStatus } from "../services/paymentService.js";
import { fetchBcvRate } from "../services/bcvService.js";
import { dispatchCertificateEmail } from "../services/certificateDispatch.js";
import type { AthleteCertificateData } from "../services/certificateService.js";
import { ATHLETE_WITH_PAYMENTS_SELECT } from "./admin.js";

export const adminTeamsRouter = Router();

const JERSEY_CUTS = ["caballero", "dama"] as const;
const JERSEY_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const JERSEY_SIZES_BY_CUT: Record<string, readonly string[]> = {
  caballero: ["S", "M", "L", "XL", "XXL"],
  dama: ["XS", "S", "M", "L", "XL"],
};
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

const emailSchema = z.string().trim().toLowerCase().email("Correo electrónico inválido.").max(150);

// Toda mutación del roster (agregar, quitar, o el DELETE /athletes/:id de admin.ts cuando
// el atleta pertenecía a un equipo) termina aquí: el conteo guardado en teams.member_count
// es solo un valor de referencia del registro inicial, nunca la fuente de verdad.
async function syncTeamMemberCount(teamId: string): Promise<void> {
  await pool.query(
    "UPDATE teams SET member_count = (SELECT COUNT(*) FROM athletes WHERE team_id = $1), updated_at = NOW() WHERE id = $1",
    [teamId],
  );
}

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

      // Un integrante agregado desde el panel (POST /:id/members) puede no tener NINGUNA
      // fila de payments todavía — no hay ningún abono suyo que aprobar, así que se deja
      // tal cual en vez de fabricarle un pago sintético por el total o, peor, dejar que
      // recomputeAthletePaymentStatus lo marque REJECTED (esa función asume que siempre
      // existe al menos un pago, lo cual ya no es cierto para este caso).
      const paymentCountRes = await client.query("SELECT COUNT(*)::int AS n FROM payments WHERE athlete_id = $1", [
        athlete.id,
      ]);
      if (paymentCountRes.rows[0].n === 0) continue;

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

// --- Editar equipo --------------------------------------------------------

const TEAM_EDITABLE_FIELDS = ["name", "captainFullName", "captainPhone", "captainEmail"] as const;
const TEAM_FIELD_TO_COLUMN: Record<(typeof TEAM_EDITABLE_FIELDS)[number], string> = {
  name: "name",
  captainFullName: "captain_full_name",
  captainPhone: "captain_phone",
  captainEmail: "captain_email",
};

const editTeamSchema = z
  .object({
    name: z.string().trim().min(3, "Nombre de equipo inválido.").max(150),
    captainFullName: z.string().trim().min(3, "Nombre del capitán inválido.").max(150),
    captainPhone: phoneSchema,
    captainEmail: emailSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No hay campos para actualizar." });

// La modalidad (route) no es editable: cambiarla obligaría a re-derivar athletes.route de
// cada integrante y sus dorsales ya asignados; fuera de alcance del panel.
adminTeamsRouter.patch("/:id", requireAdmin, validateBody(editTeamSchema), async (req, res) => {
  const id = String(req.params.id);
  const body = req.body as z.infer<typeof editTeamSchema>;

  const updates = TEAM_EDITABLE_FIELDS.filter((field) => body[field] !== undefined);
  const setClauses = updates.map((field, i) => `${TEAM_FIELD_TO_COLUMN[field]} = $${i + 1}`);
  const values = updates.map((field) => body[field]);

  const result = await pool.query(
    `UPDATE teams SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING *`,
    [...values, id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Equipo no encontrado." });
    return;
  }
  res.json({ team: serializeTeam(result.rows[0]) });
});

// --- Eliminar equipo -------------------------------------------------------

// mode=unlink (default, seguro): los integrantes conservan inscripción, pagos y dorsal,
// solo dejan de pertenecer a un equipo. mode=cascade: borra también sus inscripciones
// (los payments caen por ON DELETE CASCADE) — irreversible, la UI lo confirma aparte.
adminTeamsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const mode = req.query.mode === "cascade" ? "cascade" : "unlink";

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");

    const teamRes = await client.query("SELECT id FROM teams WHERE id = $1", [id]);
    if (teamRes.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Equipo no encontrado." });
      return;
    }

    let affectedMembers: number;
    if (mode === "cascade") {
      const delRes = await client.query("DELETE FROM athletes WHERE team_id = $1", [id]);
      affectedMembers = delRes.rowCount ?? 0;
    } else {
      const updRes = await client.query("UPDATE athletes SET team_id = NULL WHERE team_id = $1", [id]);
      affectedMembers = updRes.rowCount ?? 0;
    }

    await client.query("DELETE FROM teams WHERE id = $1", [id]);
    await client.query("COMMIT");
    committed = true;

    res.json({ mode, affectedMembers });
  } catch (err) {
    if (!committed) await client.query("ROLLBACK");
    console.error("Error eliminando equipo:", err);
    res.status(500).json({ error: "No se pudo eliminar el equipo." });
  } finally {
    client.release();
  }
});

// --- Agregar integrante ----------------------------------------------------

const addTeamMemberSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    fullName: z.string().trim().min(3, "Nombre inválido.").max(150),
    ci: idNumberSchema,
    phone: phoneSchema,
    email: emailSchema.optional(),
    emergencyContact: z.string().trim().min(3, "Contacto de emergencia inválido.").max(100),
    bloodType: z.enum(BLOOD_TYPES, { message: "Tipo de sangre inválido." }),
    jerseyCut: z.enum(JERSEY_CUTS, { message: "Corte de jersey inválido." }),
    jerseySize: z.enum(JERSEY_SIZES, { message: "Talla inválida." }),
  }),
  z.object({
    mode: z.literal("link"),
    athleteId: z.string().uuid("athleteId inválido."),
  }),
]);

// mode=create: inscribe a un atleta nuevo directo en el equipo, a precio de integrante
// (ya con el descuento vigente del equipo, si tiene). mode=link: engancha a un atleta que
// YA existe como inscripción individual (debe no pertenecer a ningún equipo todavía).
// Ninguno de los dos crea una fila de payments — el abono se registra aparte, con el mismo
// AddPaymentModal que usa Control de Atletas.
adminTeamsRouter.post("/:id/members", requireAdmin, validateBody(addTeamMemberSchema), async (req, res) => {
  const teamId = String(req.params.id);
  const body = req.body as z.infer<typeof addTeamMemberSchema>;

  const teamRes = await pool.query("SELECT id, route, discount_percent FROM teams WHERE id = $1", [teamId]);
  if (teamRes.rows.length === 0) {
    res.status(404).json({ error: "Equipo no encontrado." });
    return;
  }
  const team = teamRes.rows[0];

  if (body.mode === "link") {
    const athleteRes = await pool.query("SELECT id, team_id FROM athletes WHERE id = $1", [body.athleteId]);
    if (athleteRes.rows.length === 0) {
      res.status(404).json({ error: "Atleta no encontrado." });
      return;
    }
    if (athleteRes.rows[0].team_id) {
      res.status(409).json({ error: "Ese atleta ya pertenece a un equipo." });
      return;
    }

    await pool.query("UPDATE athletes SET team_id = $1 WHERE id = $2", [teamId, body.athleteId]);
    await syncTeamMemberCount(teamId);
    res.status(201).json({ athleteId: body.athleteId });
    return;
  }

  if (!JERSEY_SIZES_BY_CUT[body.jerseyCut]?.includes(body.jerseySize)) {
    res.status(400).json({ error: "La talla no corresponde al corte seleccionado." });
    return;
  }

  const memberUsd = perMemberUsd(Number(team.discount_percent));

  try {
    const athleteResult = await pool.query(
      `INSERT INTO athletes
        (full_name, ci, phone, email, emergency_contact, blood_type, route, jersey_cut, jersey_size, payment_status, total_amount_usd, team_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_REVIEW', $10, $11)
       RETURNING *`,
      [
        body.fullName,
        body.ci,
        body.phone,
        body.email ?? null,
        body.emergencyContact,
        body.bloodType,
        team.route,
        body.jerseyCut,
        body.jerseySize,
        memberUsd,
        teamId,
      ],
    );
    await syncTeamMemberCount(teamId);
    res.status(201).json({ athlete: serializeAthlete(athleteResult.rows[0]) });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      res.status(409).json({ error: "Ya existe una inscripción con esa cédula." });
      return;
    }
    console.error("Error agregando integrante al equipo:", err);
    res.status(500).json({ error: "No se pudo agregar el integrante." });
  }
});

// --- Quitar integrante -------------------------------------------------------

// mode=unlink (default, seguro): conserva la inscripción, solo la desvincula del equipo.
// mode=delete: borra la inscripción — bloqueado con 409 si ya tiene algún pago APPROVED o
// dorsal asignado (en ese caso hay que desvincular, o borrar desde Control de Atletas a
// sabiendas de que eso también borra sus pagos).
adminTeamsRouter.delete("/:id/members/:athleteId", requireAdmin, async (req, res) => {
  const teamId = String(req.params.id);
  const athleteId = String(req.params.athleteId);
  const mode = req.query.mode === "delete" ? "delete" : "unlink";

  const athleteRes = await pool.query("SELECT id, bib_number FROM athletes WHERE id = $1 AND team_id = $2", [
    athleteId,
    teamId,
  ]);
  if (athleteRes.rows.length === 0) {
    res.status(404).json({ error: "El integrante no pertenece a este equipo." });
    return;
  }
  const athlete = athleteRes.rows[0];

  if (mode === "delete") {
    const approvedRes = await pool.query("SELECT 1 FROM payments WHERE athlete_id = $1 AND status = 'APPROVED' LIMIT 1", [
      athleteId,
    ]);
    if (approvedRes.rows.length > 0 || athlete.bib_number != null) {
      res.status(409).json({
        error: "Este integrante ya tiene pagos aprobados o dorsal asignado; desvincúlalo en vez de eliminarlo.",
      });
      return;
    }
    await pool.query("DELETE FROM athletes WHERE id = $1", [athleteId]);
  } else {
    await pool.query("UPDATE athletes SET team_id = NULL WHERE id = $1", [athleteId]);
  }

  await syncTeamMemberCount(teamId);
  res.json({ mode });
});

// --- Recalcular precio/descuento del equipo -------------------------------

// Nunca automático: solo se dispara cuando el organizador lo pide explícitamente (la UI
// solo muestra el botón cuando el equipo ya califica para MÁS descuento del que tiene).
// El propio endpoint además se niega a bajar el descuento actual, así nunca puede subirle
// el precio a nadie por accidente.
adminTeamsRouter.post("/:id/recalculate-pricing", requireAdmin, async (req, res) => {
  const id = String(req.params.id);

  const teamRes = await pool.query("SELECT id, discount_percent FROM teams WHERE id = $1", [id]);
  if (teamRes.rows.length === 0) {
    res.status(404).json({ error: "Equipo no encontrado." });
    return;
  }
  const currentDiscountPercent = Number(teamRes.rows[0].discount_percent);

  const client = await pool.connect();
  let committed = false;
  const certificateQueue: AthleteCertificateData[] = [];
  const statusChanges: { athleteId: string; from: string; to: string }[] = [];
  const overpaidMembers: { athleteId: string; fullName: string; surplusUsd: number }[] = [];
  let discountPercent: number;
  let newMemberUsd: number;
  let totalUsd: number;

  try {
    await client.query("BEGIN");

    const membersRes = await client.query("SELECT * FROM athletes WHERE team_id = $1 ORDER BY id FOR UPDATE", [id]);
    const memberCount = membersRes.rows.length;
    if (memberCount === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "El equipo no tiene integrantes para recalcular." });
      return;
    }

    discountPercent = discountPercentForSize(memberCount);
    if (discountPercent <= currentDiscountPercent) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "El equipo no calificó para un descuento mayor al que ya tiene." });
      return;
    }

    newMemberUsd = perMemberUsd(discountPercent);
    const subtotalUsd = Math.round(TEAM_PRICE_PER_MEMBER_USD * memberCount * 100) / 100;
    totalUsd = Math.round(newMemberUsd * memberCount * 100) / 100;

    await client.query(
      `UPDATE teams SET discount_percent = $1, subtotal_amount_usd = $2, total_amount_usd = $3,
         member_count = $4, updated_at = NOW() WHERE id = $5`,
      [discountPercent, subtotalUsd, totalUsd, memberCount, id],
    );

    for (const athlete of membersRes.rows) {
      const previousStatus = athlete.payment_status;

      // El nuevo precio le queda asignado a todos, incluso a quien no tenga ningún pago
      // todavía. Pero recomputeAthletePaymentStatus asume que siempre existe al menos un
      // pago (lo que ya no es cierto para alguien agregado desde el panel sin abono) — sin
      // esta salida, a esa persona la marcaría REJECTED por error. Sin pagos, no hay nada
      // que recalcular en su estatus: se deja como estaba.
      await client.query("UPDATE athletes SET total_amount_usd = $1 WHERE id = $2", [newMemberUsd, athlete.id]);

      const paymentCountRes = await client.query("SELECT COUNT(*)::int AS n FROM payments WHERE athlete_id = $1", [
        athlete.id,
      ]);
      if (paymentCountRes.rows[0].n === 0) continue;

      const sumRes = await client.query(
        "SELECT COALESCE(SUM(amount_usd_equiv), 0) AS paid FROM payments WHERE athlete_id = $1 AND status = 'APPROVED'",
        [athlete.id],
      );
      const paidUsd = Number(sumRes.rows[0].paid);

      const newStatus = await recomputeAthletePaymentStatus(client, athlete.id);

      if (newStatus && newStatus !== previousStatus) {
        statusChanges.push({ athleteId: athlete.id, from: previousStatus, to: newStatus });
      }

      const surplus = Math.round((paidUsd - newMemberUsd) * 100) / 100;
      if (surplus > 0) {
        overpaidMembers.push({ athleteId: athlete.id, fullName: athlete.full_name, surplusUsd: surplus });
      }

      if (newStatus === "PAID" && previousStatus !== "PAID") {
        let bibNumber = athlete.bib_number;
        if (bibNumber == null) {
          const bibRes = await client.query("SELECT nextval('bib_number_seq') AS bib");
          bibNumber = bibRes.rows[0].bib;
          await client.query("UPDATE athletes SET bib_number = $1 WHERE id = $2", [bibNumber, athlete.id]);
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
        }
      }
    }

    await client.query("COMMIT");
    committed = true;
  } catch (err) {
    if (!committed) await client.query("ROLLBACK");
    console.error("Error recalculando precio del equipo:", err);
    res.status(500).json({ error: "No se pudo recalcular el precio del equipo." });
    return;
  } finally {
    client.release();
  }

  res.json({ discountPercent, perMemberUsd: newMemberUsd, totalUsd, statusChanges, overpaidMembers });

  void (async () => {
    for (const data of certificateQueue) {
      await dispatchCertificateEmail(data).catch((err) =>
        console.error("Error despachando certificado tras recálculo de precio:", err),
      );
    }
  })();
});
