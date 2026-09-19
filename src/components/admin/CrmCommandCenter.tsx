import { CheckCircle2, FileText, Receipt, Search, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, adminGet, adminPatch, adminPost } from "../../lib/api";
import type { Athlete } from "../../types/admin";
import type { Conversation, PaymentStatus } from "../../types/admin";
import type { JerseySize } from "../../types/race";

const JERSEY_SIZES: JerseySize[] = ["S", "M", "L", "XL", "XXL"];

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

const inputClass =
  "mt-1 w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand-neon";
const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-ink-muted";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatBs(value: number): string {
  return `Bs ${value.toLocaleString("es-VE", { maximumFractionDigits: 2 })}`;
}

interface AthleteSearchResponse {
  items: Athlete[];
}

interface CrmCommandCenterProps {
  conversation: Conversation;
  onLinked: () => void;
  onConversationPatched: (patch: Partial<Conversation>) => void;
}

export function CrmCommandCenter({ conversation, onLinked, onConversationPatched }: CrmCommandCenterProps) {
  if (!conversation.athleteId) {
    return <AthleteLinkSearch conversationId={conversation.id} onLinked={onLinked} />;
  }
  return (
    <LinkedAthletePanel
      key={conversation.athleteId}
      athleteId={conversation.athleteId}
      conversation={conversation}
      onConversationPatched={onConversationPatched}
    />
  );
}

function AthleteLinkSearch({ conversationId, onLinked }: { conversationId: string; onLinked: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Athlete[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      adminGet<AthleteSearchResponse>(`/api/admin/athletes?q=${encodeURIComponent(q)}&pageSize=8`)
        .then((res) => setResults(res.items))
        .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo buscar atletas."))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function handleLink(athleteId: string) {
    setLinkingId(athleteId);
    setError(null);
    try {
      await adminPatch(`/api/admin/crm/conversations/${conversationId}/link-athlete`, { athleteId });
      onLinked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo vincular el atleta.");
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">Esta conversación no está vinculada a ningún atleta registrado.</p>
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          className="w-full rounded-lg border border-brand-card-border bg-surface py-2 pl-8 pr-3 text-xs text-ink outline-none focus:border-brand-neon"
          placeholder="Buscar por nombre, cédula, teléfono o correo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}
      {searching && <p className="text-xs text-ink-muted">Buscando…</p>}

      <div className="space-y-1.5">
        {results.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-brand-card-border p-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink">{a.fullName}</p>
              <p className="truncate text-[10px] text-ink-muted">{a.ci} · {a.phone}</p>
            </div>
            <button
              type="button"
              onClick={() => handleLink(a.id)}
              disabled={linkingId === a.id}
              className="shrink-0 rounded-full bg-brand-neon px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-surface disabled:opacity-50"
            >
              {linkingId === a.id ? "Vinculando…" : "Vincular"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkedAthletePanel({
  athleteId,
  conversation,
  onConversationPatched,
}: {
  athleteId: string;
  conversation: Conversation;
  onConversationPatched: (patch: Partial<Conversation>) => void;
}) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingSize, setSavingSize] = useState(false);
  const [approving, setApproving] = useState(false);
  const [resending, setResending] = useState(false);
  const [notesDraft, setNotesDraft] = useState(conversation.internalNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      adminGet<{ athlete: Athlete }>(`/api/admin/athletes/${athleteId}`),
      adminGet<{ rate: number }>("/api/admin/crm/bcv-rate").catch(() => ({ rate: null as unknown as number })),
    ])
      .then(([athleteRes, bcvRes]) => {
        setAthlete(athleteRes.athlete);
        setBcvRate(bcvRes.rate ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la ficha del atleta."))
      .finally(() => setLoading(false));
  }, [athleteId]);

  useEffect(() => {
    setNotesDraft(conversation.internalNotes ?? "");
  }, [conversation.id, conversation.internalNotes]);

  async function handleJerseySizeChange(size: JerseySize) {
    if (!athlete) return;
    setSavingSize(true);
    setError(null);
    try {
      const res = await adminPatch<{ athlete: Athlete }>(`/api/admin/athletes/${athlete.id}`, { jerseySize: size });
      setAthlete(res.athlete);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la talla.");
    } finally {
      setSavingSize(false);
    }
  }

  async function handleApproveFullPayment() {
    if (!athlete) return;
    setApproving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await adminPost<{ athlete: Athlete; becamePaid: boolean }>(
        `/api/admin/crm/conversations/${conversation.id}/approve-full-payment`,
        {},
      );
      setAthlete(res.athlete);
      setNotice(res.becamePaid ? `Pago aprobado. Dorsal asignado: ${res.athlete.bibNumber ?? "—"}.` : "El atleta ya estaba solvente.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aprobar el pago.");
    } finally {
      setApproving(false);
    }
  }

  async function handleResendCertificate() {
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await adminPost<{ emailSent: boolean; whatsappSent: boolean }>(
        `/api/admin/crm/conversations/${conversation.id}/resend-certificate`,
        {},
      );
      const parts: string[] = [];
      if (res.emailSent) parts.push("correo");
      if (res.whatsappSent) parts.push("WhatsApp");
      setNotice(parts.length > 0 ? `Certificado reenviado por ${parts.join(" y ")}.` : "No se pudo reenviar por ningún canal.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reenviar el certificado.");
    } finally {
      setResending(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    setError(null);
    try {
      const res = await adminPatch<{ conversation: Conversation }>(`/api/admin/crm/conversations/${conversation.id}`, {
        internalNotes: notesDraft,
      });
      onConversationPatched(res.conversation);
      setNotice("Nota guardada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la nota.");
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) return <p className="text-xs text-ink-muted">Cargando ficha del atleta…</p>;
  if (!athlete) return <p className="text-xs text-brand-blue">{error ?? "No se pudo cargar el atleta."}</p>;

  const lastPayment = athlete.payments?.[0] ?? null;
  const paidUsd = athlete.paidAmountUsd ?? 0;

  return (
    <div className="space-y-4 text-xs">
      {error && <p className="font-semibold text-brand-blue">{error}</p>}
      {notice && <p className="font-semibold text-brand-neon">{notice}</p>}

      <div>
        <p className="text-sm font-black text-ink">{athlete.fullName}</p>
        <p className="text-[10px] text-ink-muted">{athlete.ci} · {athlete.phone}</p>
        <p className="text-[10px] text-ink-muted">{athlete.email ?? "Sin correo registrado"}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-brand-card-border p-2">
          <p className={labelClass}>Ruta</p>
          <p className="mt-1 font-bold text-ink">{athlete.route === "33K_REDOMA" ? "33K · Redoma" : "22K · Ilustres"}</p>
        </div>
        <div className="rounded-lg border border-brand-card-border p-2">
          <p className={labelClass}>Dorsal</p>
          <p className="mt-1 font-bold text-brand-neon">{athlete.bibNumber != null ? `#${athlete.bibNumber}` : "Por asignar"}</p>
        </div>
      </div>

      <label className={labelClass}>
        Talla de franela
        <select
          className={inputClass}
          value={athlete.jerseySize}
          disabled={savingSize}
          onChange={(e) => handleJerseySizeChange(e.target.value as JerseySize)}
        >
          {JERSEY_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2 rounded-lg border border-brand-card-border p-3">
        <div className="flex items-center justify-between">
          <span className={labelClass}>Estatus de pago</span>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${STATUS_STYLES[athlete.paymentStatus]}`}>
            {STATUS_LABELS[athlete.paymentStatus]}
          </span>
        </div>
        <div className="flex items-center justify-between text-ink">
          <span className="text-ink-muted">Abonado / Total (USD)</span>
          <span className="font-bold">{formatUsd(paidUsd)} / {formatUsd(athlete.totalAmountUsd)}</span>
        </div>
        {bcvRate != null && (
          <div className="flex items-center justify-between text-ink">
            <span className="text-ink-muted">Abonado / Total (Bs)</span>
            <span className="font-bold">{formatBs(paidUsd * bcvRate)} / {formatBs(athlete.totalAmountUsd * bcvRate)}</span>
          </div>
        )}
        {lastPayment?.proofUrl && (
          <a
            href={lastPayment.proofUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center justify-center gap-1.5 rounded-full border border-brand-card-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-muted hover:text-ink"
          >
            <Receipt size={12} /> Ver comprobante
          </a>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={handleApproveFullPayment}
          disabled={approving || athlete.paymentStatus === "PAID"}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400 disabled:opacity-30"
        >
          <CheckCircle2 size={12} /> {approving ? "Aprobando…" : "Aprobar Pago Completo"}
        </button>
        <button
          type="button"
          onClick={handleResendCertificate}
          disabled={resending || (!athlete.email && !athlete.phone)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-neon/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-neon disabled:opacity-30"
        >
          <FileText size={12} /> {resending ? "Enviando…" : "Reenviar Certificado PDF + QR"}
        </button>
      </div>

      <div className="space-y-1.5">
        <p className={labelClass}>
          <StickyNote size={11} className="mr-1 inline" /> Notas internas
        </p>
        <textarea
          className="min-h-[70px] w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand-neon"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Solo visible para el equipo organizador…"
        />
        <button
          type="button"
          onClick={handleSaveNotes}
          disabled={savingNotes}
          className="w-full rounded-full border border-brand-card-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {savingNotes ? "Guardando…" : "Guardar Nota"}
        </button>
      </div>
    </div>
  );
}
