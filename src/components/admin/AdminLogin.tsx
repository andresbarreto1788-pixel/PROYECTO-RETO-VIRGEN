import { Lock } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, adminPost, setAdminToken } from "../../lib/api";

interface AdminLoginProps {
  onSuccess: () => void;
}

export function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await adminPost<{ token: string }>("/api/admin/login", { password });
      setAdminToken(token);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-surface px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-brand-card-border bg-brand-card p-8">
        <div className="mb-6 flex items-center gap-2 text-brand-neon">
          <Lock size={20} />
          <p className="text-sm font-bold uppercase tracking-widest">Panel Administrativo</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-ink-muted">Contraseña de organizador</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-brand-card-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-neon"
          />
        </label>
        {error && <p className="mt-3 text-xs font-semibold text-brand-blue">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-full bg-brand-neon px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
