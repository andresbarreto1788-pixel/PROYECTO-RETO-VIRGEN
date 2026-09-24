import { X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, adminPost } from "../../lib/api";
import { JERSEY_CUTS, JERSEY_SIZES_BY_CUT } from "../../data/raceData";
import type { TeamSummary } from "../../types/admin";
import type { BloodType, JerseyCut, JerseySize } from "../../types/race";

const BLOOD_TYPES: BloodType[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

const inputClass =
  "mt-1 w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-neon";
const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-ink-muted";

interface AddTeamMemberModalProps {
  team: TeamSummary;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTeamMemberModal({ team, onClose, onSaved }: AddTeamMemberModalProps) {
  const [fullName, setFullName] = useState("");
  const [ci, setCi] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [bloodType, setBloodType] = useState<BloodType>("O+");
  const [jerseyCut, setJerseyCut] = useState<JerseyCut>("caballero");
  const [jerseySize, setJerseySize] = useState<JerseySize>("M");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jerseySizes = JERSEY_SIZES_BY_CUT[jerseyCut];

  function handleJerseyCutChange(next: JerseyCut) {
    setJerseyCut(next);
    if (!JERSEY_SIZES_BY_CUT[next].includes(jerseySize)) {
      setJerseySize(JERSEY_SIZES_BY_CUT[next][1] as JerseySize);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminPost(`/api/admin/teams/${team.id}/members`, {
        mode: "create",
        fullName,
        ci,
        phone,
        ...(email ? { email } : {}),
        emergencyContact,
        bloodType,
        jerseyCut,
        jerseySize,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el integrante.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">Agregar Integrante</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          Se suma a {team.name} ({team.route === "33K_REDOMA" ? "33K" : "22K"}).
        </p>

        {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

        <div className="space-y-3">
          <label className={labelClass}>
            Nombre completo
            <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Cédula / Pasaporte
            <input className={inputClass} value={ci} onChange={(e) => setCi(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Teléfono
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Correo (opcional)
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={labelClass}>
            Contacto de emergencia
            <input
              className={inputClass}
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Sangre
              <select
                className={inputClass}
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value as BloodType)}
              >
                {BLOOD_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Corte
              <select
                className={inputClass}
                value={jerseyCut}
                onChange={(e) => handleJerseyCutChange(e.target.value as JerseyCut)}
              >
                {JERSEY_CUTS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Talla
              <select className={inputClass} value={jerseySize} onChange={(e) => setJerseySize(e.target.value as JerseySize)}>
                {jerseySizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-brand-card-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-full bg-brand-neon px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-surface disabled:opacity-60"
          >
            {saving ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}
