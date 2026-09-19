import { LogOut, MessageCircle, QrCode, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EVENT } from "../data/raceData";
import { ADMIN_UNAUTHORIZED_EVENT, adminGet, clearAdminToken, getAdminToken } from "../lib/api";
import { AdminLogin } from "../components/admin/AdminLogin";
import { AthleteTable } from "../components/admin/AthleteTable";
import { CrmPanel } from "../components/admin/CrmPanel";
import { MetricsHud } from "../components/admin/MetricsHud";
import { QrScannerPanel } from "../components/admin/QrScannerPanel";
import type { AdminMetrics } from "../types/admin";

type Tab = "athletes" | "scanner" | "crm";

export function AdminDashboard() {
  const [authed, setAuthed] = useState(() => Boolean(getAdminToken()));
  const [tab, setTab] = useState<Tab>("athletes");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await adminGet<AdminMetrics>("/api/admin/metrics");
      setMetrics(data);
    } catch {
      // si el token expiró, la tabla ya muestra el error de sesión
    }
  }, []);

  useEffect(() => {
    if (authed) loadMetrics();
  }, [authed, loadMetrics]);

  useEffect(() => {
    const handleUnauthorized = () => setAuthed(false);
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  // Habilita "Instalar app" para el panel: un manifest propio (start_url /admin) y un
  // service worker mínimo son los dos requisitos del navegador para ofrecer instalarlo
  // como PWA independiente, separado del sitio público.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest-admin.json";
    document.head.appendChild(link);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).catch(() => {});
    }

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  if (!authed) {
    return <AdminLogin onSuccess={() => setAuthed(true)} />;
  }

  function handleLogout() {
    clearAdminToken();
    setAuthed(false);
  }

  return (
    <div className="min-h-svh bg-surface px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-hud text-xs uppercase tracking-widest text-brand-neon">{EVENT.raceName}</p>
            <h1 className="text-2xl font-black uppercase text-ink">Panel Administrativo</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-full border border-brand-card-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted hover:text-ink"
          >
            <LogOut size={14} /> Salir
          </button>
        </div>

        <div className="mb-6">
          <MetricsHud metrics={metrics} />
        </div>

        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("athletes")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              tab === "athletes" ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
            }`}
          >
            <Users size={14} /> Control de Atletas
          </button>
          <button
            type="button"
            onClick={() => setTab("scanner")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              tab === "scanner" ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
            }`}
          >
            <QrCode size={14} /> Escáner Paddock
          </button>
          <button
            type="button"
            onClick={() => setTab("crm")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              tab === "crm" ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
            }`}
          >
            <MessageCircle size={14} /> WhatsApp & CRM
          </button>
        </div>

        {tab === "athletes" && <AthleteTable onMutated={loadMetrics} />}
        {tab === "scanner" && <QrScannerPanel onCheckedIn={loadMetrics} />}
        {tab === "crm" && <CrmPanel />}
      </div>
    </div>
  );
}
