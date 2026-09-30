import { pool } from "../db/pool.js";
import { generateCertificatePdf } from "./certificateService.js";
import type { AthleteCertificateData } from "./certificateService.js";
import { sendRegistrationCertificateEmail, sendTeamCertificatesEmail } from "./emailService.js";

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

// Si el atleta pertenece a un equipo, el certificado lleva el nombre del equipo y se
// envía al correo que el equipo eligió (certificate_email → captain_email → el
// correo del propio integrante). Centralizado aquí para que todos los puntos de
// envío (pagos, CRM, agente, panel de equipos) se comporten igual sin tocarlos.
async function applyTeamContext(athlete: AthleteCertificateData): Promise<AthleteCertificateData> {
  const res = await pool.query(
    `SELECT t.name, t.certificate_email, t.captain_email
       FROM athletes a JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [athlete.athleteId],
  );
  if (res.rows.length === 0) return athlete;
  const team = res.rows[0];
  return { ...athlete, teamName: team.name, email: team.certificate_email ?? team.captain_email ?? athlete.email };
}

async function recordCertificateSent(athlete: AthleteCertificateData): Promise<void> {
  const lastMessage = `Certificado oficial enviado a ${athlete.email}.`;
  const conversationId = await findOrCreateEmailConversation(athlete.athleteId, athlete.email, lastMessage);
  await pool.query(`INSERT INTO crm_messages (conversation_id, sender, message_body) VALUES ($1, 'BOT', $2)`, [
    conversationId,
    lastMessage,
  ]);
}

// Punto único usado tanto por la aprobación de pagos (Fase 2) como por el panel de
// CRM y la herramienta "reenviar_certificado" del agente (Fase 3): genera el PDF en
// memoria, lo envía (o simula el envío) y deja constancia en el CRM. Nunca lanza:
// retorna false si el envío no pudo completarse.
export async function dispatchCertificateEmail(input: AthleteCertificateData): Promise<boolean> {
  const athlete = await applyTeamContext(input);
  const pdfBuffer = await generateCertificatePdf(athlete);
  const sent = await sendRegistrationCertificateEmail(athlete, pdfBuffer);

  if (!sent) return false;

  await recordCertificateSent(athlete);
  return true;
}

// Aprobación masiva de un equipo: agrupa los certificados por correo destino y manda
// un solo correo con todos los PDFs adjuntos (en vez de un correo por integrante).
export async function dispatchTeamCertificates(inputs: AthleteCertificateData[]): Promise<void> {
  const byRecipient = new Map<string, AthleteCertificateData[]>();
  for (const input of inputs) {
    const athlete = await applyTeamContext(input);
    const key = athlete.email.toLowerCase();
    byRecipient.set(key, [...(byRecipient.get(key) ?? []), athlete]);
  }

  for (const group of byRecipient.values()) {
    try {
      const teamName = group[0].teamName;
      if (group.length === 1 || !teamName) {
        for (const athlete of group) {
          const pdfBuffer = await generateCertificatePdf(athlete);
          if (await sendRegistrationCertificateEmail(athlete, pdfBuffer)) await recordCertificateSent(athlete);
        }
        continue;
      }

      const certificates = [];
      for (const athlete of group) {
        certificates.push({ athleteName: athlete.fullName, pdfBuffer: await generateCertificatePdf(athlete) });
      }
      if (await sendTeamCertificatesEmail(group[0].email, teamName, certificates)) {
        for (const athlete of group) await recordCertificateSent(athlete);
      }
    } catch (err) {
      console.error("Error despachando certificados del equipo:", err);
    }
  }
}
