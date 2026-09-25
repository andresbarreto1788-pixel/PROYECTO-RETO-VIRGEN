import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "galanet-ad-dismissed";
const OPEN_DELAY_MS = 1200;

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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
