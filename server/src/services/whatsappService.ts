import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import type { BaileysEventMap, ConnectionState, WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { pool } from "../db/pool.js";
import { generateCertificatePdf } from "./certificateService.js";
import { processAgentMessage } from "./agentService.js";
import type { AgentHistoryMessage, AgentToolLogEntry } from "./agentService.js";

export type WhatsAppConnectionStatus = "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED";

export interface WhatsAppStatus {
  status: WhatsAppConnectionStatus;
  qrCodeDataUrl: string | null;
  connectedPhone: string | null;
}

const AUTH_DIR = path.resolve(process.cwd(), "server/sessions/baileys_auth");
const CERTIFICATE_FILENAME = "Certificado-Reto-Virgen-de-la-Paz.pdf";

const logger = pino({ level: "silent" });

function jidToPhone(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

function phoneToJid(phone: string): string {
  return `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
}

function extractMessageText(message: BaileysEventMap["messages.upsert"]["messages"][number]["message"]): string | null {
  if (!message) return null;
  return message.conversation ?? message.extendedTextMessage?.text ?? message.imageMessage?.caption ?? message.videoMessage?.caption ?? null;
}

class WhatsAppService {
  private sock: WASocket | null = null;
  private status: WhatsAppConnectionStatus = "DISCONNECTED";
  private qrCodeDataUrl: string | null = null;
  private connectedPhone: string | null = null;
  private starting = false;

  getStatus(): WhatsAppStatus {
    return { status: this.status, qrCodeDataUrl: this.qrCodeDataUrl, connectedPhone: this.connectedPhone };
  }

  // Arranca la conexión solo la primera vez que el panel admin pregunta por el estado —
  // evita abrir un socket de WhatsApp en cada boot del servidor si nadie va a usar el CRM.
  async ensureStarted(): Promise<WhatsAppStatus> {
    if (this.status === "DISCONNECTED" && !this.starting) {
      this.start().catch((err) => console.error("Error iniciando WhatsApp:", err));
    }
    return this.getStatus();
  }

  async restart(): Promise<WhatsAppStatus> {
    await this.teardownSocket();
    this.status = "DISCONNECTED";
    this.qrCodeDataUrl = null;
    this.start().catch((err) => console.error("Error reiniciando WhatsApp:", err));
    return this.getStatus();
  }

  async logout(): Promise<WhatsAppStatus> {
    try {
      await this.sock?.logout();
    } catch {
      // puede que el socket ya esté muerto; igual limpiamos las credenciales locales
    }
    await this.teardownSocket();
    rmSync(AUTH_DIR, { recursive: true, force: true });
    this.status = "DISCONNECTED";
    this.qrCodeDataUrl = null;
    this.connectedPhone = null;
    this.start().catch((err) => console.error("Error reconectando WhatsApp tras logout:", err));
    return this.getStatus();
  }

  async sendMessage(phone: string, text: string): Promise<boolean> {
    if (!this.sock || this.status !== "CONNECTED") return false;
    try {
      await this.sock.sendMessage(phoneToJid(phone), { text });
      return true;
    } catch (err) {
      console.error("Error enviando mensaje de WhatsApp:", err);
      return false;
    }
  }

  async sendDocument(phone: string, buffer: Buffer, fileName: string): Promise<boolean> {
    if (!this.sock || this.status !== "CONNECTED") return false;
    try {
      await this.sock.sendMessage(phoneToJid(phone), { document: buffer, mimetype: "application/pdf", fileName });
      return true;
    } catch (err) {
      console.error("Error enviando documento de WhatsApp:", err);
      return false;
    }
  }

  private async teardownSocket(): Promise<void> {
    const sock = this.sock;
    this.sock = null;
    if (!sock) return;
    try {
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("messages.upsert");
      sock.ev.removeAllListeners("creds.update");
      await sock.end(undefined);
    } catch {
      // el socket ya podría estar cerrado; no es un error real para nosotros
    }
  }

  private async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    this.status = "CONNECTING";

    try {
      mkdirSync(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        browser: ["Reto Virgen de la Paz", "Chrome", "1.0.0"],
      });
      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("connection.update", (update) => {
        this.handleConnectionUpdate(update).catch((err) => console.error("Error manejando conexión de WhatsApp:", err));
      });
      sock.ev.on("messages.upsert", (payload) => {
        this.handleIncomingMessages(payload).catch((err) => console.error("Error procesando mensaje de WhatsApp:", err));
      });
    } finally {
      this.starting = false;
    }
  }

  private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      this.status = "QR_READY";
    }

    if (connection === "open") {
      this.status = "CONNECTED";
      this.qrCodeDataUrl = null;
      const rawId = this.sock?.user?.id ?? "";
      this.connectedPhone = rawId ? jidToPhone(rawId) : null;
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      this.sock = null;

      if (loggedOut) {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        this.status = "DISCONNECTED";
        this.qrCodeDataUrl = null;
        this.connectedPhone = null;
      } else {
        // Corte temporal (red, reinicio de WhatsApp, etc.): reconecta con las credenciales existentes.
        this.status = "CONNECTING";
        this.start().catch((err) => console.error("Error reconectando WhatsApp:", err));
      }
    }
  }

  private async handleIncomingMessages({ messages, type }: BaileysEventMap["messages.upsert"]): Promise<void> {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || !jid.endsWith("@s.whatsapp.net")) continue; // ignora grupos (@g.us) y broadcasts

      const text = extractMessageText(msg.message);
      if (!text) continue;

      await this.processIncomingText(jidToPhone(jid), text, msg.pushName?.trim() || null);
    }
  }

  private async processIncomingText(phone: string, text: string, profileName: string | null): Promise<void> {
    const conversationId = await this.resolveConversation(phone, text, profileName);

    await pool.query(`INSERT INTO crm_messages (conversation_id, sender, message_body) VALUES ($1, 'ATHLETE', $2)`, [
      conversationId,
      text,
    ]);

    const stateRes = await pool.query("SELECT bot_active FROM conversations WHERE id = $1", [conversationId]);
    const botActive = Boolean(stateRes.rows[0]?.bot_active);

    if (!botActive) {
      // El organizador ya tomó el control: solo dejamos el mensaje en la bandeja para que lo vea.
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

    await this.sendMessage(phone, agentResult.reply);

    const certificateCall = agentResult.toolCalls.find((t) => t.name === "reenviar_certificado");
    if (certificateCall) {
      await this.sendCertificateDocumentIfEligible(phone, certificateCall);
    }
  }

  // El correo del certificado ya lo dispara la propia tool `reenviar_certificado`
  // (vía dispatchCertificateEmail); aquí además lo mandamos como documento adjunto
  // al mismo chat de WhatsApp desde donde el atleta lo pidió.
  private async sendCertificateDocumentIfEligible(phone: string, certificateCall: AgentToolLogEntry): Promise<void> {
    const ci = typeof certificateCall.args?.ci === "string" ? certificateCall.args.ci : null;
    if (!ci) return;

    const res = await pool.query(
      "SELECT id, full_name, ci, route, jersey_cut, jersey_size, bib_number, qr_token, email, payment_status FROM athletes WHERE ci = $1",
      [ci.trim()],
    );
    if (res.rows.length === 0) return;

    const a = res.rows[0];
    if (a.payment_status !== "PAID") return;

    const pdfBuffer = await generateCertificatePdf({
      athleteId: a.id,
      fullName: a.full_name,
      ci: a.ci,
      route: a.route,
      jerseyCut: a.jersey_cut,
      jerseySize: a.jersey_size,
      bibNumber: a.bib_number,
      qrToken: a.qr_token,
      email: a.email ?? "",
    });

    await this.sendDocument(phone, pdfBuffer, CERTIFICATE_FILENAME);
  }

  private async resolveConversation(phone: string, firstMessage: string, profileName: string | null): Promise<string> {
    const existing = await pool.query(
      "SELECT id FROM conversations WHERE contact_identifier = $1 AND channel = 'WHATSAPP' LIMIT 1",
      [phone],
    );
    if (existing.rows.length > 0) {
      if (profileName) {
        await pool.query("UPDATE conversations SET wa_profile_name = $1 WHERE id = $2", [profileName, existing.rows[0].id]);
      }
      return existing.rows[0].id;
    }

    // Vincula automáticamente con el atleta si su teléfono registrado coincide. Comparamos
    // solo los últimos 10 dígitos porque el formato local "0412-XXXXXXX" (11 dígitos con
    // el 0 inicial) y el que entrega WhatsApp "58412XXXXXXX" (código de país 58) comparten
    // el mismo número de abonado pero difieren en el prefijo.
    const athleteMatch = await pool.query(
      `SELECT id FROM athletes
       WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = RIGHT(regexp_replace($1, '\\D', '', 'g'), 10)
       LIMIT 1`,
      [phone],
    );
    const athleteId = athleteMatch.rows[0]?.id ?? null;

    const created = await pool.query(
      `INSERT INTO conversations (athlete_id, channel, contact_identifier, wa_profile_name, last_message)
       VALUES ($1, 'WHATSAPP', $2, $3, $4) RETURNING id`,
      [athleteId, phone, profileName, firstMessage],
    );
    return created.rows[0].id;
  }
}

export const whatsappService = new WhatsAppService();
