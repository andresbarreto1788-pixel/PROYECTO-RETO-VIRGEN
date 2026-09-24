import { CheckCircle2, MessageCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { EVENT, JERSEY_CUTS, ROUTE_MODALITIES } from "../data/raceData";
import { formatBs, formatUsd } from "../lib/format";
import { generateAthleteQr } from "../lib/qr";
import { buildTeamRegistrationWhatsAppLink } from "../lib/whatsapp";
import type { TeamRegistrationData } from "../types/race";

interface TeamProofCardProps {
  data: TeamRegistrationData;
  onReset: () => void;
}

export function TeamProofCard({ data, onReset }: TeamProofCardProps) {
  const [qrByAthleteId, setQrByAthleteId] = useState<Record<string, string>>({});
  const route = ROUTE_MODALITIES.find((m) => m.id === data.modality);
  const modalityLabel = route ? `${route.distanceKm} KM — ${route.startPoint}` : data.modality;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        data.members.map(async (m) => {
          try {
            const qr = await generateAthleteQr({ athleteId: m.athleteId, qrCodeToken: m.qrCodeToken });
            return [m.athleteId, qr] as const;
          } catch {
            return [m.athleteId, null] as const;
          }
        }),
      );
      if (!cancelled) {
        setQrByAthleteId(Object.fromEntries(entries.filter(([, qr]) => qr !== null)) as Record<string, string>);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.members]);

  return (
    <div className="rounded-2xl border border-brand-neon/30 bg-brand-card p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2 text-brand-neon">
        <CheckCircle2 size={20} />
        <p className="text-sm font-bold uppercase tracking-widest">Equipo inscrito</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-neon/40 bg-surface p-6">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <img
            src="/images/isotipo-monumento.jpeg"
            alt="Isotipo Reto Virgen de la Paz"
            className="h-11 w-11 rounded-full object-cover ring-1 ring-brand-neon/40"
          />
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-ink">{EVENT.raceName}</p>
            <p className="text-hud text-[10px] uppercase tracking-widest text-brand-neon">
              {EVENT.edition} · Inscripción de Equipo
            </p>
          </div>
          {data.discountPercent > 0 && (
            <span className="ml-auto rounded-full bg-brand-neon/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-neon">
              {data.discountPercent}% dto. aplicado
            </span>
          )}
        </div>

        <dl className="mt-5 space-y-2.5 text-sm">
          <Row label="ID de inscripción" value={data.registrationId} />
          <Row label="Equipo" value={data.teamName} />
          <Row label="Capitán" value={`${data.captainFullName} · ${data.captainPhone}`} />
          <Row label="Modalidad" value={modalityLabel} />
          <Row label="Integrantes" value={String(data.memberCount)} />
          <Row label="Subtotal" value={formatUsd(data.subtotalUsd)} />
          <Row label="Total pagado" value={`${formatUsd(data.totalUsd)} · ${formatBs(data.totalBs)}`} />
          <Row label="Referencia" value={data.paymentReference} />
        </dl>

        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-ink-muted">Roster del equipo</p>
          <div className="space-y-2">
            {data.members.map((m) => (
              <div
                key={m.athleteId}
                className="flex items-center gap-3 rounded-lg border border-brand-card-border bg-brand-card px-3 py-2"
              >
                {qrByAthleteId[m.athleteId] && (
                  <img src={qrByAthleteId[m.athleteId]} alt={`QR de ${m.fullName}`} className="h-12 w-12 rounded" />
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-semibold text-ink">{m.fullName}</p>
                  <p className="text-ink-muted">
                    {m.idNumber} · {JERSEY_CUTS.find((c) => c.id === m.jerseyCut)?.label ?? m.jerseyCut} {m.jerseySize}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <a
          href={buildTeamRegistrationWhatsAppLink(data)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-neon px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon"
        >
          <MessageCircle size={16} /> Enviar resumen por WhatsApp
        </a>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-card-border px-6 py-3 text-xs font-bold uppercase tracking-wide text-ink-muted transition-colors hover:text-ink"
        >
          <RotateCcw size={14} /> Nueva inscripción
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
        La inscripción del equipo se confirma al recibir la validación del organizador por WhatsApp (
        {EVENT.organizerWhatsapp}). Cada integrante necesitará su QR individual para retirar su kit el día del evento.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}
