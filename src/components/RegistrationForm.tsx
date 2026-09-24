import { useState } from "react";
import type { FormEvent } from "react";
import { JERSEY_CUTS, JERSEY_SIZES_BY_CUT, PAYMENT_METHOD_LABELS, ROUTE_MODALITIES } from "../data/raceData";
import { formatBs, formatUsd, generateRegistrationId } from "../lib/format";
import { apiPost, ApiError } from "../lib/api";
import { PaymentProofUploader } from "./PaymentProofUploader";
import type { Athlete } from "../types/admin";
import type {
  BloodType,
  JerseyCut,
  JerseySize,
  PaymentMethod,
  PaymentPlan,
  RegistrationData,
  RouteModalityId,
} from "../types/race";

const BLOOD_TYPES: BloodType[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const MIN_PARTIAL_RATIO = 0.5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegistrationFormProps {
  bcvRate: number;
  onSuccess: (data: RegistrationData) => void;
}

interface RegisterResponse {
  athlete: Athlete;
  qrToken: string;
}

const inputClass =
  "w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand-neon placeholder:text-ink-muted/60";
const labelClass = "mb-1.5 block text-[10px] uppercase tracking-widest text-ink-muted";

export function RegistrationForm({ bcvRate, onSuccess }: RegistrationFormProps) {
  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [bloodType, setBloodType] = useState<BloodType>("O+");
  const [modality, setModality] = useState<RouteModalityId>(ROUTE_MODALITIES[0].id);
  const [jerseyCut, setJerseyCut] = useState<JerseyCut>("caballero");
  const [jerseySize, setJerseySize] = useState<JerseySize>("M");
  const jerseySizes = JERSEY_SIZES_BY_CUT[jerseyCut];

  function handleJerseyCutChange(next: JerseyCut) {
    setJerseyCut(next);
    if (!JERSEY_SIZES_BY_CUT[next].includes(jerseySize)) {
      setJerseySize(JERSEY_SIZES_BY_CUT[next][1] as JerseySize);
    }
  }
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pago-movil");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("full");
  const [paidAmountBsInput, setPaidAmountBsInput] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedModality = ROUTE_MODALITIES.find((m) => m.id === modality)!;
  const totalBs = Math.round(selectedModality.priceUsd * bcvRate * 100) / 100;
  const paidAmountBs = Number(paidAmountBsInput) || 0;
  const pendingAmountBs = Math.max(totalBs - paidAmountBs, 0);
  const pendingAmountUsd = bcvRate > 0 ? pendingAmountBs / bcvRate : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!fullName || !idNumber || !phone || !email || !emergencyContact || !paymentReference) {
      setError("Completa todos los campos antes de confirmar tu inscripción.");
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    if (!proofFile) {
      setError("Adjunta el capture o recibo de tu pago.");
      return;
    }

    if (paymentPlan === "partial" && paidAmountBs < totalBs * MIN_PARTIAL_RATIO) {
      setError(
        `El abono inicial debe ser al menos el 50% del total (mín. ${formatUsd(
          selectedModality.priceUsd * MIN_PARTIAL_RATIO,
        )} · ${formatBs(totalBs * MIN_PARTIAL_RATIO)}).`,
      );
      return;
    }

    setError(null);

    const finalPaidAmountBs = paymentPlan === "full" ? totalBs : paidAmountBs;
    const finalPaidAmountUsd = bcvRate > 0 ? finalPaidAmountBs / bcvRate : 0;

    const formData = new FormData();
    formData.set("fullName", fullName);
    formData.set("idNumber", idNumber);
    formData.set("phone", phone);
    formData.set("email", email);
    formData.set("emergencyContact", emergencyContact);
    formData.set("bloodType", bloodType);
    formData.set("modality", modality);
    formData.set("jerseyCut", jerseyCut);
    formData.set("jerseySize", jerseySize);
    formData.set("paymentMethod", paymentMethod);
    formData.set("paymentReference", paymentReference);
    formData.set("paymentPlan", paymentPlan);
    formData.set("amountUsd", String(selectedModality.priceUsd));
    formData.set("amountBs", String(totalBs));
    formData.set("paidAmountUsd", String(finalPaidAmountUsd));
    formData.set("paidAmountBs", String(finalPaidAmountBs));
    formData.set("bcvRate", String(bcvRate));
    formData.set("proof", proofFile);

    setSubmitting(true);
    try {
      const { athlete, qrToken } = await apiPost<RegisterResponse>("/api/register", formData);

      const data: RegistrationData = {
        fullName,
        idNumber,
        phone,
        email,
        emergencyContact,
        bloodType,
        modality,
        jerseyCut,
        jerseySize,
        paymentMethod,
        paymentReference,
        paymentPlan,
        amountUsd: selectedModality.priceUsd,
        amountBs: totalBs,
        paidAmountUsd: finalPaidAmountUsd,
        paidAmountBs: finalPaidAmountBs,
        pendingAmountUsd: paymentPlan === "full" ? 0 : pendingAmountUsd,
        pendingAmountBs: paymentPlan === "full" ? 0 : Math.max(totalBs - finalPaidAmountBs, 0),
        bcvRate,
        registrationId: generateRegistrationId(),
        athleteId: athlete.id,
        qrCodeToken: qrToken,
        createdAt: new Date().toISOString(),
      };

      onSuccess(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la inscripción. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Nombre completo</span>
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellido" />
        </label>
        <label>
          <span className={labelClass}>Cédula / Pasaporte</span>
          <input className={inputClass} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="V-00000000" />
        </label>
        <label>
          <span className={labelClass}>Teléfono</span>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412-0000000" />
        </label>
        <label>
          <span className={labelClass}>Correo electrónico</span>
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
          />
        </label>
        <label>
          <span className={labelClass}>Contacto de emergencia</span>
          <input
            className={inputClass}
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            placeholder="Nombre y teléfono"
          />
        </label>
        <label>
          <span className={labelClass}>Grupo sanguíneo</span>
          <select className={inputClass} value={bloodType} onChange={(e) => setBloodType(e.target.value as BloodType)}>
            {BLOOD_TYPES.map((bt) => (
              <option key={bt} value={bt}>
                {bt}
              </option>
            ))}
          </select>
        </label>
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
      </div>

      <div>
        <span className={labelClass}>Selecciona tu punto de salida / modalidad</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROUTE_MODALITIES.map((route) => (
            <button
              type="button"
              key={route.id}
              onClick={() => setModality(route.id)}
              className={`rounded-lg border px-4 py-3 text-left text-xs transition-colors ${
                modality === route.id
                  ? "border-brand-neon bg-brand-neon/10 text-brand-neon"
                  : "border-brand-card-border bg-surface text-ink-muted hover:border-ink-muted"
              }`}
            >
              <div className="font-bold uppercase">
                {route.distanceKm} KM — Salida {route.startPoint}
              </div>
              <div className="mt-1 text-[10px] opacity-80">
                Llegada: {route.finishPoint} · ${route.priceUsd}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Corte de jersey</span>
        <div className="grid grid-cols-2 gap-2">
          {JERSEY_CUTS.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => handleJerseyCutChange(c.id)}
              className={`rounded-lg border py-2.5 text-center text-xs font-bold uppercase transition-colors ${
                jerseyCut === c.id
                  ? "border-brand-neon bg-brand-neon/10 text-brand-neon"
                  : "border-brand-card-border bg-surface text-ink-muted hover:border-ink-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Talla de jersey (para el kit)</span>
        <div className="grid grid-cols-5 gap-2">
          {jerseySizes.map((size) => (
            <button
              type="button"
              key={size}
              onClick={() => setJerseySize(size as JerseySize)}
              className={`rounded-lg border py-2.5 text-center text-xs font-bold uppercase transition-colors ${
                jerseySize === size
                  ? "border-brand-neon bg-brand-neon/10 text-brand-neon"
                  : "border-brand-card-border bg-surface text-ink-muted hover:border-ink-muted"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Modalidad de pago</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPaymentPlan("full")}
            className={`rounded-lg border px-4 py-3 text-left text-xs transition-colors ${
              paymentPlan === "full"
                ? "border-brand-neon bg-brand-neon/10 text-brand-neon"
                : "border-brand-card-border bg-surface text-ink-muted hover:border-ink-muted"
            }`}
          >
            <div className="font-bold uppercase">Pago Completo (100%)</div>
            <div className="mt-1 text-[10px] opacity-80">
              {formatUsd(selectedModality.priceUsd)} · {formatBs(totalBs)}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPaymentPlan("partial")}
            className={`rounded-lg border px-4 py-3 text-left text-xs transition-colors ${
              paymentPlan === "partial"
                ? "border-brand-neon bg-brand-neon/10 text-brand-neon"
                : "border-brand-card-border bg-surface text-ink-muted hover:border-ink-muted"
            }`}
          >
            <div className="font-bold uppercase">Pago por Cuotas</div>
            <div className="mt-1 text-[10px] opacity-80">Abono inicial mínimo 50%</div>
          </button>
        </div>
      </div>

      <div>
        <span className={labelClass}>Comprobante de pago (capture o recibo)</span>
        <PaymentProofUploader
          onFileSelected={setProofFile}
          onExtracted={(result) => {
            if (result.referencia) setPaymentReference(result.referencia);
            if (result.montoBs) setPaidAmountBsInput(String(result.montoBs));
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Referencia de pago</span>
          <input
            className={inputClass}
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="Nro. de referencia / recibo"
          />
        </label>
        <label>
          <span className={labelClass}>Monto pagado (Bs)</span>
          <input
            className={inputClass}
            type="number"
            min={0}
            step="0.01"
            value={paidAmountBsInput}
            onChange={(e) => setPaidAmountBsInput(e.target.value)}
            placeholder={String(totalBs)}
          />
        </label>
      </div>

      {paymentPlan === "partial" && (
        <div className="rounded-lg border border-brand-card-border bg-surface px-4 py-3 text-xs text-ink-muted">
          <div className="flex justify-between">
            <span>Abono</span>
            <span className="font-semibold text-ink">
              {formatUsd(bcvRate > 0 ? paidAmountBs / bcvRate : 0)} · {formatBs(paidAmountBs)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Saldo pendiente</span>
            <span className="font-semibold text-brand-neon">
              {formatUsd(pendingAmountUsd)} · {formatBs(pendingAmountBs)}
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-neon px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon transition-shadow hover:shadow-neon-strong disabled:opacity-60"
      >
        {submitting ? "Enviando inscripción…" : `Confirmar inscripción — $${selectedModality.priceUsd}`}
      </button>
    </form>
  );
}
