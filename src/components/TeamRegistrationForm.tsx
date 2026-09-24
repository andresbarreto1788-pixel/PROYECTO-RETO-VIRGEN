import { ChevronDown, ChevronUp, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  JERSEY_CUTS,
  JERSEY_SIZES_BY_CUT,
  PAYMENT_METHOD_LABELS,
  ROUTE_MODALITIES,
  TEAM_DISCOUNT_MIN_SIZE,
  TEAM_DISCOUNT_PERCENT,
} from "../data/raceData";
import { formatBs, formatUsd, generateRegistrationId } from "../lib/format";
import { apiPost, ApiError } from "../lib/api";
import { PaymentProofUploader } from "./PaymentProofUploader";
import type { Athlete } from "../types/admin";
import type {
  BloodType,
  JerseyCut,
  JerseySize,
  PaymentMethod,
  RouteModalityId,
  TeamMemberInput,
  TeamRegistrationData,
} from "../types/race";

const BLOOD_TYPES: BloodType[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MEMBERS = 2;

function emptyMember(): TeamMemberInput {
  return {
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    emergencyContact: "",
    bloodType: "O+",
    jerseyCut: "caballero",
    jerseySize: "M",
  };
}

interface TeamRegistrationFormProps {
  bcvRate: number;
  onSuccess: (data: TeamRegistrationData) => void;
}

interface TeamRegisterResponse {
  team: {
    id: string;
    name: string;
    route: string;
    memberCount: number;
    discountPercent: number;
    captainFullName: string;
    captainPhone: string;
    captainEmail: string | null;
    subtotalAmountUsd: number;
    totalAmountUsd: number;
    createdAt: string;
  };
  athletes: { athlete: Athlete; qrToken: string }[];
}

const inputClass =
  "w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand-neon placeholder:text-ink-muted/60";
const smallInputClass =
  "w-full rounded-lg border border-brand-card-border bg-surface px-2.5 py-2 text-xs text-ink outline-none transition-colors focus:border-brand-neon placeholder:text-ink-muted/60";
const labelClass = "mb-1.5 block text-[10px] uppercase tracking-widest text-ink-muted";
const smallLabelClass = "mb-1 block text-[9px] uppercase tracking-widest text-ink-muted";

export function TeamRegistrationForm({ bcvRate, onSuccess }: TeamRegistrationFormProps) {
  const [teamName, setTeamName] = useState("");
  const [captainFullName, setCaptainFullName] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [modality, setModality] = useState<RouteModalityId>(ROUTE_MODALITIES[0].id);
  const [members, setMembers] = useState<TeamMemberInput[]>(() =>
    Array.from({ length: TEAM_DISCOUNT_MIN_SIZE }, emptyMember),
  );
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pago-movil");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedModality = ROUTE_MODALITIES.find((m) => m.id === modality)!;
  const memberCount = members.length;
  const discountPercent = memberCount >= TEAM_DISCOUNT_MIN_SIZE ? TEAM_DISCOUNT_PERCENT : 0;
  const subtotalUsd = Math.round(selectedModality.priceUsd * memberCount * 100) / 100;
  const totalUsd = Math.round(subtotalUsd * (1 - discountPercent / 100) * 100) / 100;
  const totalBs = Math.round(totalUsd * bcvRate * 100) / 100;
  const missingForDiscount = Math.max(TEAM_DISCOUNT_MIN_SIZE - memberCount, 0);

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateMember(index: number, patch: Partial<TeamMemberInput>) {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function handleMemberCutChange(index: number, cut: JerseyCut) {
    const sizes = JERSEY_SIZES_BY_CUT[cut];
    setMembers((prev) =>
      prev.map((m, i) =>
        i === index
          ? { ...m, jerseyCut: cut, jerseySize: sizes.includes(m.jerseySize) ? m.jerseySize : (sizes[1] as JerseySize) }
          : m,
      ),
    );
  }

  function addMember() {
    setMembers((prev) => [...prev, emptyMember()]);
    setExpanded((prev) => new Set(prev).add(members.length));
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
    setExpanded((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!teamName || !captainFullName || !captainPhone) {
      setError("Completa el nombre del equipo y los datos del capitán.");
      return;
    }
    if (captainEmail && !EMAIL_PATTERN.test(captainEmail)) {
      setError("Ingresa un correo electrónico válido para el capitán.");
      return;
    }
    if (members.length < MIN_MEMBERS) {
      setError(`Un equipo necesita al menos ${MIN_MEMBERS} integrantes.`);
      return;
    }
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.fullName || !m.idNumber || !m.phone || !m.emergencyContact) {
        setError(`Completa los datos del integrante #${i + 1} (nombre, cédula, teléfono y contacto de emergencia).`);
        return;
      }
      if (m.email && !EMAIL_PATTERN.test(m.email)) {
        setError(`El correo del integrante #${i + 1} no es válido.`);
        return;
      }
    }
    if (!paymentReference) {
      setError("Ingresa la referencia del pago del equipo.");
      return;
    }
    if (!proofFile) {
      setError("Adjunta el capture o recibo del pago del equipo.");
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.set("teamName", teamName);
    formData.set("modality", modality);
    formData.set("captainFullName", captainFullName);
    formData.set("captainPhone", captainPhone);
    if (captainEmail) formData.set("captainEmail", captainEmail);
    formData.set("paymentMethod", paymentMethod);
    formData.set("paymentReference", paymentReference);
    formData.set("bcvRate", String(bcvRate));
    formData.set(
      "membersJson",
      JSON.stringify(
        members.map((m) => ({
          ...m,
          email: m.email || undefined,
        })),
      ),
    );
    formData.set("proof", proofFile);

    setSubmitting(true);
    try {
      const { team, athletes } = await apiPost<TeamRegisterResponse>("/api/register/team", formData);

      const data: TeamRegistrationData = {
        registrationId: generateRegistrationId(),
        teamName: team.name,
        teamId: team.id,
        modality,
        captainFullName,
        captainPhone,
        captainEmail,
        paymentMethod,
        paymentReference,
        memberCount: team.memberCount,
        discountPercent: team.discountPercent,
        subtotalUsd: team.subtotalAmountUsd,
        totalUsd: team.totalAmountUsd,
        totalBs,
        bcvRate,
        createdAt: new Date().toISOString(),
        members: athletes.map(({ athlete, qrToken }) => ({
          fullName: athlete.fullName,
          idNumber: athlete.ci,
          phone: athlete.phone,
          email: athlete.email ?? "",
          emergencyContact: athlete.emergencyContact,
          bloodType: athlete.bloodType,
          jerseyCut: athlete.jerseyCut,
          jerseySize: athlete.jerseySize,
          athleteId: athlete.id,
          qrCodeToken: qrToken,
          amountUsd: athlete.totalAmountUsd,
          amountBs: totalBs / team.memberCount,
        })),
      };

      onSuccess(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la inscripción del equipo. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={labelClass}>Nombre del equipo</span>
          <input
            className={inputClass}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder='Ej. "Café Flor de la Patria"'
          />
        </label>
        <label>
          <span className={labelClass}>Nombre del capitán</span>
          <input
            className={inputClass}
            value={captainFullName}
            onChange={(e) => setCaptainFullName(e.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>
        <label>
          <span className={labelClass}>Teléfono del capitán</span>
          <input
            className={inputClass}
            value={captainPhone}
            onChange={(e) => setCaptainPhone(e.target.value)}
            placeholder="0412-0000000"
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>Correo del capitán (opcional)</span>
          <input
            className={inputClass}
            type="email"
            value={captainEmail}
            onChange={(e) => setCaptainEmail(e.target.value)}
            placeholder="capitan@ejemplo.com"
          />
        </label>
      </div>

      <div>
        <span className={labelClass}>Modalidad del equipo (mismo recorrido para todos)</span>
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
                Llegada: {route.finishPoint} · ${route.priceUsd} c/u
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>
            Integrantes del equipo ({memberCount})
          </span>
          <button
            type="button"
            onClick={addMember}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-card-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-muted transition-colors hover:border-brand-neon hover:text-brand-neon"
          >
            <Plus size={12} /> Agregar integrante
          </button>
        </div>

        <div className="space-y-2">
          {members.map((member, i) => {
            const sizes = JERSEY_SIZES_BY_CUT[member.jerseyCut];
            const isExpanded = expanded.has(i);
            return (
              <div key={i} className="rounded-lg border border-brand-card-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggleExpanded(i)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-ink-muted">#{i + 1}</span>
                    <span className="font-semibold text-ink">{member.fullName || "Sin nombre aún"}</span>
                    {member.idNumber && <span className="text-ink-muted">· {member.idNumber}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {members.length > MIN_MEMBERS && (
                      <Trash2
                        size={14}
                        role="button"
                        aria-label={`Eliminar integrante #${i + 1}`}
                        className="text-ink-muted transition-colors hover:text-brand-blue"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMember(i);
                        }}
                      />
                    )}
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-ink-muted" />
                    ) : (
                      <ChevronDown size={14} className="text-ink-muted" />
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="grid gap-2.5 border-t border-brand-card-border px-3 py-3 sm:grid-cols-2">
                    <label>
                      <span className={smallLabelClass}>Nombre completo</span>
                      <input
                        className={smallInputClass}
                        value={member.fullName}
                        onChange={(e) => updateMember(i, { fullName: e.target.value })}
                        placeholder="Nombre y apellido"
                      />
                    </label>
                    <label>
                      <span className={smallLabelClass}>Cédula / Pasaporte</span>
                      <input
                        className={smallInputClass}
                        value={member.idNumber}
                        onChange={(e) => updateMember(i, { idNumber: e.target.value })}
                        placeholder="V-00000000"
                      />
                    </label>
                    <label>
                      <span className={smallLabelClass}>Teléfono</span>
                      <input
                        className={smallInputClass}
                        value={member.phone}
                        onChange={(e) => updateMember(i, { phone: e.target.value })}
                        placeholder="0412-0000000"
                      />
                    </label>
                    <label>
                      <span className={smallLabelClass}>Correo (opcional)</span>
                      <input
                        className={smallInputClass}
                        type="email"
                        value={member.email}
                        onChange={(e) => updateMember(i, { email: e.target.value })}
                        placeholder="correo@ejemplo.com"
                      />
                    </label>
                    <label>
                      <span className={smallLabelClass}>Contacto de emergencia</span>
                      <input
                        className={smallInputClass}
                        value={member.emergencyContact}
                        onChange={(e) => updateMember(i, { emergencyContact: e.target.value })}
                        placeholder="Nombre y teléfono"
                      />
                    </label>
                    <label>
                      <span className={smallLabelClass}>Grupo sanguíneo</span>
                      <select
                        className={smallInputClass}
                        value={member.bloodType}
                        onChange={(e) => updateMember(i, { bloodType: e.target.value as BloodType })}
                      >
                        {BLOOD_TYPES.map((bt) => (
                          <option key={bt} value={bt}>
                            {bt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={smallLabelClass}>Corte de jersey</span>
                      <select
                        className={smallInputClass}
                        value={member.jerseyCut}
                        onChange={(e) => handleMemberCutChange(i, e.target.value as JerseyCut)}
                      >
                        {JERSEY_CUTS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={smallLabelClass}>Talla</span>
                      <select
                        className={smallInputClass}
                        value={member.jerseySize}
                        onChange={(e) => updateMember(i, { jerseySize: e.target.value as JerseySize })}
                      >
                        {sizes.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-brand-card-border bg-surface px-4 py-3 text-xs text-ink-muted">
        <div className="flex items-center gap-2 text-ink">
          <Users size={14} className="text-brand-neon" />
          <span className="font-bold uppercase tracking-wide">Resumen del equipo</span>
        </div>
        <div className="mt-2 flex justify-between">
          <span>Subtotal ({memberCount} × ${selectedModality.priceUsd})</span>
          <span className="font-semibold text-ink">{formatUsd(subtotalUsd)}</span>
        </div>
        {discountPercent > 0 ? (
          <div className="mt-1 flex justify-between text-brand-neon">
            <span>Descuento de equipo ({discountPercent}%)</span>
            <span className="font-semibold">-{formatUsd(subtotalUsd - totalUsd)}</span>
          </div>
        ) : (
          missingForDiscount > 0 && (
            <div className="mt-1 text-[11px] text-brand-blue">
              Faltan {missingForDiscount} integrante{missingForDiscount === 1 ? "" : "s"} para desbloquear el 10% de
              descuento (mínimo {TEAM_DISCOUNT_MIN_SIZE}).
            </div>
          )
        )}
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm">
          <span className="font-bold uppercase text-ink">Total a pagar</span>
          <span className="font-bold text-ink">
            {formatUsd(totalUsd)} · {formatBs(totalBs)}
          </span>
        </div>
      </div>

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
          <span className={labelClass}>Referencia de pago</span>
          <input
            className={inputClass}
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="Nro. de referencia / recibo"
          />
        </label>
      </div>

      <div>
        <span className={labelClass}>Comprobante de pago del equipo (capture o recibo, un solo pago)</span>
        <PaymentProofUploader
          onFileSelected={setProofFile}
          onExtracted={(result) => {
            if (result.referencia) setPaymentReference(result.referencia);
          }}
        />
      </div>

      {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-neon px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon transition-shadow hover:shadow-neon-strong disabled:opacity-60"
      >
        {submitting ? "Enviando inscripción del equipo…" : `Confirmar inscripción de equipo — ${formatUsd(totalUsd)}`}
      </button>
    </form>
  );
}
