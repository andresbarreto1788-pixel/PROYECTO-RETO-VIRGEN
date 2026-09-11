import { formatBs, formatUsd } from "../../lib/format";
import type { AdminMetrics } from "../../types/admin";

interface MetricsHudProps {
  metrics: AdminMetrics | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-brand-card-border bg-brand-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-ink-muted">{label}</p>
      <p className="text-hud mt-1 text-lg font-bold text-brand-neon">{value}</p>
    </div>
  );
}

export function MetricsHud({ metrics }: MetricsHudProps) {
  if (!metrics) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-xl border border-brand-card-border bg-brand-card" />)}</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Total Inscritos" value={String(metrics.totalAthletes)} />
      <Stat label="Cupos 33K vs 22K" value={`${metrics.total33k} / ${metrics.total22k}`} />
      <Stat label="Total Recaudado" value={`${formatUsd(metrics.totalRevenueUsd)} · ${formatBs(metrics.totalRevenueBs)}`} />
      <Stat label="Kits Entregados" value={String(metrics.checkedIn)} />
    </div>
  );
}
