import { Users2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, adminGet } from "../../lib/api";
import { formatUsd } from "../../lib/format";
import type { AthleteRoute, TeamListResponse, TeamSummary } from "../../types/admin";
import { TeamDetailModal } from "./TeamDetailModal";

interface TeamTableProps {
  onMutated: () => void;
}

const PAGE_SIZE = 20;

const selectClass =
  "rounded-lg border border-brand-card-border bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand-neon";

function paymentPillClass(team: TeamSummary): string {
  if (team.memberCount === 0) return "bg-white/10 text-ink-muted";
  if (team.paidMembers === team.memberCount) return "bg-brand-neon/15 text-brand-neon";
  if (team.paidMembers > 0 || team.partialMembers > 0) return "bg-brand-blue/15 text-brand-blue";
  return "bg-white/10 text-ink-muted";
}

export function TeamTable({ onMutated }: TeamTableProps) {
  const [items, setItems] = useState<TeamSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [routeFilter, setRouteFilter] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  // Debounce corto: sin esto cada tecla dispara una petición nueva.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (routeFilter) params.set("route", routeFilter);
    if (q) params.set("q", q);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    try {
      const res = await adminGet<TeamListResponse>(`/api/admin/teams?${params}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista de equipos.");
    } finally {
      setLoading(false);
    }
  }, [routeFilter, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleModalMutated() {
    load();
    onMutated();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${selectClass} w-56`}
          type="text"
          placeholder="Buscar por equipo o capitán…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />

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
      </div>

      {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-brand-card-border">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-brand-card text-[10px] uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="px-3 py-2.5">Equipo</th>
              <th className="px-3 py-2.5">Capitán</th>
              <th className="px-3 py-2.5">Modalidad</th>
              <th className="px-3 py-2.5">Integrantes</th>
              <th className="px-3 py-2.5">Descuento</th>
              <th className="px-3 py-2.5">Total</th>
              <th className="px-3 py-2.5">Pagos</th>
              <th className="px-3 py-2.5">Creado</th>
              <th className="px-3 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((team) => (
              <tr key={team.id} className="border-t border-white/5">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-ink">{team.name}</div>
                  {team.discountEligible && (
                    <div className="mt-0.5 text-[10px] uppercase tracking-widest text-yellow-400">
                      Calificaría para 10% dto.
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">
                  <div className="text-ink">{team.captainFullName}</div>
                  <div>{team.captainPhone}</div>
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{team.route === "33K_REDOMA" ? "33K" : "22K"}</td>
                <td className="px-3 py-2.5 text-ink-muted">
                  {team.memberCount}
                  {team.memberCount !== team.storedMemberCount && (
                    <span title="El conteo registrado al inscribirse no coincide con el actual.">
                      {" "}
                      (reg. {team.storedMemberCount})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">
                  {team.discountPercent > 0 ? `${team.discountPercent}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{formatUsd(team.totalAmountUsd)}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${paymentPillClass(team)}`}>
                    {team.paidMembers}/{team.memberCount} solventes
                  </span>
                </td>
                <td className="px-3 py-2.5 text-ink-muted">
                  {new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
                    new Date(team.createdAt),
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenTeamId(team.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-neon/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-neon"
                  >
                    <Users2 size={12} /> Ver equipo
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-ink-muted">
                  No hay equipos para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>
          Página {page} de {totalPages} · {total} equipos
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

      {openTeamId && (
        <TeamDetailModal teamId={openTeamId} onClose={() => setOpenTeamId(null)} onMutated={handleModalMutated} />
      )}
    </div>
  );
}
