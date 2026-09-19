import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_VERSION = "v21.0";

function phoneNumberId(): string | undefined {
  return process.env.META_PHONE_NUMBER_ID;
}

function whatsappToken(): string | undefined {
  return process.env.META_WHATSAPP_TOKEN;
}

let warnedNoAppSecret = false;

export interface MetaConfigStatus {
  configured: boolean;
  phoneNumberId: string | null;
  verifyTokenSet: boolean;
}

export function getConfigStatus(): MetaConfigStatus {
  return {
    configured: Boolean(whatsappToken() && phoneNumberId()),
    phoneNumberId: phoneNumberId() ?? null,
    verifyTokenSet: Boolean(process.env.META_VERIFY_TOKEN),
  };
}

export function verifyToken(token: string): boolean {
  const expected = process.env.META_VERIFY_TOKEN;
  return Boolean(expected) && token === expected;
}

// Meta firma cada entrega de webhook con X-Hub-Signature-256 (HMAC-SHA256 del body crudo
// con el App Secret). Sin META_APP_SECRET configurado no podemos validar la firma —
// se deja pasar en modo desarrollo, mismo criterio que el resto de servicios en modo mock.
export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    if (!warnedNoAppSecret) {
      console.warn("META_APP_SECRET no configurado: se omite la verificación de firma del webhook de Meta.");
      warnedNoAppSecret = true;
    }
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

async function graphFetch(path: string, init: RequestInit): Promise<Response | null> {
  const token = whatsappToken();
  if (!token) return null;
  return fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

// Número de contacto de los organizadores (Gustavo Briceño) para alertas del sistema —
// nuevas inscripciones, escalamientos del bot a un humano, etc. Configurable por si el
// contacto cambia sin necesitar un deploy de código.
const DEFAULT_ORGANIZER_PHONE = "584140746270";

export function organizerWhatsAppPhone(): string {
  return process.env.ORGANIZER_WHATSAPP_PHONE || DEFAULT_ORGANIZER_PHONE;
}

export async function sendOrganizerAlert(text: string): Promise<boolean> {
  return sendTextMessage(organizerWhatsAppPhone(), text);
}

export async function sendTextMessage(to: string, text: string): Promise<boolean> {
  const phoneId = phoneNumberId();
  if (!phoneId) return false;

  try {
    const res = await graphFetch(`${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    if (!res || !res.ok) {
      if (res) console.error("Error enviando mensaje por Meta WhatsApp:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error enviando mensaje por Meta WhatsApp:", err);
    return false;
  }
}

async function uploadMedia(buffer: Buffer, filename: string): Promise<string | null> {
  const phoneId = phoneNumberId();
  if (!phoneId) return null;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);

  try {
    const res = await graphFetch(`${phoneId}/media`, { method: "POST", body: form });
    if (!res || !res.ok) {
      if (res) console.error("Error subiendo media a Meta WhatsApp:", await res.text());
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (err) {
    console.error("Error subiendo media a Meta WhatsApp:", err);
    return null;
  }
}

export async function sendDocumentBuffer(to: string, buffer: Buffer, filename: string): Promise<boolean> {
  const phoneId = phoneNumberId();
  if (!phoneId) return false;

  const mediaId = await uploadMedia(buffer, filename);
  if (!mediaId) return false;

  try {
    const res = await graphFetch(`${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { id: mediaId, filename },
      }),
    });
    if (!res || !res.ok) {
      if (res) console.error("Error enviando documento por Meta WhatsApp:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error enviando documento por Meta WhatsApp:", err);
    return false;
  }
}
