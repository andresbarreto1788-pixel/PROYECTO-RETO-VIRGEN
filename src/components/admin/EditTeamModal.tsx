import { X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, adminPatch } from "../../lib/api";
import type { TeamSummary } from "../../types/admin";

const inputClass =
  "mt-1 w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-neon";
const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-ink-muted";

interface EditTeamModalProps {
  team: TeamSummary;
  onClose: () => void;
  onSaved: () => void;
}

export function EditTeamModal({ team, onClose, onSaved }: EditTeamModalProps) {
  const [name, setName] = useState(team.name);
  const [captainFullName, setCaptainFullName] = useState(team.captainFullName);
  const [captainPhone, setCaptainPhone] = useState(team.captainPhone);
  const [captainEmail, setCaptainEmail] = useState(team.captainEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminPatch(`/api/admin/teams/${team.id}`, {
        name,
        captainFullName,
        captainPhone,
        ...(captainEmail ? { captainEmail } : {}),
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
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">Editar Equipo</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

        <div className="space-y-3">
          <label className={labelClass}>
            Nombre del equipo
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Nombre del capitán
            <input
              className={inputClass}
              value={captainFullName}
              onChange={(e) => setCaptainFullName(e.target.value)}
              required
            />
          </label>
          <label className={labelClass}>
            Teléfono del capitán
            <input
              className={inputClass}
              value={captainPhone}
              onChange={(e) => setCaptainPhone(e.target.value)}
              required
            />
          </label>
          <label className={labelClass}>
            Correo del capitán (opcional)
            <input
              className={inputClass}
              type="email"
              value={captainEmail}
              onChange={(e) => setCaptainEmail(e.target.value)}
            />
          </label>
        </div>

        <p className="text-[10px] leading-relaxed text-ink-muted">
          La modalidad ({team.route === "33K_REDOMA" ? "33K" : "22K"}) no se puede editar desde aquí.
        </p>

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
