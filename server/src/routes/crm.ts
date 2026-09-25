import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { serializeAthlete, serializeConversation, serializeCrmMessage } from "../lib/serialize.js";
import { dispatchCertificateEmail } from "../services/certificateDispatch.js";
import { generateCertificatePdf } from "../services/certificateService.js";
import { processAgentMessage } from "../services/agentService.js";
import type { AgentHistoryMessage } from "../services/agentService.js";
import { whatsappService } from "../services/whatsappService.js";
import * as metaWhatsAppService from "../services/metaWhatsAppService.js";
import { getGmailConfigStatus, sendOrganizerEmailReply } from "../services/emailService.js";
import { approveFullPaymentAndAssignBib } from "../services/paymentService.js";
import { fetchBcvRate } from "../services/bcvService.js";

const CERTIFICATE_FILENAME = "Certificado-Reto-Virgen-de-la-Paz.pdf";

export const crmRouter = Router();

const CONVERSATION_SELECT = `
  SELECT c.*,
    a.full_name AS athlete_full_name,
    a.ci AS athlete_ci,
    a.route AS athlete_route,
    a.jersey_cut AS athlete_jersey_cut,
    a.jersey_size AS athlete_jersey_size,
    a.payment_status AS athlete_payment_status,
    a.bib_number AS athlete_bib_number,
    a.email AS athlete_email
  FROM conversations c
  LEFT JOIN athletes a ON a.id = c.athlete_id
`;

// --- Listado de conversaciones -------------------------------------------

crmRouter.get("/conversations", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(`${CONVERSATION_SELECT} ORDER BY c.updated_at DESC`);
  res.json({ items: rows.map(serializeConversation) });
});

// --- Historial de mensajes -------------------------------------------------

crmRouter.get("/conversations/:id/messages", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query("SELECT * FROM crm_messages WHERE conversation_id = $1 ORDER BY created_at ASC", [
    id,
  ]);
  res.json({ items: rows.map(serializeCrmMessage) });
});

// --- Activar / pausar el bot -----------------------------------------------

const updateConversationSchema = z
  .object({
    botActive: z.boolean(),
    internalNotes: z.string().trim().max(5000, "La nota es demasiado larga."),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No hay campos para actualizar." });

crmRouter.patch("/conversations/:id", requireAdmin, validateBody(updateConversationSchema), async (req, res) => {
  const { id } = req.params;
  const body = req.body as z.infer<typeof updateConversationSchema>;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  if (body.botActive !== undefined) {
    values.push(body.botActive);
    setClauses.push(`bot_active = $${values.length}`);
  }
  if (body.internalNotes !== undefined) {
    values.push(body.internalNotes);
    setClauses.push(`internal_notes = $${values.length}`);
  }

  const result = await pool.query(
    `UPDATE conversations SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING id`,
    [...values, id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Conversación no encontrada." });
    return;
  }

  const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE c.id = $1`, [id]);
  res.json({ conversation: serializeConversation(rows[0]) });
});

// --- Vincular manualmente una conversación a un atleta ----------------------

const linkAthleteSchema = z.object({ athleteId: z.string().uuid("athleteId inválido.") });

crmRouter.patch("/conversations/:id/link-athlete", requireAdmin, validateBody(linkAthleteSchema), async (req, res) => {
  const { id } = req.params;
  const { athleteId } = req.body as z.infer<typeof linkAthleteSchema>;

  const athleteExists = await pool.query("SELECT 1 FROM athletes WHERE id = $1", [athleteId]);
  if (athleteExists.rows.length === 0) {
    res.status(404).json({ error: "Atleta no encontrado." });
    return;
  }

  const result = await pool.query(
    "UPDATE conversations SET athlete_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
    [athleteId, id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Conversación no encontrada." });
    return;
  }

  const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE c.id = $1`, [id]);
  res.json({ conversation: serializeConversation(rows[0]) });
});

// --- Respuesta manual del organizador (pausa el bot) ------------------------

const organizerMessageSchema = z.object({ message: z.string().trim().min(1, "El mensaje no puede estar vacío.").max(2000) });

crmRouter.post("/conversations/:id/messages", requireAdmin, validateBody(organizerMessageSchema), async (req, res) => {
  const { id } = req.params;
  const { message } = req.body as z.infer<typeof organizerMessageSchema>;

  const convRes = await pool.query(
    `SELECT c.channel, c.contact_identifier, a.full_name AS athlete_full_name
     FROM conversations c LEFT JOIN athletes a ON a.id = c.athlete_id WHERE c.id = $1`,
    [id],
  );
  if (convRes.rows.length === 0) {
    res.status(404).json({ error: "Conversación no encontrada." });
    return;
  }
  const conversation = convRes.rows[0];

  // Un organizador respondiendo a mano toma el control: se pausa el bot para
  // que no compita con la respuesta humana en la misma conversación.
  await pool.query("UPDATE conversations SET bot_active = false, last_message = $1, updated_at = NOW() WHERE id = $2", [
    message,
    id,
  ]);

  let delivered: boolean | null = null;
  let deliveryError: string | null = null;
  let emailSubject: string | null = null;

  if (conversation.channel === "WHATSAPP") {
    const result = await metaWhatsAppService.sendTextMessageDetailed(conversation.contact_identifier, message);
    delivered = result.ok;
    if (!result.ok) {
      deliveryError =
        result.errorCode === 131047
          ? "Han pasado más de 24 horas desde el último mensaje del atleta. Meta ya no permite texto libre en esta conversación — el atleta debe escribir de nuevo para reabrir la ventana, o hay que usar una plantilla aprobada."
          : (result.errorMessage ?? "Error desconocido al enviar por WhatsApp.");
    }
  } else if (conversation.channel === "GMAIL") {
    const lastSubjectRes = await pool.query(
      "SELECT email_subject FROM crm_messages WHERE conversation_id = $1 AND email_subject IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      [id],
    );
    const baseSubject: string = lastSubjectRes.rows[0]?.email_subject ?? "Reto Virgen de la Paz — Respuesta a tu consulta";
    emailSubject = baseSubject.startsWith("Re:") ? baseSubject : `Re: ${baseSubject}`;
    delivered = await sendOrganizerEmailReply(
      conversation.contact_identifier,
      emailSubject,
      message,
      conversation.athlete_full_name ?? "",
    );
  }

  const inserted = await pool.query(
    `INSERT INTO crm_messages (conversation_id, sender, message_body, email_subject) VALUES ($1, 'ORGANIZER', $2, $3) RETURNING *`,
    [id, message, emailSubject],
  );

  res.status(201).json({ message: serializeCrmMessage(inserted.rows[0]), delivered, deliveryError });
});

// --- Eliminar un mensaje del historial (solo del CRM, no lo retracta en WhatsApp) --

crmRouter.delete("/conversations/:id/messages/:messageId", requireAdmin, async (req, res) => {
  const { id, messageId } = req.params;

  const result = await pool.query("DELETE FROM crm_messages WHERE id = $1 AND conversation_id = $2 RETURNING id", [
    messageId,
    id,
  ]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Mensaje no encontrado." });
    return;
  }

  res.status(204).send();
});

// --- Reenvío de certificado con 1 clic desde la ficha del atleta ------------

crmRouter.post("/conversations/:id/resend-certificate", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const athleteRes = await pool.query(
    `SELECT a.id, a.full_name, a.ci, a.phone, a.route, a.jersey_cut, a.jersey_size, a.bib_number, a.qr_token, a.email, a.payment_status
     FROM conversations c
     JOIN athletes a ON a.id = c.athlete_id
     WHERE c.id = $1`,
    [id],
  );
  if (athleteRes.rows.length === 0) {
    res.status(404).json({ error: "Esta conversación no tiene un atleta asociado." });
    return;
  }

  const athlete = athleteRes.rows[0];
  if (!athlete.email && !athlete.phone) {
    res.status(400).json({ error: "El atleta no tiene correo ni teléfono registrados." });
    return;
  }

  let emailSent = false;
  if (athlete.email) {
    emailSent = await dispatchCertificateEmail({
      athleteId: athlete.id,
      fullName: athlete.full_name,
      ci: athlete.ci,
      route: athlete.route,
      jerseyCut: athlete.jersey_cut,
      jerseySize: athlete.jersey_size,
      bibNumber: athlete.bib_number,
      qrToken: athlete.qr_token,
      email: athlete.email,
    });
  }

  let whatsappSent = false;
  if (athlete.phone && metaWhatsAppService.getConfigStatus().configured) {
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
    whatsappSent = await metaWhatsAppService.sendDocumentBuffer(athlete.phone, pdfBuffer, CERTIFICATE_FILENAME);
  }

  if (!emailSent && !whatsappSent) {
    res.status(502).json({ error: "No se pudo enviar el certificado por ningún canal. Intenta de nuevo." });
    return;
  }

  res.json({ emailSent, whatsappSent });
});

// --- Aprobar el saldo pendiente completo desde el CRM -----------------------

crmRouter.post("/conversations/:id/approve-full-payment", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const convRes = await pool.query("SELECT athlete_id FROM conversations WHERE id = $1", [id]);
  if (convRes.rows.length === 0) {
    res.status(404).json({ error: "Conversación no encontrada." });
    return;
  }
  const athleteId = convRes.rows[0].athlete_id;
  if (!athleteId) {
    res.status(400).json({ error: "Esta conversación no tiene un atleta vinculado." });
    return;
  }

  const result = await approveFullPaymentAndAssignBib(athleteId);
  if (!result) {
    res.status(404).json({ error: "Atleta no encontrado." });
    return;
  }

  res.json({ athlete: serializeAthlete(result.athlete), becamePaid: result.becamePaid });
});

// --- Diagnóstico de canales (Gmail + Meta WhatsApp) para el modal de ajustes -

crmRouter.get("/channels/status", requireAdmin, async (req, res) => {
  res.json({
    gmail: getGmailConfigStatus(),
    meta: metaWhatsAppService.getConfigStatus(),
    webhookUrl: `${req.protocol}://${req.get("host")}/api/webhooks/whatsapp`,
  });
});

// --- Tasa BCV vigente (para el equivalente en Bs de la ficha financiera) ----

crmRouter.get("/bcv-rate", requireAdmin, async (_req, res) => {
  res.json({ rate: await fetchBcvRate() });
});

// --- Simulador de chat / motor agéntico -------------------------------------

const chatSimulationSchema = z.object({
  conversationId: z.string().uuid("conversationId inválido.").optional(),
  message: z.string().trim().min(1, "El mensaje no puede estar vacío.").max(2000),
  contactIdentifier: z.string().trim().min(1, "Falta el identificador de contacto.").max(100),
  channel: z.enum(["WHATSAPP", "GMAIL", "SIMULATOR"]).optional(),
});

async function resolveConversationId(body: z.infer<typeof chatSimulationSchema>): Promise<string> {
  if (body.conversationId) {
    const existing = await pool.query("SELECT id FROM conversations WHERE id = $1", [body.conversationId]);
    if (existing.rows.length > 0) return body.conversationId;
  }

  const channel = body.channel ?? "SIMULATOR";
  const byContact = await pool.query("SELECT id FROM conversations WHERE contact_identifier = $1 AND channel = $2 LIMIT 1", [
    body.contactIdentifier,
    channel,
  ]);
  if (byContact.rows.length > 0) return byContact.rows[0].id;

  const athleteMatch = await pool.query("SELECT id FROM athletes WHERE ci = $1 OR phone = $1 OR email = $1 LIMIT 1", [
    body.contactIdentifier,
  ]);
  const athleteId = athleteMatch.rows[0]?.id ?? null;

  const created = await pool.query(
    `INSERT INTO conversations (athlete_id, channel, contact_identifier, last_message)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [athleteId, channel, body.contactIdentifier, body.message],
  );
  return created.rows[0].id;
}

crmRouter.post("/chat-simulation", requireAdmin, validateBody(chatSimulationSchema), async (req, res) => {
  const body = req.body as z.infer<typeof chatSimulationSchema>;

  const conversationId = await resolveConversationId(body);

  const inboundRes = await pool.query(
    `INSERT INTO crm_messages (conversation_id, sender, message_body) VALUES ($1, 'ATHLETE', $2) RETURNING *`,
    [conversationId, body.message],
  );

  const stateRes = await pool.query("SELECT bot_active FROM conversations WHERE id = $1", [conversationId]);
  const botActive = Boolean(stateRes.rows[0]?.bot_active);

  let outboundMessage = null;
  let latestMessage = body.message;

  if (botActive) {
    const historyRes = await pool.query(
      "SELECT sender, message_body FROM crm_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20",
      [conversationId],
    );
    const history: AgentHistoryMessage[] = historyRes.rows
      .slice(0, -1) // excluye el mensaje entrante que ya se pasa aparte
      .map((r) => ({ sender: r.sender, messageBody: r.message_body }));

    const agentResult = await processAgentMessage(conversationId, body.message, history);

    const outboundRes = await pool.query(
      `INSERT INTO crm_messages (conversation_id, sender, message_body) VALUES ($1, 'BOT', $2) RETURNING *`,
      [conversationId, agentResult.reply],
    );
    outboundMessage = serializeCrmMessage(outboundRes.rows[0]);
    latestMessage = agentResult.reply;
  }

  await pool.query("UPDATE conversations SET last_message = $1, updated_at = NOW() WHERE id = $2", [
    latestMessage,
    conversationId,
  ]);

  const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE c.id = $1`, [conversationId]);

  res.status(201).json({
    conversation: serializeConversation(rows[0]),
    inboundMessage: serializeCrmMessage(inboundRes.rows[0]),
    outboundMessage,
  });
});

// --- Conexión física de WhatsApp (Baileys) ----------------------------------

crmRouter.get("/whatsapp/status", requireAdmin, async (_req, res) => {
  const status = await whatsappService.ensureStarted();
  res.json(status);
});

crmRouter.post("/whatsapp/restart", requireAdmin, async (_req, res) => {
  const status = await whatsappService.restart();
  res.json(status);
});

crmRouter.post("/whatsapp/logout", requireAdmin, async (_req, res) => {
  const status = await whatsappService.logout();
  res.json(status);
});
