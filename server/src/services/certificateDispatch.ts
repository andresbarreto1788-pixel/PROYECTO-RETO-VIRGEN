import { pool } from "../db/pool.js";
import { generateCertificatePdf } from "./certificateService.js";
import type { AthleteCertificateData } from "./certificateService.js";
import { sendRegistrationCertificateEmail } from "./emailService.js";

// Reutiliza la conversación de correo del atleta si ya existe (p. ej. de un envío
// anterior) en vez de crear una fila nueva por cada certificado despachado.
async function findOrCreateEmailConversation(athleteId: string, email: string, lastMessage: string): Promise<string> {
  const existing = await pool.query(
    "SELECT id FROM conversations WHERE athlete_id = $1 AND channel = 'GMAIL' LIMIT 1",
    [athleteId],
  );
  if (existing.rows.length > 0) {
    const conversationId = existing.rows[0].id;
    await pool.query("UPDATE conversations SET last_message = $1, updated_at = NOW() WHERE id = $2", [
      lastMessage,
      conversationId,
    ]);
    return conversationId;
  }

  const created = await pool.query(
    `INSERT INTO conversations (athlete_id, channel, contact_identifier, last_message)
     VALUES ($1, 'GMAIL', $2, $3) RETURNING id`,
    [athleteId, email, lastMessage],
  );
  return created.rows[0].id;
}

// Punto único usado tanto por la aprobación de pagos (Fase 2) como por el panel de
// CRM y la herramienta "reenviar_certificado" del agente (Fase 3): genera el PDF en
// memoria, lo envía (o simula el envío) y deja constancia en el CRM. Nunca lanza:
// retorna false si el envío no pudo completarse.
export async function dispatchCertificateEmail(athlete: AthleteCertificateData): Promise<boolean> {
  const pdfBuffer = await generateCertificatePdf(athlete);
  const sent = await sendRegistrationCertificateEmail(athlete, pdfBuffer);

  if (!sent) return false;

  const lastMessage = `Certificado oficial enviado a ${athlete.email}.`;
  const conversationId = await findOrCreateEmailConversation(athlete.athleteId, athlete.email, lastMessage);
  await pool.query(`INSERT INTO crm_messages (conversation_id, sender, message_body) VALUES ($1, 'BOT', $2)`, [
    conversationId,
    lastMessage,
  ]);

  return true;
}
