import { RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useState } from "react";
import type { BcvRateState } from "../types/race";
import { formatBs, formatUsd } from "../lib/format";
import { PAYMENT_INFO } from "../data/raceData";

interface CurrencyConverterProps {
  bcv: BcvRateState & { refetch: () => void };
}

function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return "";
  const time = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit" }).format(new Date(updatedAt));
  return `Actualizado hoy · ${time}`;
}

export function CurrencyConverter({ bcv }: CurrencyConverterProps) {
  const [usd, setUsd] = useState(30);

  return (
    <div className="rounded-2xl border border-brand-card-border bg-brand-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-hud text-xs uppercase tracking-widest text-ink-muted">Conversor USD / Bs</p>
        <button
          type="button"
          onClick={() => bcv.refetch()}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-ink-muted transition-colors hover:text-brand-neon"
        >
          <RefreshCw size={12} className={bcv.loading ? "animate-spin" : ""} /> actualizar
        </button>
      </div>

      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand-card-border bg-surface px-3 py-1.5 text-[10px] uppercase tracking-widest">
        {bcv.source === "api" ? (
          <span className="inline-flex items-center gap-1.5 text-brand-neon">
            <ShieldCheck size={12} />
            Tasa Oficial BCV: {formatBs(bcv.rate)} · {formatUpdatedAt(bcv.updatedAt) || "Actualizado hoy"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <WifiOff size={12} /> Tasa de referencia (sin conexión)
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-ink-muted">Monto USD</span>
          <input
            type="number"
            min={0}
            value={usd}
            onChange={(e) => setUsd(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-neon"
          />
        </label>
        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-ink-muted">Equivalente Bs</span>
          <div className="rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-sm font-bold text-brand-neon">
            {formatBs(usd * bcv.rate)}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-ink-muted">
        1 USD ≈ <span className="text-ink">{formatBs(bcv.rate)}</span>
      </div>

      {bcv.error && <p className="mt-3 text-[11px] text-ink-muted">{bcv.error}</p>}
      <p className="mt-2 text-[11px] text-ink-muted">
        Referencia: {formatUsd(30)} ≈ {formatBs(30 * bcv.rate)} · precio único 22K y 33K
      </p>

      <div className="mt-5 rounded-xl border border-brand-card-border bg-surface p-4">
        <p className="text-hud text-[10px] uppercase tracking-widest text-brand-neon">Datos para tu pago</p>

        <div className="mt-3 space-y-3 text-xs">
          <div>
            <p className="font-bold uppercase text-ink">Pago Móvil</p>
            <p className="mt-1 text-ink-muted">
              Banco: <span className="text-ink">{PAYMENT_INFO.pagoMovil.banco}</span>
            </p>
            <p className="text-ink-muted">
              Cédula/RIF: <span className="text-ink">{PAYMENT_INFO.pagoMovil.cedula}</span>
            </p>
            <p className="text-ink-muted">
              Teléfono: <span className="text-ink">{PAYMENT_INFO.pagoMovil.telefono}</span>
            </p>
          </div>

          <div className="border-t border-brand-card-border pt-3">
            <p className="font-bold uppercase text-ink">Transferencia / Depósito</p>
            <p className="mt-1 text-ink-muted">
              Banco: <span className="text-ink">{PAYMENT_INFO.banco}</span>
            </p>
            <p className="text-ink-muted">
              Cuenta: <span className="text-ink">{PAYMENT_INFO.cuenta}</span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-[10px] text-ink-muted">
          Realiza tu pago y adjunta el comprobante al confirmar tu inscripción.
        </p>
      </div>
    </div>
  );
}
