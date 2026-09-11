import { SPONSORS } from "../data/raceData";

export function SponsorsMarquee() {
  const track = [...SPONSORS, ...SPONSORS];

  return (
    <section className="border-y border-white/5 bg-surface-alt py-8">
      <p className="mb-4 text-center text-[10px] uppercase tracking-[0.3em] text-ink-muted">
        Aliados y patrocinadores
      </p>
      <div className="overflow-hidden">
        <div className="flex w-max animate-marquee gap-12">
          {track.map((sponsor, i) => (
            <span
              key={`${sponsor.name}-${i}`}
              className="text-sm font-bold uppercase tracking-widest text-ink-muted/70 whitespace-nowrap"
            >
              {sponsor.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
