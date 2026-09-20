import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";

interface ExpandableImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}

export function ExpandableImage({ src, alt, className = "", wrapperClassName = "" }: ExpandableImageProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver imagen completa: ${alt}`}
        className={`group relative block h-full w-full cursor-zoom-in ${wrapperClassName}`}
      >
        <motion.img layoutId={`expandable-${src}`} src={src} alt={alt} className={className} loading="lazy" />
        <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 text-ink opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 size={14} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/95 p-5 backdrop-blur-sm sm:p-10"
          >
            <motion.img
              layoutId={`expandable-${src}`}
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar imagen"
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-brand-card text-ink transition-colors hover:bg-brand-card-border"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
