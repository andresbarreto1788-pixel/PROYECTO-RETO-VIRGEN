import { ArrowLeft, CheckCircle2, Clock, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { PaymentProofUploader } from "../components/PaymentProofUploader";
import { PAYMENT_INFO, PAYMENT_METHOD_LABELS } from "../data/raceData";
import { ApiError, apiPost } from "../lib/api";
import { formatBs, formatUsd } from "../lib/format";
import type { PaymentMethod } from "../types/race";

interface BalancePayment {
  amountUsd: number;
  amountBs: number;
  method: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface BalanceResponse {
  athlete: {
    fullName: string;
    routeLabel: string;
    paymentStatus: string;
    bibNumber: number | null;
    teamName: string | null;
  };
  totalUsd: number;
  approvedUsd: number;
  pendingReviewUsd: number;
  balanceUsd: number;
  balanceBs: number;
  bcvRate: number;
  canPay: boolean;
  blockedReason: string | null;
  payments: BalancePayment[];
}

interface PayResponse {
  ok: true;
  amountUsd: number;
  remainingUsd: number;
  remainingBs: number;
}

const inputClass =
  "w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand-neon placeholder:text-ink-muted/60";
const labelClass = "mb-1.5 block text-[10px] uppercase tracking-widest text-ink-muted";

const STATUS_LABEL: Record<BalancePayment["status"], string> = {
  APPROVED: "Aprobado",
  PENDING: "En revisión",
  REJECTED: "Rechazado",
};
const STATUS_CLASS: Record<BalancePayment["status"], string> = {
  APPROVED: "text-brand-neon",
  PENDING: "text-yellow-400",
  REJECTED: "text-brand-blue",
};

export function PayBalancePage() {
  const [idNumber, setIdNumber] = useState("");
  const [contact, setContact] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pago-movil");
  const [paymentReference, setPaymentReference] = useState("");
  const [amountBs, setAmountBs] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paid, setPaid] = useState<PayResponse | null>(null);

  async function lookup(e?: FormEvent) {
    e?.preventDefault();
    if (!idNumber.trim() || !contact.trim()) {
      setLookupError("Ingresa tu cédula y el teléfono o correo con el que te inscribiste.");
      return;
    }
    setLookupError(null);
    setLookingUp(true);
    try {
      const data = await apiPost<BalanceResponse>("/api/balance/lookup", {
        idNumber: idNumber.trim(),
        contact: contact.trim(),
      });
      setBalance(data);
      setAmountBs(data.balanceBs > 0 ? String(data.balanceBs) : "");
    } catch (err) {
      setBalance(null);
      setLookupError(err instanceof ApiError ? err.message : "No se pudo consultar. Intenta de nuevo.");
    } finally {
      setLookingUp(false);
    }
  }

  async function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!balance) return;
    if (!paymentReference.trim() || !Number(amountBs)) {
      setPayError("Completa la referencia y el monto pagado.");
      return;
    }
    if (!proofFile) {
      setPayError("Adjunta el capture o recibo de tu pago.");
      return;
    }

    setPayError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("idNumber", idNumber.trim());
      formData.set("contact", contact.trim());
      formData.set("paymentMethod", paymentMethod);
      formData.set("paymentReference", paymentReference.trim());
      formData.set("amountBs", amountBs);
      formData.set("proof", proofFile);
      const result = await apiPost<PayResponse>("/api/balance/pay", formData);
      setPaid(result);
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "No se pudo enviar tu pago. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setBalance(null);
    setPaid(null);
    setPaymentReference("");
    setAmountBs("");
    setProofFile(null);
    setPayError(null);
  }

  return (
    <div className="min-h-svh bg-surface text-ink">
      <header className="border-b border-white/5 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:text-brand-neon"
          >
            <ArrowLeft size={14} /> Volver al sitio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-hud text-xs uppercase tracking-[0.3em] text-brand-neon">Pagos</p>
        <h1 className="mt-3 text-3xl font-black uppercase sm:text-4xl">Consulta y paga tu saldo</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Si abonaste una parte de tu inscripción, consulta cuánto te falta y envía el comprobante de tu siguiente
          pago. Usa los mismos datos con los que te inscribiste.
        </p>

        {!balance && (
          <form
            onSubmit={lookup}
            className="mt-8 space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6 sm:p-8"
          >
            <label className="block">
              <span className={labelClass}>Cédula / Pasaporte</span>
              <input
                className={inputClass}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="V-00000000"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Teléfono o correo de tu inscripción</span>
              <input
                className={inputClass}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="0412-0000000 o tucorreo@ejemplo.com"
                autoComplete="off"
              />
            </label>
            {lookupError && <p className="text-xs font-semibold text-brand-blue">{lookupError}</p>}
            <button
              type="submit"
              disabled={lookingUp}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-neon px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon transition-shadow hover:shadow-neon-strong disabled:opacity-60"
            >
              <Search size={16} /> {lookingUp ? "Consultando…" : "Consultar mi saldo"}
            </button>
          </form>
        )}

        {balance && (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-brand-card-border bg-brand-card p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black uppercase">{balance.athlete.fullName}</p>
                  <p className="text-xs text-ink-muted">
                    {balance.athlete.routeLabel}
                    {balance.athlete.bibNumber != null && ` · Dorsal ${balance.athlete.bibNumber}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:text-brand-neon"
                >
                  Consultar otra cédula
                </button>
              </div>

              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Total de la inscripción</dt>
                  <dd className="font-semibold">{formatUsd(balance.totalUsd)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Pagado y aprobado</dt>
                  <dd className="font-semibold text-brand-neon">{formatUsd(balance.approvedUsd)}</dd>
                </div>
                {balance.pendingReviewUsd > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">En revisión</dt>
                    <dd className="font-semibold text-yellow-400">{formatUsd(balance.pendingReviewUsd)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-brand-card-border pt-2">
                  <dt className="font-bold uppercase">Saldo pendiente</dt>
                  <dd className="text-right font-black">
                    {formatUsd(balance.balanceUsd)}
                    <span className="block text-[11px] font-normal text-ink-muted">
                      ≈ {formatBs(balance.balanceBs)} · tasa BCV {formatBs(balance.bcvRate)}
                    </span>
                  </dd>
                </div>
              </dl>

              {balance.payments.length > 0 && (
                <div className="mt-5 border-t border-brand-card-border pt-4">
                  <p className={labelClass}>Tus pagos</p>
                  <ul className="space-y-1.5 text-xs">
                    {balance.payments.map((p, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="text-ink-muted">
                          {new Date(p.createdAt).toLocaleDateString("es-VE")} · {p.method ?? "—"}
                        </span>
                        <span>
                          {formatUsd(p.amountUsd)}{" "}
                          <span className={`font-semibold ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {paid ? (
              <section className="rounded-2xl border border-brand-neon/40 bg-brand-card p-6 text-center sm:p-8">
                <CheckCircle2 size={40} className="mx-auto text-brand-neon" />
                <h2 className="mt-3 text-xl font-black uppercase">¡Pago recibido!</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Registramos {formatUsd(paid.amountUsd)}. El organizador lo revisará y te confirmaremos cuando quede
                  aprobado.
                </p>
                <p className="mt-3 text-sm">
                  {paid.remainingUsd > 0.5 ? (
                    <>
                      Saldo restante tras este pago:{" "}
                      <span className="font-bold text-brand-neon">
                        {formatUsd(paid.remainingUsd)} · {formatBs(paid.remainingBs)}
                      </span>
                    </>
                  ) : (
                    "Con este pago cubres el total de tu inscripción."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void lookup()}
                  className="mt-5 rounded-full border border-brand-card-border px-5 py-2 text-xs font-bold uppercase tracking-widest text-ink-muted transition-colors hover:border-brand-neon hover:text-brand-neon"
                >
                  Ver mi estado actualizado
                </button>
              </section>
            ) : balance.canPay ? (
              <>
                <section className="rounded-2xl border border-brand-card-border bg-brand-card p-6 sm:p-8">
                  <p className="text-hud text-[10px] uppercase tracking-widest text-brand-neon">Datos para tu pago</p>
                  <div className="mt-3 grid gap-4 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-bold uppercase">Pago Móvil</p>
                      <p className="text-ink-muted">{PAYMENT_INFO.pagoMovil.titular}</p>
                      <p className="text-ink-muted">Banco {PAYMENT_INFO.pagoMovil.banco}</p>
                      <p className="text-ink-muted">Cédula {PAYMENT_INFO.pagoMovil.cedula}</p>
                      <p className="text-ink-muted">Tel. {PAYMENT_INFO.pagoMovil.telefono}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase">Transferencia</p>
                      <p className="text-ink-muted">{PAYMENT_INFO.titular}</p>
                      <p className="text-ink-muted">{PAYMENT_INFO.banco}</p>
                      <p className="text-ink-muted">{PAYMENT_INFO.cuenta}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase">Zelle</p>
                      <p className="text-ink-muted">{PAYMENT_INFO.zelle.telefono}</p>
                      <p className="text-ink-muted">{PAYMENT_INFO.zelle.titular}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase">Binance Pay</p>
                      <p className="text-ink-muted">ID {PAYMENT_INFO.binancePay.idBinance}</p>
                      <p className="text-ink-muted">Usuario {PAYMENT_INFO.binancePay.usuario}</p>
                    </div>
                  </div>
                </section>

                <form
                  onSubmit={handlePay}
                  className="space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6 sm:p-8"
                >
                  <p className="text-hud text-[10px] uppercase tracking-widest text-brand-neon">
                    Envía el comprobante de tu pago
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className={labelClass}>Método de pago</span>
                      <select
                        className={inputClass}
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      >
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>Monto pagado (Bs)</span>
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        step="0.01"
                        value={amountBs}
                        onChange={(e) => setAmountBs(e.target.value)}
                        placeholder={String(balance.balanceBs)}
                      />
                    </label>
                  </div>

                  <div>
                    <span className={labelClass}>Comprobante (capture o recibo)</span>
                    <PaymentProofUploader
                      onFileSelected={setProofFile}
                      onExtracted={(r) => {
                        if (r.referencia) setPaymentReference(r.referencia);
                        if (r.montoBs) setAmountBs(String(r.montoBs));
                      }}
                    />
                  </div>

                  <label className="block">
                    <span className={labelClass}>Referencia de pago</span>
                    <input
                      className={inputClass}
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Nro. de referencia / recibo"
                    />
                  </label>

                  {payError && <p className="text-xs font-semibold text-brand-blue">{payError}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-full bg-brand-neon px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon transition-shadow hover:shadow-neon-strong disabled:opacity-60"
                  >
                    {submitting ? "Enviando pago…" : "Enviar pago"}
                  </button>
                </form>
              </>
            ) : (
              <section className="flex items-start gap-3 rounded-2xl border border-brand-card-border bg-brand-card p-6 text-sm text-ink-muted">
                <Clock size={18} className="mt-0.5 shrink-0 text-brand-neon" />
                <p>{balance.blockedReason}</p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
