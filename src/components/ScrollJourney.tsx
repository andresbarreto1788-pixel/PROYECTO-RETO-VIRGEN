import { motion } from "framer-motion";
import { KIT_ITEMS, PHASES } from "../data/raceData";
import { ElevationChart } from "./ElevationChart";
import { JerseyShowcase } from "./JerseyShowcase";

const LIST_KIT_ITEMS = KIT_ITEMS.filter((item) => item.id !== "jersey");

export function ScrollJourney() {
  return (
    <section id="recorrido" className="relative bg-surface py-20 sm:py-28">
      <div className="mx-auto mb-16 max-w-3xl px-5 text-center sm:px-8">
        <p className="text-hud text-xs uppercase tracking-[0.3em] text-brand-neon">El Recorrido</p>
        <h2 className="mt-3 text-3xl font-black uppercase text-ink sm:text-5xl">
          Cuatro fases, un solo reto
        </h2>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-24 px-5 sm:px-8 sm:gap-32">
        {PHASES.map((phase, i) => {
          const reversed = i % 2 === 1;
          return (
            <div
              key={phase.id}
              id={phase.id === "altimetria" ? "altimetria" : phase.id === "monumento" ? "kit" : undefined}
              className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reversed ? "lg:[&>*:first-child]:order-2" : ""}`}
            >
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.6 }}
                className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-brand-card-border bg-brand-card"
              >
                <img
                  src={phase.image}
                  alt={phase.title}
                  className="h-full w-full object-cover opacity-90"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface/80 via-transparent to-transparent" />
                <div className="absolute left-5 top-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-neon text-hud text-lg font-black text-surface">
                  {String(phase.index).padStart(2, "0")}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <p className="text-hud text-xs uppercase tracking-widest text-brand-blue">{phase.kicker}</p>
                <h3 className="mt-3 text-2xl font-black uppercase text-ink sm:text-3xl">{phase.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted sm:text-base">
                  {phase.description}
                </p>

                {phase.id === "altimetria" && (
                  <div className="mt-6">
                    <ElevationChart />
                  </div>
                )}

                {phase.id === "monumento" && (
                  <ul className="mt-6 space-y-3">
                    {LIST_KIT_ITEMS.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-brand-card-border bg-brand-card px-4 py-3"
                      >
                        <p className="text-sm font-bold uppercase tracking-wide text-brand-neon">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </div>
          );
        })}

        <JerseyShowcase />
      </div>
    </section>
  );
}
