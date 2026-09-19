import { AlertTriangle, ArrowDown, Bot, MessageCircle, Pause, Play, Send, Settings, Sparkles, Trash2, UserCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, adminDelete, adminGet, adminPatch, adminPost } from "../../lib/api";
import type { Conversation, ConversationChannel, CrmMessage, CrmSender, PaymentStatus } from "../../types/admin";
import { ChannelSettingsModal } from "./ChannelSettingsModal";
import { CrmCommandCenter } from "./CrmCommandCenter";

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  WHATSAPP: "WhatsApp",
  GMAIL: "Gmail",
  SIMULATOR: "Simulador",
};

const CHANNEL_STYLES: Record<ConversationChannel, string> = {
  WHATSAPP: "bg-emerald-500/15 text-emerald-400",
  GMAIL: "bg-red-500/15 text-red-400",
  SIMULATOR: "bg-brand-blue/15 text-brand-blue",
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "Solvente",
  PARTIAL: "Por Cuotas",
  PENDING_REVIEW: "Pendiente",
  REJECTED: "Rechazado",
};

const STATUS_STYLES: Record<PaymentStatus, string> = {
  PAID: "bg-emerald-500/15 text-emerald-400",
  PARTIAL: "bg-yellow-500/15 text-yellow-400",
  PENDING_REVIEW: "bg-white/10 text-ink-muted",
  REJECTED: "bg-red-500/15 text-red-400",
};

const SENDER_BUBBLE: Record<CrmSender, string> = {
  ATHLETE: "mr-auto bg-white/10 text-ink",
  BOT: "ml-auto bg-brand-neon/15 text-ink",
  ORGANIZER: "ml-auto bg-brand-blue/20 text-ink",
};

const SENDER_LABELS: Record<CrmSender, string> = {
  ATHLETE: "Atleta",
  BOT: "Bot",
  ORGANIZER: "Organizador",
};

type StatusFilter = "ALL" | "PENDING" | "PARTIAL" | "PAID" | "ESCALATED";
type ChannelFilter = "ALL" | ConversationChannel;

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "ALL", label: "Todos" },
  { id: "PENDING", label: "Pendientes" },
  { id: "PARTIAL", label: "Abonados" },
  { id: "PAID", label: "Solventes" },
  { id: "ESCALATED", label: "Escalados" },
];

const CHANNEL_FILTERS: Array<{ id: ChannelFilter; label: string }> = [
  { id: "ALL", label: "Todos" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "GMAIL", label: "Gmail" },
  { id: "SIMULATOR", label: "Simulador" },
];

const DEMO_PROMPTS: Array<(ci: string) => string> = [
  (ci) => `Hola, quiero saber el estatus de mi inscripción. Mi cédula es ${ci}.`,
  () => "¿A qué hora es la salida y dónde están los puntos de hidratación?",
  (ci) => `¿Me pueden reenviar mi certificado? Mi cédula es ${ci}.`,
  () => "¿Cuál es la tasa BCV de hoy para pagar mi inscripción?",
  () => "Quiero hablar con una persona, no con el bot.",
];

function randomDemoContact(): { contactIdentifier: string; message: string } {
  const ci = `V-${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const phone = `+5841${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const prompt = DEMO_PROMPTS[Math.floor(Math.random() * DEMO_PROMPTS.length)];
  return { contactIdentifier: phone, message: prompt(ci) };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}

function formatListTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function matchesStatusFilter(c: Conversation, filter: StatusFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "ESCALATED") return !c.botActive;
  if (filter === "PENDING") return c.athletePaymentStatus == null || c.athletePaymentStatus === "PENDING_REVIEW";
  if (filter === "PARTIAL") return c.athletePaymentStatus === "PARTIAL";
  if (filter === "PAID") return c.athletePaymentStatus === "PAID";
  return true;
}

function matchesSearch(c: Conversation, query: string): boolean {
  if (!query) return true;
  const haystack = [c.athleteFullName, c.waProfileName, c.athleteCi, c.contactIdentifier, c.athleteEmail]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

interface ConversationsResponse {
  items: Conversation[];
}

interface MessagesResponse {
  items: CrmMessage[];
}

export function CrmPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const filteredConversations = useMemo(
    () =>
      conversations.filter(
        (c) =>
          matchesSearch(c, search.trim()) &&
          matchesStatusFilter(c, statusFilter) &&
          (channelFilter === "ALL" || c.channel === channelFilter),
      ),
    [conversations, search, statusFilter, channelFilter],
  );

  const loadConversations = useCallback(async () => {
    try {
      const res = await adminGet<ConversationsResponse>("/api/admin/crm/conversations");
      setConversations(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las conversaciones.");
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await adminGet<MessagesResponse>(`/api/admin/crm/conversations/${conversationId}/messages`);
      setMessages(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el historial del chat.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    setLoadingConversations(true);
    loadConversations().finally(() => setLoadingConversations(false));
  }, [loadConversations]);

  useEffect(() => {
    const interval = setInterval(loadConversations, 6000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    const interval = setInterval(() => loadMessages(selectedId), 4000);
    return () => clearInterval(interval);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (isPinnedToBottom) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPinnedToBottom]);

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsPinnedToBottom(distanceFromBottom < 80);
  }

  function scrollToLatest() {
    setIsPinnedToBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSelect(id: string) {
    setError(null);
    setNotice(null);
    setSelectedId(id);
    setIsPinnedToBottom(true);
  }

  function patchSelectedConversation(patch: Partial<Conversation>) {
    setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));
  }

  async function handleNewDemoConversation() {
    setError(null);
    setNotice(null);
    setCreatingDemo(true);
    const { contactIdentifier, message } = randomDemoContact();
    try {
      const res = await adminPost<{ conversation: Conversation; inboundMessage: CrmMessage; outboundMessage: CrmMessage | null }>(
        "/api/admin/crm/chat-simulation",
        { message, contactIdentifier, channel: "SIMULATOR" },
      );
      await loadConversations();
      setSelectedId(res.conversation.id);
      setIsPinnedToBottom(true);
      setMessages([res.inboundMessage, ...(res.outboundMessage ? [res.outboundMessage] : [])]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la conversación de prueba.");
    } finally {
      setCreatingDemo(false);
    }
  }

  async function handleToggleBot() {
    if (!selected) return;
    setTogglingBot(true);
    setError(null);
    try {
      const res = await adminPatch<{ conversation: Conversation }>(`/api/admin/crm/conversations/${selected.id}`, {
        botActive: !selected.botActive,
      });
      patchSelectedConversation(res.conversation);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado del bot.");
    } finally {
      setTogglingBot(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selected) return;
    if (!window.confirm("¿Eliminar este mensaje del historial del CRM? Esta acción no se puede deshacer.")) return;
    setDeletingMessageId(messageId);
    setError(null);
    try {
      await adminDelete(`/api/admin/crm/conversations/${selected.id}/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el mensaje.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleSend() {
    if (!selected || !draft.trim()) return;
    const text = draft.trim();
    setSending(true);
    setError(null);
    setIsPinnedToBottom(true);
    try {
      if (selected.channel === "SIMULATOR") {
        const res = await adminPost<{ conversation: Conversation; inboundMessage: CrmMessage; outboundMessage: CrmMessage | null }>(
          "/api/admin/crm/chat-simulation",
          { conversationId: selected.id, message: text, contactIdentifier: selected.contactIdentifier, channel: "SIMULATOR" },
        );
        setMessages((prev) => [...prev, res.inboundMessage, ...(res.outboundMessage ? [res.outboundMessage] : [])]);
      } else {
        const res = await adminPost<{ message: CrmMessage }>(`/api/admin/crm/conversations/${selected.id}/messages`, {
          message: text,
        });
        setMessages((prev) => [...prev, res.message]);
      }
      setDraft("");
      await loadConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">Centro de mando del CRM: WhatsApp (Meta Cloud API), Gmail y simulador.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-brand-card-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted hover:text-ink"
            >
              <Settings size={13} /> Configuración de Canales
            </button>
            <button
              type="button"
              onClick={handleNewDemoConversation}
              disabled={creatingDemo}
              className="inline-flex items-center gap-2 rounded-full bg-brand-neon px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-surface disabled:opacity-60"
            >
              <Sparkles size={13} /> {creatingDemo ? "Creando…" : "Nueva Conversación de Prueba"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full rounded-lg border border-brand-card-border bg-brand-card px-3 py-2 text-xs text-ink outline-none focus:border-brand-neon sm:max-w-xs"
            placeholder="Buscar por nombre, cédula, teléfono o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${
                  statusFilter === f.id ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setChannelFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${
                  channelFilter === f.id ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}
      {notice && <p className="text-xs font-semibold text-brand-neon">{notice}</p>}

      {settingsOpen && <ChannelSettingsModal onClose={() => setSettingsOpen(false)} />}

      <div className="grid gap-3 overflow-hidden rounded-xl border border-brand-card-border lg:grid-cols-[280px_1fr_300px]">
        {/* Panel izquierdo: lista de conversaciones */}
        <div className="max-h-[560px] overflow-y-auto border-b border-brand-card-border bg-brand-card lg:border-b-0 lg:border-r">
          {loadingConversations && conversations.length === 0 && (
            <p className="p-4 text-xs text-ink-muted">Cargando conversaciones…</p>
          )}
          {!loadingConversations && filteredConversations.length === 0 && (
            <p className="p-4 text-xs text-ink-muted">Sin conversaciones para este filtro.</p>
          )}
          {filteredConversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c.id)}
              className={`block w-full border-b border-white/5 px-3 py-3 text-left transition-colors ${
                c.id === selectedId ? "bg-brand-neon/10" : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-ink">
                  {c.athleteFullName ?? c.waProfileName ?? c.contactIdentifier}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${CHANNEL_STYLES[c.channel]}`}>
                  {CHANNEL_LABELS[c.channel]}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {c.athletePaymentStatus && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${STATUS_STYLES[c.athletePaymentStatus]}`}>
                    {STATUS_LABELS[c.athletePaymentStatus]}
                  </span>
                )}
                {!c.botActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-yellow-400">
                    <AlertTriangle size={9} /> Esperando humano
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[11px] text-ink-muted">{c.lastMessage ?? "Sin mensajes"}</p>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-muted">
                <span className={`inline-flex items-center gap-1 ${c.botActive ? "text-brand-neon" : "text-brand-blue"}`}>
                  <Bot size={11} /> {c.botActive ? "Bot activo" : "Bot pausado"}
                </span>
                <span>{formatListTimestamp(c.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Panel central: chat */}
        <div className="flex h-[560px] flex-col bg-surface">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-ink-muted">
              <MessageCircle size={28} />
              <p className="text-xs">Selecciona una conversación o crea una de prueba.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-brand-card-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-bold text-ink">
                      {selected.waProfileName ?? selected.athleteFullName ?? selected.contactIdentifier}
                    </p>
                    {selected.channel === "WHATSAPP" && (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-emerald-400">
                        WhatsApp
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-ink-muted">
                    {selected.channel === "WHATSAPP" ? (
                      <>
                        {selected.contactIdentifier}
                        {selected.metaWaId && selected.metaWaId !== selected.contactIdentifier
                          ? ` · ID WhatsApp: ${selected.metaWaId}`
                          : ""}
                      </>
                    ) : (
                      selected.contactIdentifier
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleBot}
                  disabled={togglingBot}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest disabled:opacity-50 ${
                    selected.botActive ? "bg-brand-blue/15 text-brand-blue" : "bg-yellow-500/15 text-yellow-400"
                  }`}
                  title={selected.botActive ? "Pausar el bot y responder como humano" : "Reactivar el bot para este contacto"}
                >
                  {selected.botActive ? <Pause size={11} /> : <Play size={11} />}
                  {togglingBot ? "Actualizando…" : selected.botActive ? "Pausar Bot" : "Reanudar Bot"}
                  <Bot size={11} />
                </button>
              </div>

              <div className="relative min-h-0 flex-1">
                <div onScroll={handleMessagesScroll} className="h-full space-y-2 overflow-y-auto p-4">
                  {loadingMessages && messages.length === 0 && <p className="text-xs text-ink-muted">Cargando mensajes…</p>}
                  {messages.map((m) => (
                    <div key={m.id} className={`group relative max-w-[75%] rounded-2xl px-3 py-2 text-xs ${SENDER_BUBBLE[m.sender]}`}>
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">{SENDER_LABELS[m.sender]}</p>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id)}
                          disabled={deletingMessageId === m.id}
                          title="Eliminar mensaje"
                          className="opacity-0 transition-opacity hover:text-red-400 disabled:opacity-50 group-hover:opacity-60"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      {m.emailSubject && <p className="mb-1 text-[10px] font-semibold italic opacity-80">Asunto: {m.emailSubject}</p>}
                      <p className="whitespace-pre-wrap">{m.messageBody}</p>
                      <p className="mt-1 text-right text-[9px] opacity-50">{formatTime(m.createdAt)}</p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {!isPinnedToBottom && (
                  <button
                    type="button"
                    onClick={scrollToLatest}
                    title="Ir a la conversación en tiempo real"
                    className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brand-neon px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-surface shadow-lg"
                  >
                    <ArrowDown size={13} /> En vivo
                  </button>
                )}
              </div>

              <div className="border-t border-brand-card-border p-3">
                <p className="mb-1.5 text-[10px] text-ink-muted">
                  {selected.channel === "SIMULATOR" ? (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles size={10} /> Escribiendo como el atleta (prueba el bot)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <UserCog size={10} /> Respondiendo como organizador (pausa el bot)
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-brand-card-border bg-brand-card px-3 py-2 text-xs text-ink outline-none focus:border-brand-neon"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Escribe un mensaje…"
                    disabled={sending}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-neon px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-surface disabled:opacity-50"
                  >
                    <Send size={12} /> Enviar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Panel derecho: Centro de Mando */}
        <div className="h-[560px] overflow-y-auto border-t border-brand-card-border bg-brand-card p-4 lg:border-l lg:border-t-0">
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-ink-muted">Centro de Mando</h3>
          {!selected ? (
            <p className="text-xs text-ink-muted">Selecciona una conversación.</p>
          ) : (
            <CrmCommandCenter
              conversation={selected}
              onLinked={loadConversations}
              onConversationPatched={patchSelectedConversation}
            />
          )}
        </div>
      </div>
    </div>
  );
}
