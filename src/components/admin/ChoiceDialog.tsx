interface ChoiceDialogOption {
  key: string;
  label: string;
  description: string;
  danger?: boolean;
}

interface ChoiceDialogProps {
  title: string;
  message: string;
  options: ChoiceDialogOption[];
  busyKey?: string | null;
  onSelect: (key: string) => void;
  onCancel: () => void;
}

// Como ConfirmDialog pero para decisiones con más de una salida válida (p. ej. "eliminar
// equipo": ¿solo desagrupar o borrar también a los integrantes?). No reemplaza a
// ConfirmDialog — ese sigue siendo lo correcto para una confirmación de sí/no simple.
export function ChoiceDialog({ title, message, options, busyKey, onSelect, onCancel }: ChoiceDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6"
      >
        <h2 className="text-sm font-black uppercase tracking-widest text-ink">{title}</h2>
        <p className="text-xs text-ink-muted">{message}</p>

        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={Boolean(busyKey)}
              onClick={() => onSelect(option.key)}
              className={`w-full rounded-lg border px-4 py-2.5 text-left transition-colors disabled:opacity-60 ${
                option.danger
                  ? "border-red-500/30 bg-red-500/10 hover:bg-red-500/15"
                  : "border-brand-card-border bg-surface hover:border-brand-neon"
              }`}
            >
              <p
                className={`text-xs font-extrabold uppercase tracking-widest ${
                  option.danger ? "text-red-400" : "text-ink"
                }`}
              >
                {busyKey === option.key ? "Procesando…" : option.label}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">{option.description}</p>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={Boolean(busyKey)}
          className="w-full rounded-full border border-brand-card-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink-muted disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
