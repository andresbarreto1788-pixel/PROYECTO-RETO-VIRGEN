import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { EVENT, HUD_STATS } from "../data/raceData";
import { MagneticButton } from "./ui/MagneticButton";

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-svh items-end overflow-hidden bg-surface">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/hero-dron-cumbre.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-surface via-surface/20 to-surface" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface/70" />
      <div className="absolute inset-0 bg-noise" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-40 sm:px-8 sm:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-neon/30 bg-brand-card/80 px-4 py-2 text-hud text-[11px] uppercase tracking-widest text-brand-neon backdrop-blur"
        >
          {EVENT.edition} · {EVENT.distanceKm} KM · {EVENT.location}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="max-w-4xl text-[13vw] font-black uppercase leading-[0.92] text-ink sm:text-6xl md:text-7xl lg:text-8xl"
        >
          Reto{" "}
          <span className="text-brand-neon">Virgen</span> de la{" "}
          <span className="text-brand-blue">Paz</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-5 max-w-xl text-sm text-ink-muted sm:text-base"
        >
          Desde la redoma de las letras TRUJILLO hasta la cima del Monumento a la Virgen de la Paz.
          Un ascenso serpenteante entre pinos que pone a prueba a todo el pelotón.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <MagneticButton href="#inscripcion" pulse>
            Inscríbete Ahora
          </MagneticButton>
          <a
            href="#recorrido"
            className="text-xs font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:text-ink"
          >
            Ver el recorrido ↓
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-12 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/10 pt-6"
        >
          {HUD_STATS.map((stat) => (
            <div key={stat.label}>
              <div className="text-hud text-2xl font-bold text-brand-neon sm:text-3xl">
                {stat.value}
                <span className="ml-1 text-xs text-ink-muted">{stat.unit}</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-ink-muted sm:text-xs">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-ink-muted"
      >
        <ChevronDown size={20} />
      </motion.div>
    </section>
  );
}
