import { X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, adminPatch } from "../../lib/api";
import type { Athlete, AthleteRoute } from "../../types/admin";
import type { BloodType, JerseySize } from "../../types/race";

const BLOOD_TYPES: BloodType[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const JERSEY_SIZES: JerseySize[] = ["S", "M", "L", "XL", "XXL"];

const inputClass =
  "mt-1 w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-neon";
const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-ink-muted";

interface EditAthleteModalProps {
  athlete: Athlete;
  onClose: () => void;
  onSaved: () => void;
}

export function EditAthleteModal({ athlete, onClose, onSaved }: EditAthleteModalProps) {
  const [fullName, setFullName] = useState(athlete.fullName);
  const [ci, setCi] = useState(athlete.ci);
  const [phone, setPhone] = useState(athlete.phone);
  const [emergencyContact, setEmergencyContact] = useState(athlete.emergencyContact);
  const [bloodType, setBloodType] = useState<BloodType>(athlete.bloodType);
  const [route, setRoute] = useState<AthleteRoute>(athlete.route);
  const [jerseySize, setJerseySize] = useState<JerseySize>(athlete.jerseySize);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminPatch(`/api/admin/athletes/${athlete.id}`, {
        fullName,
        ci,
        phone,
        emergencyContact,
        bloodType,
        route,
        jerseySize,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar los cambios.");
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
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">Editar Atleta</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

        <div className="space-y-3">
          <label className={labelClass}>
            Nombre completo
            <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Cédula
            <input className={inputClass} value={ci} onChange={(e) => setCi(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Teléfono
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
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

          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Sangre
              <select className={inputClass} value={bloodType} onChange={(e) => setBloodType(e.target.value as BloodType)}>
                {BLOOD_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Ruta
              <select className={inputClass} value={route} onChange={(e) => setRoute(e.target.value as AthleteRoute)}>
                <option value="33K_REDOMA">33K</option>
                <option value="22K_ILUSTRES">22K</option>
              </select>
            </label>
            <label className={labelClass}>
              Talla
              <select className={inputClass} value={jerseySize} onChange={(e) => setJerseySize(e.target.value as JerseySize)}>
                {JERSEY_SIZES.map((size) => (
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
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
