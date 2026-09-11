import { RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useState } from "react";
import type { BcvRateState } from "../types/race";
import { formatBs, formatUsd } from "../lib/format";

interface CurrencyConverterProps {
  bcv: BcvRateState & { refetch: () => void };
}

function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return "";
  const time = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit" }).format(new Date(updatedAt));
  return `Actualizado hoy · ${time}`;
}

export function CurrencyConverter({ bcv }: CurrencyConverterProps) {
  const [usd, setUsd] = useState(20);

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
        Referencia: {formatUsd(20)} ≈ {formatBs(20 * bcv.rate)}
      </p>
    </div>
  );
}
