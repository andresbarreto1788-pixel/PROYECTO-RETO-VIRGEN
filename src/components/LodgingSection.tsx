import { motion } from "framer-motion";
import { BedDouble, MessageCircle } from "lucide-react";
import { LODGINGS, lodgingWhatsAppUrl } from "../data/raceData";

export function LodgingSection() {
  return (
    <section id="hospedaje" className="relative bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="text-hud flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-brand-neon">
            <BedDouble size={14} aria-hidden="true" /> Hospedaje
          </p>
          <h2 className="mt-3 text-3xl font-black uppercase text-ink sm:text-5xl">Dónde hospedarte</h2>
          <p className="mt-4 text-sm text-ink-muted sm:text-base">
            ¿Vienes de otra ciudad? Reserva directo con nuestros aliados en Trujillo y descansa antes de la cumbre.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LODGINGS.map((lodging, i) => (
            <motion.article
              key={lodging.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col rounded-2xl border border-brand-card-border bg-brand-card p-5"
            >
              <div className="flex h-40 items-center justify-center rounded-xl bg-white p-4 ring-1 ring-black/5">
                <img
                  src={lodging.logo}
                  alt={lodging.name}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </div>
              <h3 className="mt-5 text-lg font-black uppercase text-ink">{lodging.name}</h3>
              <p className="mt-1 text-xs uppercase tracking-widest text-ink-muted">{lodging.type}</p>
              <p className="text-hud mt-1 text-xs text-ink-muted">{lodging.phone}</p>
              <a
                href={lodgingWhatsAppUrl(lodging.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-brand-neon px-5 py-3 text-xs font-bold uppercase tracking-widest text-surface transition-transform hover:scale-[1.02]"
              >
                <MessageCircle size={16} aria-hidden="true" /> Reservar por WhatsApp
              </a>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
