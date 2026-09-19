import { CheckCircle2, Download, MessageCircle, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { EVENT, ROUTE_MODALITIES } from "../data/raceData";
import { formatBs, formatUsd } from "../lib/format";
import { buildRegistrationWhatsAppLink } from "../lib/whatsapp";
import type { RegistrationData } from "../types/race";

interface ProofCardProps {
  data: RegistrationData;
  qrDataUrl: string | null;
  onReset: () => void;
}

export function ProofCard({ data, qrDataUrl, onReset }: ProofCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const route = ROUTE_MODALITIES.find((m) => m.id === data.modality);
  const modalityLabel = route ? `${route.distanceKm} KM — ${route.startPoint}` : data.modality;
  const isFullyPaid = data.paymentPlan === "full";

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });

      const canShareFile =
        typeof navigator.share === "function" && typeof navigator.canShare === "function";
      if (canShareFile) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `carnet-${data.registrationId}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: EVENT.raceName, text: `Carnet de atleta — ${data.fullName}` });
          return;
        }
      }

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `carnet-${data.registrationId}.png`;
      link.click();
    } catch {
      // el atleta puede reintentar o compartir por WhatsApp como alternativa
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-neon/30 bg-brand-card p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2 text-brand-neon">
        <CheckCircle2 size={20} />
        <p className="text-sm font-bold uppercase tracking-widest">Comprobante generado</p>
      </div>

      <div
        ref={cardRef}
        className="overflow-hidden rounded-2xl border border-brand-neon/40 bg-surface p-6"
      >
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <img
            src="/images/isotipo-monumento.jpeg"
            alt="Isotipo Reto Virgen de la Paz"
            className="h-11 w-11 rounded-full object-cover ring-1 ring-brand-neon/40"
          />
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-ink">{EVENT.raceName}</p>
            <p className="text-hud text-[10px] uppercase tracking-widest text-brand-neon">{EVENT.edition} · Carnet de Atleta</p>
          </div>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
              isFullyPaid ? "bg-brand-neon/15 text-brand-neon" : "bg-brand-blue/15 text-brand-blue"
            }`}
          >
            {isFullyPaid ? "Pago Completo" : "Abono — Saldo pendiente"}
          </span>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_auto]">
          <dl className="space-y-2.5 text-sm">
            <Row label="ID de inscripción" value={data.registrationId} />
            <Row label="Nombre" value={data.fullName} />
            <Row label="Cédula/Pasaporte" value={data.idNumber} />
            <Row label="Modalidad" value={modalityLabel} />
            <Row label="Talla de jersey" value={data.jerseySize} />
            <Row label="Grupo sanguíneo" value={data.bloodType} />
            <Row label="Monto total" value={`${formatUsd(data.amountUsd)} · ${formatBs(data.amountBs)}`} />
            {!isFullyPaid && (
              <Row
                label="Saldo pendiente"
                value={`${formatUsd(data.pendingAmountUsd)} · ${formatBs(data.pendingAmountBs)}`}
              />
            )}
            <Row label="Referencia" value={data.paymentReference} />
          </dl>

          {qrDataUrl && (
            <div className="flex flex-col items-center gap-2 justify-self-center">
              <img src={qrDataUrl} alt="QR único del atleta" className="h-36 w-36 rounded-lg sm:h-40 sm:w-40" />
              <span className="text-[10px] uppercase tracking-widest text-ink-muted">QR de verificación</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-neon px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon disabled:opacity-60"
        >
          <Download size={16} /> {downloading ? "Generando…" : "Descargar Carnet"}
        </button>
        <a
          href={buildRegistrationWhatsAppLink(data)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-card-border px-6 py-3 text-xs font-bold uppercase tracking-wide text-ink-muted transition-colors hover:text-ink"
        >
          <MessageCircle size={14} /> Enviar por WhatsApp
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
        Tu inscripción se confirma al recibir la validación del organizador por WhatsApp (0414-0746270).
        Guarda este carnet: el QR lo necesitarás para retirar tu kit el día del evento.
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
