import { Check, Copy, Mail, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, adminGet } from "../../lib/api";
import type { ChannelsStatus } from "../../types/admin";

interface ChannelSettingsModalProps {
  onClose: () => void;
}

type Tab = "gmail" | "meta";

const pillClass = (active: boolean) =>
  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
    active ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
  }`;

const statusBadgeClass = (ok: boolean) =>
  `rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
    ok ? "bg-emerald-500/15 text-emerald-400" : "bg-yellow-500/15 text-yellow-400"
  }`;

export function ChannelSettingsModal({ onClose }: ChannelSettingsModalProps) {
  const [tab, setTab] = useState<Tab>("gmail");
  const [status, setStatus] = useState<ChannelsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    adminGet<ChannelsStatus>("/api/admin/crm/channels/status")
      .then(setStatus)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo consultar el estado de los canales."));
  }, []);

  async function handleCopyWebhookUrl() {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // el navegador puede bloquear el portapapeles fuera de HTTPS; no es crítico
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">Configuración de Canales</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("gmail")} className={pillClass(tab === "gmail")}>
            <Mail size={12} /> Gmail
          </button>
          <button type="button" onClick={() => setTab("meta")} className={pillClass(tab === "meta")}>
            <MessageCircle size={12} /> Meta WhatsApp
          </button>
        </div>

        {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

        {!status && !error && <p className="text-xs text-ink-muted">Consultando estado de canales…</p>}

        {status && tab === "gmail" && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Modo</span>
              <span className={statusBadgeClass(status.gmail.mode === "PRODUCTION")}>
                {status.gmail.mode === "PRODUCTION" ? "Producción" : "Mock (simulado)"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-ink-muted">Cuenta configurada</span>
              <span className="font-semibold text-ink">{status.gmail.user ?? "No configurada"}</span>
            </div>
            <div className="space-y-1.5 rounded-lg border border-brand-card-border bg-surface p-3 text-[11px] leading-relaxed text-ink-muted">
              <p className="font-bold uppercase tracking-widest text-ink">Cómo generar la contraseña de aplicación</p>
              <p>1. Activa la verificación en 2 pasos en la cuenta de Gmail del evento.</p>
              <p>2. Ve a myaccount.google.com → Seguridad → Contraseñas de aplicaciones.</p>
              <p>3. Genera una para "Correo" y colócala en GMAIL_APP_PASSWORD junto con GMAIL_USER en el servidor.</p>
            </div>
          </div>
        )}

        {status && tab === "meta" && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Credenciales</span>
              <span className={statusBadgeClass(status.meta.configured)}>
                {status.meta.configured ? "Configuradas" : "Incompletas"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-ink-muted">Verify token</span>
              <span className={statusBadgeClass(status.meta.verifyTokenSet)}>
                {status.meta.verifyTokenSet ? "Definido" : "Falta"}
              </span>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">URL del webhook</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-[11px] text-ink">
                  {status.webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebhookUrl}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-neon/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-neon"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiada" : "Copiar"}
                </button>
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg border border-brand-card-border bg-surface p-3 text-[11px] leading-relaxed text-ink-muted">
              <p className="font-bold uppercase tracking-widest text-ink">Configuración en Meta</p>
              <p>1. En developers.facebook.com, entra a tu app → WhatsApp → Configuration.</p>
              <p>2. Pega la URL del webhook de arriba y el mismo valor de META_VERIFY_TOKEN del servidor.</p>
              <p>3. Suscríbete al campo "messages" para recibir los mensajes entrantes.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
