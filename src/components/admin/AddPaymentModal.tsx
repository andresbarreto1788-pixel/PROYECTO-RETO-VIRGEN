import { X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, adminPatch } from "../../lib/api";
import type { Athlete } from "../../types/admin";

const inputClass =
  "mt-1 w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-neon";
const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-ink-muted";

interface AddPaymentModalProps {
  athlete: Athlete;
  onClose: () => void;
  onSaved: () => void;
}

export function AddPaymentModal({ athlete, onClose, onSaved }: AddPaymentModalProps) {
  const [amountBs, setAmountBs] = useState("");
  const [bcvRate, setBcvRate] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const amount = Number(amountBs);
    const rate = Number(bcvRate);
    if (!amount || amount <= 0) {
      setError("El monto en Bs debe ser mayor a cero.");
      return;
    }
    if (!rate || rate <= 0) {
      setError("La tasa BCV debe ser mayor a cero.");
      return;
    }
    if (!reference.trim()) {
      setError("La referencia es obligatoria.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await adminPatch(`/api/admin/athletes/${athlete.id}/payment`, {
        action: "add_payment",
        amountBs: amount,
        bcvRate: rate,
        reference: reference.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el abono.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">Registrar Abono</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-muted">{athlete.fullName}</p>

        {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

        <div className="space-y-3">
          <label className={labelClass}>
            Monto abonado (Bs)
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={amountBs}
              onChange={(e) => setAmountBs(e.target.value)}
              required
            />
          </label>
          <label className={labelClass}>
            Tasa BCV usada
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.0001"
              value={bcvRate}
              onChange={(e) => setBcvRate(e.target.value)}
              required
            />
          </label>
          <label className={labelClass}>
            Referencia del pago
            <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} required />
          </label>
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
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
