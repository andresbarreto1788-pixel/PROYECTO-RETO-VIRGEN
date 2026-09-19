import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { safeCompare } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { processAgentMessage } from "../services/agentService.js";
import type { AgentHistoryMessage } from "../services/agentService.js";
import { generateCertificatePdf } from "../services/certificateService.js";
import { sendOrganizerEmailReply } from "../services/emailService.js";
import * as metaWhatsAppService from "../services/metaWhatsAppService.js";

export const webhooksRouter = Router();

const CERTIFICATE_FILENAME = "Certificado-Reto-Virgen-de-la-Paz.pdf";

interface MetaContact {
  wa_id?: string;
}

interface MetaMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
}

// --- Resolución de conversaciones, compartida con whatsappService.ts (Baileys) y
// certificateDispatch.ts: mismo criterio de vínculo automático por teléfono/correo ---

async function resolveWhatsAppConversation(phone: string, waId: string | null, firstMessage: string): Promise<string> {
  const existing = await pool.query(
    "SELECT id FROM conversations WHERE contact_identifier = $1 AND channel = 'WHATSAPP' LIMIT 1",
    [phone],
  );
  if (existing.rows.length > 0) {
    if (waId) await pool.query("UPDATE conversations SET meta_wa_id = $1 WHERE id = $2", [waId, existing.rows[0].id]);
    return existing.rows[0].id;
  }

  // Compara solo los últimos 10 dígitos: el registro local guarda "0412-XXXXXXX" y Meta
  // entrega "58412XXXXXXX" (código de país), mismo abonado con prefijo distinto.
  const athleteMatch = await pool.query(
    `SELECT id FROM athletes
     WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = RIGHT(regexp_replace($1, '\\D', '', 'g'), 10)
     LIMIT 1`,
    [phone],
  );
  const athleteId = athleteMatch.rows[0]?.id ?? null;

  const created = await pool.query(
    `INSERT INTO conversations (athlete_id, channel, contact_identifier, meta_wa_id, last_message)
     VALUES ($1, 'WHATSAPP', $2, $3, $4) RETURNING id`,
    [athleteId, phone, waId, firstMessage],
  );
  return created.rows[0].id;
}

async function resolveEmailConversation(fromEmail: string, firstMessage: string): Promise<string> {
  const existing = await pool.query(
    "SELECT id FROM conversations WHERE contact_identifier = $1 AND channel = 'GMAIL' LIMIT 1",
    [fromEmail],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const athleteMatch = await pool.query("SELECT id FROM athletes WHERE email = $1 LIMIT 1", [fromEmail]);
  const athleteId = athleteMatch.rows[0]?.id ?? null;

  const created = await pool.query(
    `INSERT INTO conversations (athlete_id, channel, contact_identifier, last_message)
     VALUES ($1, 'GMAIL', $2, $3) RETURNING id`,
    [athleteId, fromEmail, firstMessage],
  );
  return created.rows[0].id;
}

interface AgentTurnOptions {
  conversationId: string;
  text: string;
  emailSubject?: string | null;
  deliver: (replyText: string) => Promise<void>;
  onCertificateReady?: (ci: string) => Promise<void>;
}

// Turno compartido por ambos canales entrantes: inserta el mensaje del atleta, corre el
// agente si el bot está activo (mismo patrón que whatsappService.ts / crm.ts chat-simulation),
// inserta y entrega la respuesta, y dispara el certificado si la tool lo pidió.
async function runAgentTurn({ conversationId, text, emailSubject, deliver, onCertificateReady }: AgentTurnOptions): Promise<void> {
  await pool.query(
    `INSERT INTO crm_messages (conversation_id, sender, message_body, email_subject) VALUES ($1, 'ATHLETE', $2, $3)`,
    [conversationId, text, emailSubject ?? null],
  );

  const stateRes = await pool.query("SELECT bot_active FROM conversations WHERE id = $1", [conversationId]);
  const botActive = Boolean(stateRes.rows[0]?.bot_active);

  if (!botActive) {
    // El organizador ya tomó el control: solo se deja el mensaje en la bandeja.
    await pool.query(
      "UPDATE conversations SET last_message = $1, unread_count = unread_count + 1, updated_at = NOW() WHERE id = $2",
      [text, conversationId],
    );
    return;
  }

  const historyRes = await pool.query(
    "SELECT sender, message_body FROM crm_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20",
    [conversationId],
  );
  const history: AgentHistoryMessage[] = historyRes.rows
    .slice(0, -1) // excluye el mensaje entrante que ya se pasa aparte
    .map((r) => ({ sender: r.sender, messageBody: r.message_body }));

  const agentResult = await processAgentMessage(conversationId, text, history);

  await pool.query(`INSERT INTO crm_messages (conversation_id, sender, message_body) VALUES ($1, 'BOT', $2)`, [
    conversationId,
    agentResult.reply,
  ]);
  await pool.query("UPDATE conversations SET last_message = $1, updated_at = NOW() WHERE id = $2", [
    agentResult.reply,
    conversationId,
  ]);

  await deliver(agentResult.reply);

  const certificateCall = agentResult.toolCalls.find((t) => t.name === "reenviar_certificado");
  const ci = typeof certificateCall?.args?.ci === "string" ? certificateCall.args.ci : null;
  if (ci && onCertificateReady) await onCertificateReady(ci);
}

// --- Meta WhatsApp Cloud API -------------------------------------------------

webhooksRouter.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && typeof token === "string" && metaWhatsAppService.verifyToken(token)) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.sendStatus(403);
});

webhooksRouter.post("/webhooks/whatsapp", async (req, res) => {
  const signature = req.header("x-hub-signature-256");
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

  if (!metaWhatsAppService.verifySignature(rawBody, signature)) {
    res.sendStatus(403);
    return;
  }

  // Meta reintenta la entrega si no responde 200 a tiempo: se reconoce de inmediato y el
  // procesamiento sigue en segundo plano (mismo criterio que un webhook estándar de Meta).
  res.sendStatus(200);

  try {
    const entries = (req.body?.entry ?? []) as Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>;
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const contacts = (value.contacts as MetaContact[] | undefined) ?? [];
        const messages = (value.messages as MetaMessage[] | undefined) ?? [];

        for (const message of messages) {
          if (message.type !== "text" || !message.text?.body || !message.from) continue;
          const from = String(message.from);
          const waId = contacts.find((c) => c.wa_id)?.wa_id ?? from;

          const conversationId = await resolveWhatsAppConversation(from, waId, message.text.body);

          await runAgentTurn({
            conversationId,
            text: message.text.body,
            deliver: async (reply) => {
              await metaWhatsAppService.sendTextMessage(from, reply);
            },
            onCertificateReady: async (ci) => {
              const athleteRes = await pool.query(
                "SELECT id, full_name, ci, route, jersey_size, bib_number, qr_token, email, payment_status FROM athletes WHERE ci = $1",
                [ci.trim()],
              );
              if (athleteRes.rows.length === 0) return;
              const a = athleteRes.rows[0];
              if (a.payment_status !== "PAID") return;

              const pdfBuffer = await generateCertificatePdf({
                athleteId: a.id,
                fullName: a.full_name,
                ci: a.ci,
                route: a.route,
                jerseySize: a.jersey_size,
                bibNumber: a.bib_number,
                qrToken: a.qr_token,
                email: a.email ?? "",
              });
              await metaWhatsAppService.sendDocumentBuffer(from, pdfBuffer, CERTIFICATE_FILENAME);
            },
          });
        }
      }
    }
  } catch (err) {
    console.error("Error procesando webhook de WhatsApp (Meta):", err);
  }
});

// --- Correos entrantes (Gmail bidireccional) ---------------------------------

const emailIncomingSchema = z.object({
  from: z.string().trim().toLowerCase().email("from inválido."),
  to: z.string().trim().optional(),
  subject: z.string().trim().max(255).optional(),
  text: z.string().trim().min(1, "El cuerpo del correo no puede estar vacío.").max(10_000),
  html: z.string().optional(),
});

webhooksRouter.post("/crm/emails/incoming", (req, res, next) => {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const provided = req.header("x-webhook-token") ?? "";
  if (!secret || !safeCompare(provided, secret)) {
    res.status(401).json({ error: "Token de webhook inválido." });
    return;
  }
  next();
}, validateBody(emailIncomingSchema), async (req, res) => {
  const { from, subject, text } = req.body as z.infer<typeof emailIncomingSchema>;

  const conversationId = await resolveEmailConversation(from, text);
  res.status(200).json({ ok: true });

  try {
    await runAgentTurn({
      conversationId,
      text,
      emailSubject: subject ?? null,
      deliver: async (reply) => {
        const replySubject = subject ? `Re: ${subject}` : "Reto Virgen de la Paz — Respuesta a tu consulta";
        await sendOrganizerEmailReply(from, replySubject, reply, "");
      },
    });
  } catch (err) {
    console.error("Error procesando correo entrante:", err);
  }
});
