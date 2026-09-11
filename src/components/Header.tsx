import { Menu, X } from "lucide-react";
import { useState } from "react";
import { EVENT } from "../data/raceData";

const NAV_LINKS = [
  { href: "#recorrido", label: "Recorrido" },
  { href: "#altimetria", label: "Altimetría" },
  { href: "#kit", label: "Kit Oficial" },
  { href: "#inscripcion", label: "Inscripción" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-surface/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <a href="#top" className="flex items-center gap-3">
          <img
            src="/images/isotipo-monumento.jpeg"
            alt="Isotipo Reto Virgen de la Paz"
            className="h-9 w-9 rounded-full object-cover ring-1 ring-brand-neon/30"
          />
          <span className="hidden text-xs font-bold uppercase tracking-widest text-ink sm:inline">
            {EVENT.raceName}
          </span>
        </a>

        <div className="hidden items-center gap-1 rounded-full border border-brand-card-border bg-brand-card px-3 py-1.5 text-hud text-[11px] uppercase tracking-widest text-brand-neon md:flex">
          <span>{EVENT.edition}</span>
          <span className="text-ink-muted">·</span>
          <span>{EVENT.distanceKm} KM</span>
          <span className="text-ink-muted">·</span>
          <span>{EVENT.location}</span>
        </div>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:text-brand-neon"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#inscripcion"
            className="rounded-full bg-brand-neon px-5 py-2 text-xs font-extrabold uppercase tracking-wide text-surface transition-transform hover:scale-105"
          >
            Inscríbete
          </a>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-ink lg:hidden"
          aria-label="Abrir menú"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 bg-surface px-5 pb-5 pt-2 lg:hidden">
          <div className="mb-3 text-hud text-[11px] uppercase tracking-widest text-brand-neon">
            {EVENT.edition} · {EVENT.distanceKm} KM · {EVENT.location}
          </div>
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#inscripcion"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-full bg-brand-neon px-5 py-3 text-center text-sm font-extrabold uppercase tracking-wide text-surface"
            >
              Inscríbete Ahora
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
