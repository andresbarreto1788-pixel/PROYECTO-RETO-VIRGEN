import { Droplet } from "lucide-react";
import { HYDRATION_POINTS } from "../data/raceData";

export function HydrationPoints() {
  return (
    <div className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-brand-card-border bg-brand-card">
        <video
          className="aspect-video w-full object-cover"
          src="/videos/ruta-hidratacion.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HYDRATION_POINTS.map((p) => (
          <li
            key={p.point}
            className="flex items-center gap-3 rounded-xl border border-brand-card-border bg-brand-card px-3 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-neon text-hud text-xs font-black text-surface">
              {p.point}
            </span>
            <span className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-ink">
              {p.name}
            </span>
            <span className="text-hud flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-widest text-brand-neon">
              <Droplet size={11} /> Km {p.km}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
