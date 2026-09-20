import { AtSign, MessageCircle } from "lucide-react";
import { EVENT } from "../data/raceData";

export function Footer() {
  return (
    <footer className="bg-surface px-5 py-12 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center">
        <img
          src="/images/sello-oficial-badge.png"
          alt="Sello oficial Reto Virgen de la Paz"
          className="h-24 w-24 object-contain sm:h-28 sm:w-28"
        />
        <h3 className="text-xl font-black uppercase text-ink">{EVENT.raceName}</h3>
        <p className="max-w-md text-xs text-ink-muted">
          {EVENT.edition} · {EVENT.distanceKm} KM · {EVENT.location}
        </p>

        <div className="flex items-center gap-5">
          <a
            href={`https://wa.me/${EVENT.whatsappDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:text-brand-neon"
          >
            <MessageCircle size={16} /> {EVENT.whatsapp}
          </a>
          <a
            href={`https://instagram.com/${EVENT.instagram.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:text-brand-neon"
          >
            <AtSign size={16} /> {EVENT.instagram}
          </a>
        </div>

        <p className="mt-6 text-[10px] uppercase tracking-widest text-ink-muted/60">
          © {new Date().getFullYear()} {EVENT.raceName} · Trujillo, Venezuela
        </p>
      </div>
    </footer>
  );
}
