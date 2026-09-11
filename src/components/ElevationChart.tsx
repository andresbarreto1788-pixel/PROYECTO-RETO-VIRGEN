import { useMemo } from "react";
import { ELEVATION_PROFILE } from "../data/raceData";

const WIDTH = 600;
const HEIGHT = 220;
const PADDING = { top: 20, right: 12, bottom: 28, left: 12 };

export function ElevationChart() {
  const { linePath, areaPath, points, maxM, minM } = useMemo(() => {
    const meters = ELEVATION_PROFILE.map((p) => p.meters);
    const minM = Math.min(...meters);
    const maxM = Math.max(...meters);
    const maxKm = ELEVATION_PROFILE[ELEVATION_PROFILE.length - 1].km;

    const innerW = WIDTH - PADDING.left - PADDING.right;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;

    const points = ELEVATION_PROFILE.map((p) => {
      const x = PADDING.left + (p.km / maxKm) * innerW;
      const y = PADDING.top + innerH - ((p.meters - minM) / (maxM - minM)) * innerH;
      return { ...p, x, y };
    });

    const linePath = points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${HEIGHT - PADDING.bottom} L${points[0].x.toFixed(1)},${HEIGHT - PADDING.bottom} Z`;

    return { linePath, areaPath, points, maxM, minM };
  }, []);

  return (
    <div className="rounded-2xl border border-brand-card-border bg-brand-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between text-hud text-xs uppercase tracking-widest text-ink-muted">
        <span>0 KM</span>
        <span className="text-brand-neon">
          {minM} m → {maxM} m
        </span>
        <span>33 KM</span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CCFF00" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#CCFF00" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#elevationFill)" />
        <path d={linePath} fill="none" stroke="#CCFF00" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((pt) => (
          <g key={pt.km}>
            <circle cx={pt.x} cy={pt.y} r={pt.label ? 4 : 2.5} fill={pt.label ? "#CCFF00" : "#9AA39C"} />
            {pt.label && (
              <text
                x={pt.x}
                y={pt.y - 10}
                textAnchor={pt.km > 28 ? "end" : pt.km < 4 ? "start" : "middle"}
                className="fill-ink text-[9px] uppercase tracking-wide"
              >
                {pt.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
