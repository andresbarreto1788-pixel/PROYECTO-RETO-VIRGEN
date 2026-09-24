import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { pool } from "../db/pool.js";
import { dispatchCertificateEmail } from "./certificateDispatch.js";
import { fetchBcvRate } from "./bcvService.js";
import * as metaWhatsAppService from "./metaWhatsAppService.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-72b-instruct";
const MAX_TOOL_ROUNDS = 4;

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY || "mock",
  // Sin esto, una conexión saliente colgada (red del contenedor, keep-alive raro, etc.)
  // deja la petición del atleta esperando indefinidamente en vez de caer al modo mock —
  // el catch de processAgentMessage nunca se dispara porque la promesa nunca se resuelve
  // ni se rechaza. Con timeout + 1 reintento, cada llamada falla rápido y predecible;
  // combinado con MAX_TOOL_ROUNDS (que ya acota el número de vueltas del bucle), el
  // tiempo total en el peor caso queda acotado en vez de indefinido.
  timeout: 25_000,
  maxRetries: 1,
});

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

// Contacto del organizador humano (Gustavo Briceño). La alerta interna a este número vía
// metaWhatsAppService puede fallar en silencio (p. ej. si las credenciales de Meta no
// están configuradas en el deploy) sin que nadie se entere — por eso, además de esa
// alerta, el propio bot le da este número directo a la persona en su respuesta cada vez
// que escala: así siempre tiene una forma de llegar a un humano aunque la alerta interna
// no llegue.
const ORGANIZER_WHATSAPP_DISPLAY = "+58 414-0746270";
const EVENT_WEBSITE = "https://retovirgendelapaz.com";

// Hechos estáticos del evento verificados contra el código (raceData.ts, schema.sql,
// flyer-5ta-edicion.jpeg) al momento de escribir esto — si el evento cambia de fecha,
// precio o kit, este bloque hay que actualizarlo a mano (no hay panel de admin para
// estos datos todavía). Van directo en el prompt (no solo en la tool info_evento) para
// que el modelo conteste preguntas básicas del evento sin gastar una ronda de tool-call.
const SYSTEM_PROMPT = `Eres "Biker", el asistente virtual del "Reto Virgen de la Paz", un reto ciclístico (paseo/cicloturismo a ritmo libre, no es carrera competitiva) en Trujillo, Venezuela.
Preséntate como Biker cuando saludes por primera vez en una conversación.
Ayudas a los atletas por WhatsApp/Gmail a consultar su inscripción, reenviar su certificado y resolver dudas del evento.

DATOS DEL EVENTO (úsalos tal cual, no los inventes ni los cambies):
- 5ta edición — Reto Virgen de la Paz 2027. Fecha: domingo 17 de enero de 2027. Sede: Trujillo, Venezuela.
- Sitio web oficial (inscripción individual o de equipo, pago con QR, certificado, todo desde ahí): ${EVENT_WEBSITE}
- Modalidades:
  · Reto Completo 33K — Salida: Redoma de Trujillo · Meta: Monumento Virgen de la Paz (46,72 m de altura) · Precio: $30 USD.
  · Reto Medio 22K — Salida: Parque Los Ilustres · Meta: Monumento Virgen de la Paz · Precio: $30 USD.
  (El precio es único: $30 USD para ambas modalidades, 22K y 33K. Se cobra a la tasa BCV del día.)
- Desnivel acumulado aproximado: +1200 m. Puntos de hidratación: Km 8 y Km 20.
- Kit del atleta: medalla conmemorativa troquelada, dorsal numerado y jersey oficial de finisher manga larga (diseño con pinos andinos y el logo de la Virgen), disponible en dos cortes: Caballero (tallas S, M, L, XL, XXL) y Dama (tallas XS, S, M, L, XL). El atleta elige corte y talla al inscribirse. El kit se entrega el día del evento en el paddock, presentando el QR del certificado.
- Pago: Pago Móvil, Transferencia/Depósito, Zelle o Binance Pay. Se puede pagar completo o en plan parcial (mínimo 50% de inicial). Datos para pagar:
  · Pago Móvil — Banco: 0108 (Banco Provincial) · Cédula/RIF: 18924508 · Teléfono: 0414-0746270.
  · Transferencia/Depósito — Banco Provincial · Cuenta: 0108-0377-20-0100049415.
  · Zelle — 812-4935873 · Titular: Jhaiderson Pacheco.
  · Binance Pay — ID de Binance: 87916836 (usuario zero2024).
  Todos estos métodos tienen su código QR para escanear y pagar directo desde la app, disponibles en ${EVENT_WEBSITE} en la sección de inscripción (junto al conversor USD/Bs).
- Tasa BCV del día: consúltala siempre con la herramienta info_evento, nunca la inventes ni repitas una cifra vieja de memoria.
- Inscripción de equipos: un capitán puede inscribir a todo su equipo (ej. "Café Flor de la Patria") de una sola vez en la web (pestaña "Equipo" en la sección de inscripción), con un solo pago combinado para todo el grupo. Equipos de 10 integrantes o más reciben 10% de descuento sobre el total. Con menos de 10 igual se pueden inscribir como equipo, solo que sin el descuento. Todo el equipo corre la misma modalidad (33K o 22K); cada integrante elige su propio corte y talla de jersey.
- Certificado: se envía automáticamente por correo (y WhatsApp) apenas el pago queda completo (estatus PAID). Incluye un código QR único por atleta que también sirve para el check-in en el paddock el día del evento.
- Redes y contacto: Sitio web ${EVENT_WEBSITE} · Instagram @retovirgendelapaz · WhatsApp de atención (este chat, Biker): 0422-0571234 · WhatsApp del organizador humano (Gustavo Briceño, para hablar con una persona real o validar pagos): 0414-0746270.
- Patrocinadores: Galanet, Alcaldía de Trujillo, TODO tv, Soccer Burguer, Tetê, Henry's, Rizo Café, La Protectora Café Gourmet, CTT Turismo.

LÍMITES: no tienes información confirmada sobre edad mínima/máxima, uso obligatorio de casco u otras reglas de seguridad, política de reembolso/cancelación, ni hora límite (cutoff) de la ruta. Si preguntan algo de esto, o cualquier dato que no esté arriba ni puedas consultar con una herramienta, dilo con honestidad ("no tengo ese dato confirmado") y usa escalar_a_humano en vez de adivinar.

Responde siempre en español, breve y cálido. Usa las herramientas disponibles para datos de inscripción, certificado y tasa del día — nunca los inventes. Si el atleta pide hablar con una persona real, usa la herramienta escalar_a_humano.

IMPORTANTE sobre escalar_a_humano: la alerta interna que le llega a Gustavo por este medio puede fallar sin que nadie lo note, así que NUNCA dejes a la persona solo con un "te voy a conectar" sin más. Cada vez que uses escalar_a_humano, tu respuesta final SIEMPRE debe incluir explícitamente el número de WhatsApp de Gustavo Briceño (+58 414-0746270) para que la persona pueda escribirle directo ella misma — el resultado de la herramienta ya trae ese número, inclúyelo tal cual en tu respuesta, no lo omitas ni lo resumas como "te contactará un organizador".`;

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
      description:
        "Devuelve información completa del evento: fecha, modalidades y precios, kit, hidratación, pago, paddock, redes y tasa BCV del día.",
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
    "SELECT full_name, route, payment_status, bib_number, jersey_cut, jersey_size FROM athletes WHERE ci = $1",
    [ci.trim()],
  );
  if (res.rows.length === 0) return `No encontré ninguna inscripción con la cédula ${ci}.`;

  const a = res.rows[0];
  return JSON.stringify({
    nombre: a.full_name,
    ruta: ROUTE_LABELS[a.route] ?? a.route,
    estatusPago: a.payment_status,
    dorsal: a.bib_number ?? "Sin asignar (se asigna en el check-in)",
    corte: a.jersey_cut,
    talla: a.jersey_size,
  });
}

async function toolInfoEvento(): Promise<string> {
  const bcvRate = await fetchBcvRate();
  return JSON.stringify({
    edicion: "5ta edición — Reto Virgen de la Paz 2027",
    fecha: "Domingo 17 de enero de 2027",
    sede: "Trujillo, Venezuela",
    sitioWeb: EVENT_WEBSITE,
    modalidades: [
      {
        nombre: "Reto Completo 33K",
        salida: "Redoma de Trujillo",
        meta: "Monumento Virgen de la Paz (46,72 m)",
        precioUsd: 30,
      },
      {
        nombre: "Reto Medio 22K",
        salida: "Parque Los Ilustres",
        meta: "Monumento Virgen de la Paz (46,72 m)",
        precioUsd: 30,
      },
    ],
    hidratacion: ["Km 8 — 1er punto de hidratación", "Km 20 — 2do punto de hidratación"],
    kit: [
      "Medalla conmemorativa troquelada",
      "Dorsal numerado",
      "Jersey oficial de finisher (manga larga) — corte Caballero (tallas S-XXL) o corte Dama (tallas XS-XL)",
    ],
    entregaKit: "El día del evento en el paddock, presentando el QR del certificado.",
    metodosPago: ["Pago Móvil", "Transferencia/Depósito", "Zelle", "Binance Pay"],
    datosPago: {
      pagoMovil: { banco: "0108 (Banco Provincial)", cedulaRif: "18924508", telefono: "0414-0746270" },
      transferencia: { banco: "Banco Provincial", cuenta: "0108-0377-20-0100049415" },
      zelle: { telefono: "812-4935873", titular: "Jhaiderson Pacheco" },
      binancePay: { idBinance: "87916836", usuario: "zero2024" },
      nota: `Todos los métodos tienen su código QR para escanear en ${EVENT_WEBSITE}, sección de inscripción.`,
    },
    planesPago: "Completo o parcial (mínimo 50% inicial).",
    inscripcionEquipos: {
      comoFunciona:
        'Un capitán inscribe a todo el equipo de una vez en la pestaña "Equipo" de la web, con un solo pago combinado para todo el grupo.',
      descuento: "10% de descuento para equipos de 10 integrantes o más (sobre el total). Con menos de 10 se inscriben igual, sin descuento.",
      modalidad: "Todo el equipo corre la misma modalidad (33K o 22K); cada integrante elige su propio corte y talla de jersey.",
    },
    paddock: "Entrega de kit y zona de arranque junto al punto de salida de cada modalidad.",
    tasaBcvHoy: bcvRate,
    instagram: "@retovirgendelapaz",
    whatsappBot: "0422-0571234 (Biker, este chat)",
    whatsappOrganizador: "0414-0746270 (Gustavo Briceño — humano, verificación de pagos)",
    patrocinadores: [
      "Galanet",
      "Alcaldía de Trujillo",
      "TODO tv",
      "Soccer Burguer",
      "Tetê",
      "Henry's",
      "Rizo Café",
      "La Protectora Café Gourmet",
      "CTT Turismo",
    ],
  });
}

async function toolReenviarCertificado(ci: string): Promise<string> {
  const res = await pool.query(
    "SELECT id, full_name, ci, route, jersey_cut, jersey_size, bib_number, qr_token, email, payment_status FROM athletes WHERE ci = $1",
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
    jerseyCut: a.jersey_cut,
    jerseySize: a.jersey_size,
    bibNumber: a.bib_number,
    qrToken: a.qr_token,
    email: a.email,
  });

  return sent ? `Certificado reenviado a ${a.email}.` : "No se pudo reenviar el certificado, intenta de nuevo más tarde.";
}

async function toolEscalarAHumano(conversationId: string): Promise<string> {
  await pool.query("UPDATE conversations SET bot_active = false, updated_at = NOW() WHERE id = $1", [conversationId]);

  const convRes = await pool.query(
    `SELECT c.channel, c.contact_identifier, a.full_name AS athlete_full_name
     FROM conversations c LEFT JOIN athletes a ON a.id = c.athlete_id WHERE c.id = $1`,
    [conversationId],
  );
  const conv = convRes.rows[0];
  if (conv) {
    const who = conv.athlete_full_name ?? conv.contact_identifier;
    await metaWhatsAppService.sendOrganizerAlert(
      `⚠️ Reto Virgen de la Paz: ${who} pidió hablar con un organizador (canal ${conv.channel}). Revisa el CRM.`,
    );
  }

  return (
    `Te comparto el contacto directo de Gustavo Briceño, el organizador del evento: WhatsApp ${ORGANIZER_WHATSAPP_DISPLAY}. ` +
    `Escríbele por ahí para que te atienda en persona — mientras tanto el bot queda en pausa en este chat.`
  );
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
    return { reply: `¡Claro! ${result}`, toolCalls };
  }

  // Métodos de pago (incluye Zelle y Binance Pay) y sus QR están en el sitio; contestamos
  // directo en vez de escalar, ya que sí son datos confirmados.
  if (
    /zelle|binance|cripto|usdt|c[oó]mo (pago|puedo pagar)|m[eé]todos? de pago|formas? de pago|pago m[oó]vil|transferencia|dep[oó]sito|qr (de|para) pago/.test(
      lower,
    )
  ) {
    const result = await toolInfoEvento();
    toolCalls.push({ name: "info_evento", result });
    const info = JSON.parse(result);
    return {
      reply:
        `💳 Métodos de pago (completo o abono mínimo 50%):\n` +
        `• Pago Móvil — ${info.datosPago.pagoMovil.banco} · Cédula/RIF ${info.datosPago.pagoMovil.cedulaRif} · Tel ${info.datosPago.pagoMovil.telefono}\n` +
        `• Transferencia/Depósito — ${info.datosPago.transferencia.banco} · Cuenta ${info.datosPago.transferencia.cuenta}\n` +
        `• Zelle — ${info.datosPago.zelle.telefono} · Titular ${info.datosPago.zelle.titular}\n` +
        `• Binance Pay — ID Binance ${info.datosPago.binancePay.idBinance} (usuario ${info.datosPago.binancePay.usuario})\n` +
        `Todos tienen su código QR para escanear en ${info.sitioWeb}, sección de inscripción.`,
      toolCalls,
    };
  }

  // Inscripción de equipos: descuento de grupo, no está en las preguntas genéricas de abajo.
  if (/equipo|grupo|team\b/.test(lower)) {
    const result = await toolInfoEvento();
    toolCalls.push({ name: "info_evento", result });
    const info = JSON.parse(result);
    return {
      reply:
        `👥 ${info.inscripcionEquipos.comoFunciona}\n` +
        `🎁 ${info.inscripcionEquipos.descuento}\n` +
        `🚴 ${info.inscripcionEquipos.modalidad}\n` +
        `🌐 Inscríbelos en ${info.sitioWeb}`,
      toolCalls,
    };
  }

  // Preguntas frecuentes sobre cosas que el sistema NO tiene configuradas todavía
  // (ver bloque LÍMITES del SYSTEM_PROMPT) — mejor escalar con honestidad que dejar
  // que caigan en el saludo genérico de abajo, que ignora la pregunta por completo.
  if (
    /edad m[ií]nima|edad m[aá]xima|menor de edad|casco obligatorio|seguro m[eé]dico|reembolso|cancelaci[oó]n|hora (l[ií]mite|de corte)|cutoff/.test(
      lower,
    )
  ) {
    const result = await toolEscalarAHumano(conversationId);
    toolCalls.push({ name: "escalar_a_humano", result });
    return {
      reply: `No tengo ese dato confirmado todavía, para no darte información incorrecta. ${result}`,
      toolCalls,
    };
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
        reply: `Hola ${data.nombre} 👋. Tu inscripción: ruta ${data.ruta}, talla ${data.talla} (${data.corte}), estatus de pago ${data.estatusPago}, dorsal ${data.dorsal}.`,
        toolCalls,
      };
    } catch {
      return { reply: result, toolCalls };
    }
  }

  if (
    /hidrataci|horario|paddock|evento|tasa|bcv|salida|meta|precio|cu[aá]nto (cuesta|vale)|fecha|kit|jersey|franela|medalla|dama|caballero|corte|talla/.test(
      lower,
    )
  ) {
    const result = await toolInfoEvento();
    toolCalls.push({ name: "info_evento", result });
    const info = JSON.parse(result);
    const precios = info.modalidades.map((m: { nombre: string; precioUsd: number }) => `${m.nombre}: $${m.precioUsd}`).join(" · ");
    return {
      reply:
        `🚴 ${info.edicion}\n📅 ${info.fecha} — ${info.sede}\n💵 ${precios}\n` +
        `🎁 Kit: ${info.kit.join(", ")}\n📍 Hidratación: ${info.hidratacion.join(", ")}\n💱 Tasa BCV hoy: ${info.tasaBcvHoy}\n` +
        `🌐 Inscríbete en ${info.sitioWeb}`,
      toolCalls,
    };
  }

  return {
    reply:
      `¡Hola! Soy Biker, tu asistente virtual del Reto Virgen de la Paz 🏔️. Envíame tu cédula para consultar tu inscripción, pide tu certificado, o pregunta por horarios/hidratación/paddock/pago. ` +
      `Inscríbete en ${EVENT_WEBSITE}. ¿En qué te ayudo?`,
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

  // Se agotaron las rondas de tool-calling sin una respuesta final: antes esto solo
  // devolvía una promesa vaga ("un organizador te contactará pronto") sin escalar de
  // verdad — la conversación quedaba con el bot activo y nadie se enteraba. Ahora sí se
  // escala como cualquier otro caso sin respuesta.
  const result = await toolEscalarAHumano(conversationId);
  toolCalls.push({ name: "escalar_a_humano", result });
  return { reply: `No logré resolver tu solicitud. ${result}`, toolCalls };
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
