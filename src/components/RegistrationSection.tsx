import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { useState } from "react";
import { useBcvRate } from "../hooks/useBcvRate";
import { generateAthleteQr } from "../lib/qr";
import type { RegistrationData } from "../types/race";
import { CurrencyConverter } from "./CurrencyConverter";
import { ProofCard } from "./ProofCard";
import { RegistrationForm } from "./RegistrationForm";

function launchConfetti() {
  confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.6 },
    colors: ["#CCFF00", "#2563EB", "#F4F7F2"],
  });
}

export function RegistrationSection() {
  const bcv = useBcvRate();
  const [submitted, setSubmitted] = useState<RegistrationData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  async function handleSuccess(data: RegistrationData) {
    setSubmitted(data);
    launchConfetti();
    try {
      const qr = await generateAthleteQr(data);
      setQrDataUrl(qr);
    } catch {
      setQrDataUrl(null);
    }
  }

  function handleReset() {
    setSubmitted(null);
    setQrDataUrl(null);
  }

  return (
    <section id="inscripcion" className="relative bg-surface-alt py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="text-hud text-xs uppercase tracking-[0.3em] text-brand-neon">Inscripción</p>
          <h2 className="mt-3 text-3xl font-black uppercase text-ink sm:text-5xl">Asegura tu cupo</h2>
          <p className="mt-4 text-sm text-ink-muted sm:text-base">
            Completa tus datos, elige tu modalidad y talla de jersey, y confirma el pago en USD o Bs. Recibirás un
            comprobante con QR único de atleta para retirar tu kit oficial.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            <CurrencyConverter bcv={bcv} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {submitted ? (
              <ProofCard data={submitted} qrDataUrl={qrDataUrl} onReset={handleReset} />
            ) : (
              <div className="rounded-2xl border border-brand-card-border bg-brand-card p-6 sm:p-8">
                <RegistrationForm bcvRate={bcv.rate} onSuccess={handleSuccess} />
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
