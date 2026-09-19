import nodemailer from "nodemailer";
import type { AthleteCertificateData } from "./certificateService.js";

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

const CERTIFICATE_FILENAME = "Certificado-Reto-Virgen-de-la-Paz.pdf";
const EMAIL_SUBJECT = "¡Inscripción Confirmada! Pase Oficial - Reto Virgen de la Paz 2027";

function buildEmailHtml(athlete: AthleteCertificateData): string {
  const routeLabel = ROUTE_LABELS[athlete.route] ?? athlete.route;
  const bibLabel = athlete.bibNumber != null ? String(athlete.bibNumber) : "Se asigna en el check-in";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0F172A;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="background:#0F172A;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" style="background:#111827;border:1px solid rgba(204,255,0,0.2);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#0B0D0E;padding:24px;text-align:center;">
                <p style="margin:0;color:#CCFF00;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">Reto Virgen de la Paz</p>
                <h1 style="margin:8px 0 0;color:#F8FAFC;font-size:22px;">¡Inscripción Confirmada!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;color:#E2E8F0;">
                <p style="margin:0 0 16px;font-size:15px;">Hola <strong>${athlete.fullName}</strong>,</p>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
                  Tu inscripción ha sido confirmada con pago completo. Adjunto encontrarás tu
                  <strong>certificado oficial de participación</strong> con el código QR que debes presentar
                  el día del evento en el paddock para retirar tu kit.
                </p>
                <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:20px;">
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);color:#94A3B8;font-size:12px;text-transform:uppercase;">Modalidad</td>
                    <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right;font-weight:bold;">${routeLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);color:#94A3B8;font-size:12px;text-transform:uppercase;">Talla de franela</td>
                    <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right;font-weight:bold;">${athlete.jerseySize}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#94A3B8;font-size:12px;text-transform:uppercase;">Dorsal</td>
                    <td style="padding:8px 0;text-align:right;font-weight:bold;color:#CCFF00;">${bibLabel}</td>
                  </tr>
                </table>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;">
                  Presenta el QR de tu certificado (impreso o desde tu celular) en el paddock antes de la salida.
                  ¡Nos vemos en la meta!
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildEmailText(athlete: AthleteCertificateData): string {
  const routeLabel = ROUTE_LABELS[athlete.route] ?? athlete.route;
  const bibLabel = athlete.bibNumber != null ? String(athlete.bibNumber) : "Se asigna en el check-in";

  return [
    `Hola ${athlete.fullName},`,
    "",
    "Tu inscripción ha sido confirmada con pago completo. Adjunto encontrarás tu certificado oficial de participación con el código QR que debes presentar el día del evento en el paddock para retirar tu kit.",
    "",
    `Modalidad: ${routeLabel}`,
    `Talla de franela: ${athlete.jerseySize}`,
    `Dorsal: ${bibLabel}`,
    "",
    "Presenta el QR de tu certificado (impreso o desde tu celular) en el paddock antes de la salida. ¡Nos vemos en la meta!",
  ].join("\n");
}

export interface GmailConfigStatus {
  configured: boolean;
  user: string | null;
  mode: "MOCK" | "PRODUCTION";
}

export function getGmailConfigStatus(): GmailConfigStatus {
  const gmailUser = process.env.GMAIL_USER;
  const configured = Boolean(gmailUser && process.env.GMAIL_APP_PASSWORD);
  return { configured, user: gmailUser ?? null, mode: configured ? "PRODUCTION" : "MOCK" };
}

function buildReplyHtml(athleteName: string, bodyText: string): string {
  const safeBody = bodyText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0F172A;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="background:#0F172A;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" style="background:#111827;border:1px solid rgba(204,255,0,0.2);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#0B0D0E;padding:24px;text-align:center;">
                <p style="margin:0;color:#CCFF00;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">Reto Virgen de la Paz</p>
                <h1 style="margin:8px 0 0;color:#F8FAFC;font-size:20px;">Respuesta a tu consulta</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;color:#E2E8F0;">
                <p style="margin:0 0 16px;font-size:15px;">Hola <strong>${athleteName || "atleta"}</strong>,</p>
                <p style="margin:0;font-size:14px;line-height:1.6;">${safeBody}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Envío saliente desde el CRM: cuando el organizador (o el bot) responde en una
// conversación de canal GMAIL, se despacha como un correo formal vía Nodemailer.
export async function sendOrganizerEmailReply(
  toEmail: string,
  subject: string,
  bodyText: string,
  athleteName: string,
): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    console.log(`[EMAIL MOCK] Respuesta del organizador a: ${toEmail}`);
    console.log(`[EMAIL MOCK] Asunto: ${subject}`);
    console.log(`[EMAIL MOCK] Cuerpo: ${bodyText}`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    await transporter.sendMail({
      from: `"Reto Virgen de la Paz" <${gmailUser}>`,
      replyTo: gmailUser,
      to: toEmail,
      subject,
      text: `Hola ${athleteName || "atleta"},\n\n${bodyText}`,
      html: buildReplyHtml(athleteName, bodyText),
    });

    return true;
  } catch (err) {
    console.error("Error enviando respuesta del organizador por correo:", err);
    return false;
  }
}

export async function sendRegistrationCertificateEmail(
  athlete: AthleteCertificateData,
  pdfBuffer: Buffer,
): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    console.log(`[EMAIL MOCK] Enviando certificado a: ${athlete.email}`);
    console.log(`[EMAIL MOCK] Asunto: ${EMAIL_SUBJECT}`);
    console.log(`[EMAIL MOCK] Adjunto: ${CERTIFICATE_FILENAME} (${pdfBuffer.length} bytes)`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    await transporter.sendMail({
      from: `"Reto Virgen de la Paz" <${gmailUser}>`,
      replyTo: gmailUser,
      to: athlete.email,
      subject: EMAIL_SUBJECT,
      text: buildEmailText(athlete),
      html: buildEmailHtml(athlete),
      attachments: [
        {
          filename: CERTIFICATE_FILENAME,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return true;
  } catch (err) {
    console.error("Error enviando certificado por correo:", err);
    return false;
  }
}
