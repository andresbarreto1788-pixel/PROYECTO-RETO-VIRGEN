import { motion } from "framer-motion";
import { useState } from "react";
import { JERSEY_IMAGES, JERSEY_SIZES, KIT_ITEMS } from "../data/raceData";
import type { JerseySize } from "../types/race";

const jersey = KIT_ITEMS.find((item) => item.id === "jersey")!;

export function JerseyShowcase() {
  const [size, setSize] = useState<JerseySize>("M");

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6 }}
      className="grid gap-8 rounded-3xl border border-brand-card-border bg-brand-card p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14"
    >
      <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-3">
        <div className="col-span-2 overflow-hidden rounded-2xl bg-surface-alt">
          <img
            src={JERSEY_IMAGES.front}
            alt={`${jersey.title} — vista frontal`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="col-span-2 overflow-hidden rounded-2xl bg-surface-alt">
          <img
            src={JERSEY_IMAGES.back}
            alt={`${jersey.title} — vista trasera`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>

      <div>
        <p className="text-hud text-xs uppercase tracking-[0.3em] text-brand-neon">Kit del Finisher</p>
        <h3 className="mt-3 text-2xl font-black uppercase text-ink sm:text-3xl">{jersey.title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted sm:text-base">{jersey.description}</p>

        <div className="mt-6">
          <span className="mb-2 block text-[10px] uppercase tracking-widest text-ink-muted">
            Talla — seleccionable también al inscribirte
          </span>
          <div className="flex flex-wrap gap-2">
            {JERSEY_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`h-11 w-14 rounded-lg border text-sm font-bold uppercase transition-colors ${
                  size === s
                    ? "border-brand-neon bg-brand-neon/10 text-brand-neon"
                    : "border-brand-card-border bg-surface text-ink-muted hover:border-ink-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <a
          href="#inscripcion"
          className="mt-7 inline-flex items-center justify-center rounded-full bg-brand-neon px-6 py-3 text-xs font-extrabold uppercase tracking-wide text-surface shadow-neon transition-shadow hover:shadow-neon-strong"
        >
          Inscríbete y reserva tu talla
        </a>
      </div>
    </motion.div>
  );
}
