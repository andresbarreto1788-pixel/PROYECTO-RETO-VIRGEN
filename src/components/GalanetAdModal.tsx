import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "galanet-ad-dismissed";
const OPEN_DELAY_MS = 1200;
const INSTAGRAM_URL = "https://www.instagram.com/galanet_solution/";

function InstagramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function GalanetAdModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY)) return;
    const timer = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const close = () => {
    setOpen(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/95 p-4 backdrop-blur-sm sm:p-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-brand-card-border bg-brand-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-brand-card-border px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                Publicidad · Galanet
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar publicidad"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink transition-colors hover:bg-brand-card-border"
              >
                <X size={16} />
              </button>
            </div>

            <video
              className="aspect-video w-full bg-black"
              src="/videos/galanet-ad.mp4"
              poster="/images/galanet-ad-poster.jpg"
              autoPlay
              muted
              controls
              playsInline
            />

            <div className="flex items-center justify-between gap-3 border-t border-brand-card-border px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                Síguenos en Instagram
              </span>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] px-4 py-2 text-xs font-bold text-white transition-transform hover:scale-105"
              >
                <InstagramIcon />
                @galanet_solution
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
