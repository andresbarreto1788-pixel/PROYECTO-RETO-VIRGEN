import { Download, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, ApiError, adminDelete, adminDownloadCertificate, adminDownloadExport, adminGet, adminPatch } from "../../lib/api";
import { formatBs, formatUsd } from "../../lib/format";
import type { Athlete, AthleteListResponse, AthleteRoute, PaymentStatus } from "../../types/admin";
import { AddPaymentModal } from "./AddPaymentModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditAthleteModal } from "./EditAthleteModal";

interface AthleteTableProps {
  onMutated: () => void;
}

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<PaymentStatus, string> = {
  PAID: "bg-brand-neon/15 text-brand-neon",
  PARTIAL: "bg-brand-blue/15 text-brand-blue",
  PENDING_REVIEW: "bg-white/10 text-ink-muted",
  REJECTED: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "Solvente",
  PARTIAL: "Por Cuotas",
  PENDING_REVIEW: "Pendiente",
  REJECTED: "Rechazado",
};

const selectClass =
  "rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand-neon";

export function AthleteTable({ onMutated }: AthleteTableProps) {
  const [items, setItems] = useState<Athlete[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [routeFilter, setRouteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [checkedInFilter, setCheckedInFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAthleteId, setBusyAthleteId] = useState<string | null>(null);
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);
  const [payingAthlete, setPayingAthlete] = useState<Athlete | null>(null);
  const [deletingAthlete, setDeletingAthlete] = useState<Athlete | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (routeFilter) params.set("route", routeFilter);
    if (statusFilter) params.set("paymentStatus", statusFilter);
    if (checkedInFilter) params.set("checkedIn", checkedInFilter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    try {
      const res = await adminGet<AthleteListResponse>(`/api/admin/athletes?${params}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo cargar la lista de atletas.");
    } finally {
      setLoading(false);
    }
  }, [routeFilter, statusFilter, checkedInFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(athleteId: string, action: () => Promise<unknown>) {
    setActionError(null);
    setBusyAthleteId(athleteId);
    try {
      await action();
      await load();
      onMutated();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusyAthleteId(null);
    }
  }

  function handleApprove(athlete: Athlete) {
    const pendingPayment = athlete.payments?.find((p) => p.status === "PENDING");
    if (!pendingPayment) return;
    runAction(athlete.id, () => adminPatch(`/api/admin/athletes/${athlete.id}/payment`, { action: "approve", paymentId: pendingPayment.id }));
  }

  function handleReject(athlete: Athlete) {
    const pendingPayment = athlete.payments?.find((p) => p.status === "PENDING");
    if (!pendingPayment) return;
    runAction(athlete.id, () => adminPatch(`/api/admin/athletes/${athlete.id}/payment`, { action: "reject", paymentId: pendingPayment.id }));
  }

  function handleAddPayment(athlete: Athlete) {
    setPayingAthlete(athlete);
  }

  function handleDelete(athlete: Athlete) {
    setDeletingAthlete(athlete);
  }

  function handleDownloadCertificate(athlete: Athlete) {
    runAction(athlete.id, () => adminDownloadCertificate(athlete.id, athlete.ci));
  }

  async function handleConfirmDelete() {
    if (!deletingAthlete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminDelete(`/api/admin/athletes/${deletingAthlete.id}`);
      setDeletingAthlete(null);
      await load();
      onMutated();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo eliminar el atleta.");
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClass}
          value={routeFilter}
          onChange={(e) => {
            setPage(1);
            setRouteFilter(e.target.value);
          }}
        >
          <option value="">Todas las rutas</option>
          <option value={"33K_REDOMA" satisfies AthleteRoute}>33K Redoma</option>
          <option value={"22K_ILUSTRES" satisfies AthleteRoute}>22K Ilustres</option>
        </select>

        <select
          className={selectClass}
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
        >
          <option value="">Todos los estatus</option>
          <option value="PAID">Solvente</option>
          <option value="PARTIAL">Por Cuotas</option>
          <option value="PENDING_REVIEW">Pendiente</option>
          <option value="REJECTED">Rechazado</option>
        </select>

        <select
          className={selectClass}
          value={checkedInFilter}
          onChange={(e) => {
            setPage(1);
            setCheckedInFilter(e.target.value);
          }}
        >
          <option value="">Check-in: todos</option>
          <option value="true">Ya hizo check-in</option>
          <option value="false">Sin check-in</option>
        </select>

        <button
          type="button"
          onClick={() => adminDownloadExport().catch((err) => setActionError(err instanceof ApiError ? err.message : "No se pudo exportar."))}
          className="ml-auto rounded-full border border-brand-card-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted transition-colors hover:text-ink"
        >
          Exportar CSV
        </button>
      </div>

      {actionError && <p className="text-xs font-semibold text-brand-blue">{actionError}</p>}

      <div className="overflow-x-auto rounded-xl border border-brand-card-border">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-brand-card text-[10px] uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="px-3 py-2.5">Atleta</th>
              <th className="px-3 py-2.5">Equipo</th>
              <th className="px-3 py-2.5">Ruta</th>
              <th className="px-3 py-2.5">Talla</th>
              <th className="px-3 py-2.5">Pago</th>
              <th className="px-3 py-2.5">Comprobante</th>
              <th className="px-3 py-2.5">Check-in</th>
              <th className="px-3 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((athlete) => {
              const latestPayment = athlete.payments?.[0];
              const busy = busyAthleteId === athlete.id;
              return (
                <tr key={athlete.id} className="border-t border-white/5">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-ink">{athlete.fullName}</div>
                    <div className="text-ink-muted">{athlete.ci}</div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{athlete.teamName ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{athlete.route === "33K_REDOMA" ? "33K" : "22K"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {athlete.jerseySize} <span className="text-[10px] uppercase">({athlete.jerseyCut})</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${STATUS_STYLES[athlete.paymentStatus]}`}>
                      {STATUS_LABELS[athlete.paymentStatus]}
                    </span>
                    <div className="mt-1 text-ink-muted">
                      {formatUsd(athlete.paidAmountUsd ?? 0)} / {formatUsd(athlete.totalAmountUsd)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {latestPayment?.proofUrl ? (
                      <a
                        href={`${API_BASE}${latestPayment.proofUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-neon underline underline-offset-2"
                      >
                        Ver capture
                      </a>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                    {latestPayment && (
                      <div className="text-ink-muted">
                        Ref. {latestPayment.reference} · {formatBs(latestPayment.amountBs)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {athlete.checkedIn ? `Dorsal #${athlete.bibNumber}` : "No"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy || !athlete.payments?.some((p) => p.status === "PENDING")}
                        onClick={() => handleApprove(athlete)}
                        className="rounded-full bg-brand-neon/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-neon disabled:opacity-30"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAddPayment(athlete)}
                        className="rounded-full bg-brand-blue/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-blue disabled:opacity-30"
                      >
                        Registrar Abono
                      </button>
                      <button
                        type="button"
                        disabled={busy || !athlete.payments?.some((p) => p.status === "PENDING")}
                        onClick={() => handleReject(athlete)}
                        className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400 disabled:opacity-30"
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDownloadCertificate(athlete)}
                        title="Descargar certificado PDF"
                        aria-label="Descargar certificado PDF"
                        className="rounded-full bg-brand-neon/15 p-1.5 text-brand-neon transition-colors hover:text-brand-neon/80 disabled:opacity-30"
                      >
                        <Download size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingAthlete(athlete)}
                        title="Editar atleta"
                        aria-label="Editar atleta"
                        className="rounded-full bg-white/10 p-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(athlete)}
                        title="Eliminar atleta"
                        aria-label="Eliminar atleta"
                        className="rounded-full bg-red-500/15 p-1.5 text-red-400 transition-colors hover:text-red-300 disabled:opacity-30"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-ink-muted">
                  No hay atletas para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>
          Página {page} de {totalPages} · {total} atletas
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-brand-card-border px-3 py-1 disabled:opacity-30"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-brand-card-border px-3 py-1 disabled:opacity-30"
          >
            Siguiente
          </button>
        </div>
      </div>

      {editingAthlete && (
        <EditAthleteModal
          athlete={editingAthlete}
          onClose={() => setEditingAthlete(null)}
          onSaved={() => {
            setEditingAthlete(null);
            load();
            onMutated();
          }}
        />
      )}

      {payingAthlete && (
        <AddPaymentModal
          athlete={payingAthlete}
          onClose={() => setPayingAthlete(null)}
          onSaved={() => {
            setPayingAthlete(null);
            load();
            onMutated();
          }}
        />
      )}

      {deletingAthlete && (
        <ConfirmDialog
          title="Eliminar atleta"
          message={`¿Eliminar a ${deletingAthlete.fullName} (${deletingAthlete.ci})? Esta acción no se puede deshacer y borrará también sus pagos registrados.`}
          confirmLabel="Eliminar"
          danger
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingAthlete(null)}
        />
      )}
    </div>
  );
}
