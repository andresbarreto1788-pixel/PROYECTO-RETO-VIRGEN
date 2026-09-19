import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { pool } from "../db/pool.js";
import { dispatchCertificateEmail } from "./certificateDispatch.js";
import { fetchBcvRate } from "./bcvService.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-72b-instruct";
const MAX_TOOL_ROUNDS = 4;

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY || "mock",
});

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

const SYSTEM_PROMPT = `Eres el asistente virtual del "Reto Virgen de la Paz" (evento ciclístico en Trujillo, Venezuela).
Ayudas a los atletas por WhatsApp/Gmail a consultar su inscripción, reenviar su certificado y resolver dudas del evento.
Responde siempre en español, breve y cálido. Usa las herramientas disponibles en vez de inventar datos de inscripción.
Si el atleta pide hablar con una persona real, usa la herramienta escalar_a_humano.`;

export interface AgentToolLogEntry {
  name: string;
  args?: Record<string, unknown>;
  result: string;
}

export interface AgentResponse {
  reply: string;
  toolCalls: AgentToolLogEntry[];
  mode: "mock" | "openrouter";
}

export interface AgentHistoryMessage {
  sender: "ATHLETE" | "BOT" | "ORGANIZER";
  messageBody: string;
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_atleta",
      description: "Consulta los datos de inscripción de un atleta a partir de su cédula o pasaporte.",
      parameters: {
        type: "object",
        properties: { ci: { type: "string", description: "Cédula o pasaporte del atleta, ej. V-12345678" } },
        required: ["ci"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "info_evento",
      description: "Devuelve información general del evento: puntos de hidratación, horarios, paddock y tasa BCV del día.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "reenviar_certificado",
      description: "Regenera y reenvía por correo el certificado oficial de un atleta a partir de su cédula.",
      parameters: {
        type: "object",
        properties: { ci: { type: "string", description: "Cédula o pasaporte del atleta" } },
        required: ["ci"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalar_a_humano",
      description: "Pausa al bot y transfiere la conversación actual a un organizador humano.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function toolConsultarAtleta(ci: string): Promise<string> {
  const res = await pool.query(
    "SELECT full_name, route, payment_status, bib_number, jersey_size FROM athletes WHERE ci = $1",
    [ci.trim()],
  );
  if (res.rows.length === 0) return `No encontré ninguna inscripción con la cédula ${ci}.`;

  const a = res.rows[0];
  return JSON.stringify({
    nombre: a.full_name,
    ruta: ROUTE_LABELS[a.route] ?? a.route,
    estatusPago: a.payment_status,
    dorsal: a.bib_number ?? "Sin asignar (se asigna en el check-in)",
    talla: a.jersey_size,
  });
}

async function toolInfoEvento(): Promise<string> {
  const bcvRate = await fetchBcvRate();
  return JSON.stringify({
    hidratacion: ["Km 8 — 1er punto de hidratación", "Km 20 — 2do punto de hidratación"],
    salidas: "33K desde la Redoma de Trujillo · 22K desde el Parque Los Ilustres",
    meta: "Monumento Virgen de la Paz (46,72 m de altura)",
    paddock: "Entrega de kit y zona de arranque junto al punto de salida de cada modalidad.",
    tasaBcvHoy: bcvRate,
  });
}

async function toolReenviarCertificado(ci: string): Promise<string> {
  const res = await pool.query(
    "SELECT id, full_name, ci, route, jersey_size, bib_number, qr_token, email, payment_status FROM athletes WHERE ci = $1",
    [ci.trim()],
  );
  if (res.rows.length === 0) return `No encontré ninguna inscripción con la cédula ${ci}.`;

  const a = res.rows[0];
  if (!a.email) return `El atleta ${a.full_name} no tiene un correo registrado; no puedo reenviarle el certificado.`;
  if (a.payment_status !== "PAID") {
    return `El atleta ${a.full_name} todavía no está solvente (estatus: ${a.payment_status}); el certificado se emite al completar el pago.`;
  }

  const sent = await dispatchCertificateEmail({
    athleteId: a.id,
    fullName: a.full_name,
    ci: a.ci,
    route: a.route,
    jerseySize: a.jersey_size,
    bibNumber: a.bib_number,
    qrToken: a.qr_token,
    email: a.email,
  });

  return sent ? `Certificado reenviado a ${a.email}.` : "No se pudo reenviar el certificado, intenta de nuevo más tarde.";
}

async function toolEscalarAHumano(conversationId: string): Promise<string> {
  await pool.query("UPDATE conversations SET bot_active = false, updated_at = NOW() WHERE id = $1", [conversationId]);
  return "Conversación transferida a un organizador humano. El bot queda en pausa.";
}

async function executeTool(name: string, args: Record<string, unknown>, conversationId: string): Promise<string> {
  switch (name) {
    case "consultar_atleta":
      return toolConsultarAtleta(String(args.ci ?? ""));
    case "info_evento":
      return toolInfoEvento();
    case "reenviar_certificado":
      return toolReenviarCertificado(String(args.ci ?? ""));
    case "escalar_a_humano":
      return toolEscalarAHumano(conversationId);
    default:
      return `Herramienta desconocida: ${name}`;
  }
}

// --- Modo MOCK (sin OPENROUTER_API_KEY): heurística simple por palabras clave ---

function extractCi(message: string): string | null {
  const match = message.match(/[A-Za-z]?-?\d{5,9}/);
  return match ? match[0] : null;
}

async function runMock(conversationId: string, message: string): Promise<{ reply: string; toolCalls: AgentToolLogEntry[] }> {
  const lower = message.toLowerCase();
  const toolCalls: AgentToolLogEntry[] = [];
  const ci = extractCi(message);

  if (/humano|asesor|organizador|con (una persona|alguien)/.test(lower)) {
    const result = await toolEscalarAHumano(conversationId);
    toolCalls.push({ name: "escalar_a_humano", result });
    return { reply: `Entendido, te conecto con un organizador. ${result}`, toolCalls };
  }

  if (/certificado|constancia|reenv/.test(lower) && ci) {
    const result = await toolReenviarCertificado(ci);
    toolCalls.push({ name: "reenviar_certificado", args: { ci }, result });
    return { reply: result, toolCalls };
  }

  if (ci) {
    const result = await toolConsultarAtleta(ci);
    toolCalls.push({ name: "consultar_atleta", args: { ci }, result });
    try {
      const data = JSON.parse(result);
      return {
        reply: `Hola ${data.nombre} 👋. Tu inscripción: ruta ${data.ruta}, talla ${data.talla}, estatus de pago ${data.estatusPago}, dorsal ${data.dorsal}.`,
        toolCalls,
      };
    } catch {
      return { reply: result, toolCalls };
    }
  }

  if (/hidrataci|horario|paddock|evento|tasa|bcv|salida|meta/.test(lower)) {
    const result = await toolInfoEvento();
    toolCalls.push({ name: "info_evento", result });
    const info = JSON.parse(result);
    return {
      reply: `📍 Hidratación: ${info.hidratacion.join(", ")}.\n🚴 Salidas: ${info.salidas}\n🏁 Meta: ${info.meta}\n💵 Tasa BCV hoy: ${info.tasaBcvHoy}`,
      toolCalls,
    };
  }

  return {
    reply:
      "¡Hola! Soy el asistente del Reto Virgen de la Paz 🏔️. Envíame tu cédula para consultar tu inscripción, pide tu certificado, o pregunta por horarios/hidratación/paddock. ¿En qué te ayudo?",
    toolCalls,
  };
}

// --- Modo OpenRouter real: bucle de tool calling con el SDK de OpenAI ---

async function runOpenRouter(
  conversationId: string,
  messages: ChatCompletionMessageParam[],
): Promise<{ reply: string; toolCalls: AgentToolLogEntry[] }> {
  const toolCalls: AgentToolLogEntry[] = [];
  const conversation: ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: conversation,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    const functionCalls = (choice.tool_calls ?? []).filter((call) => call.type === "function");
    if (functionCalls.length === 0) {
      return { reply: choice.content ?? "No tengo una respuesta en este momento.", toolCalls };
    }

    conversation.push(choice);

    for (const call of functionCalls) {
      const args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      const result = await executeTool(call.function.name, args, conversationId);
      toolCalls.push({ name: call.function.name, args, result });
      conversation.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return { reply: "No pude completar tu solicitud en este momento, un organizador te contactará pronto.", toolCalls };
}

export async function processAgentMessage(
  conversationId: string,
  message: string,
  history: AgentHistoryMessage[] = [],
): Promise<AgentResponse> {
  if (!OPENROUTER_API_KEY) {
    const result = await runMock(conversationId, message);
    return { ...result, mode: "mock" };
  }

  try {
    const historyMessages: ChatCompletionMessageParam[] = history.map((m) => ({
      role: m.sender === "ATHLETE" ? "user" : "assistant",
      content: m.messageBody,
    }));
    historyMessages.push({ role: "user", content: message });

    const result = await runOpenRouter(conversationId, historyMessages);
    return { ...result, mode: "openrouter" };
  } catch (err) {
    console.error("Error consultando OpenRouter, usando modo mock como fallback:", err);
    const result = await runMock(conversationId, message);
    return { ...result, mode: "mock" };
  }
}
