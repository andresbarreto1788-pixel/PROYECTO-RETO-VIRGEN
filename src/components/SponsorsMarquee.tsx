import { SPONSORS } from "../data/raceData";

export function SponsorsMarquee() {
  const track = [...SPONSORS, ...SPONSORS];

  return (
    <section className="border-y border-white/5 bg-surface-alt py-8">
      <p className="mb-4 text-center text-[10px] uppercase tracking-[0.3em] text-ink-muted">
        Aliados y patrocinadores
      </p>
      <div className="overflow-hidden">
        <div className="flex w-max animate-marquee items-center gap-12">
          {track.map((sponsor, i) =>
            sponsor.logo ? (
              <div
                key={`${sponsor.name}-${i}`}
                className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-24"
              >
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-black/5 sm:h-20 sm:w-20">
                  <img
                    src={sponsor.logo}
                    alt={sponsor.name}
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="text-center text-[10px] font-bold uppercase tracking-widest text-ink-muted/70">
                  {sponsor.name}
                </span>
              </div>
            ) : (
              <span
                key={`${sponsor.name}-${i}`}
                className="text-sm font-bold uppercase tracking-widest text-ink-muted/70 whitespace-nowrap"
              >
                {sponsor.name}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
