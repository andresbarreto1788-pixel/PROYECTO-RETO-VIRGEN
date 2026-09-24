import { CheckCircle2, Download, ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, ApiError, adminDownloadCertificate, adminGet, adminPatch, adminPost } from "../../lib/api";
import { formatUsd } from "../../lib/format";
import type { Athlete, PaymentStatus, TeamApprovalResult, TeamDetailResponse, TeamSummary } from "../../types/admin";
import { AddPaymentModal } from "./AddPaymentModal";
import { ConfirmDialog } from "./ConfirmDialog";

interface TeamDetailModalProps {
  teamId: string;
  onClose: () => void;
  onMutated: () => void;
}

type Tab = "equipo" | "integrantes";

const pillClass = (active: boolean) =>
  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
    active ? "bg-brand-neon text-surface" : "border border-brand-card-border text-ink-muted"
  }`;

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

export function TeamDetailModal({ teamId, onClose, onMutated }: TeamDetailModalProps) {
  const [tab, setTab] = useState<Tab>("equipo");
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [members, setMembers] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [payingMember, setPayingMember] = useState<Athlete | null>(null);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalResult, setApprovalResult] = useState<TeamApprovalResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGet<TeamDetailResponse>(`/api/admin/teams/${teamId}`);
      setTeam(res.team);
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la ficha del equipo.");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runMemberAction(memberId: string, action: () => Promise<unknown>) {
    setError(null);
    setBusyMemberId(memberId);
    try {
      await action();
      await load();
      onMutated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusyMemberId(null);
    }
  }

  function handleApproveMember(member: Athlete) {
    const pendingPayment = member.payments?.find((p) => p.status === "PENDING");
    if (!pendingPayment) return;
    runMemberAction(member.id, () =>
      adminPatch(`/api/admin/athletes/${member.id}/payment`, { action: "approve", paymentId: pendingPayment.id }),
    );
  }

  function handleRejectMember(member: Athlete) {
    const pendingPayment = member.payments?.find((p) => p.status === "PENDING");
    if (!pendingPayment) return;
    runMemberAction(member.id, () =>
      adminPatch(`/api/admin/athletes/${member.id}/payment`, { action: "reject", paymentId: pendingPayment.id }),
    );
  }

  function handleDownloadCertificate(member: Athlete) {
    runMemberAction(member.id, () => adminDownloadCertificate(member.id, member.ci));
  }

  async function handleConfirmApproval() {
    setApproving(true);
    setError(null);
    try {
      const result = await adminPost<TeamApprovalResult>(`/api/admin/teams/${teamId}/approve-payments`, {});
      setApprovalResult(result);
      setConfirmingApproval(false);
      await load();
      onMutated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aprobar el pago del equipo.");
    } finally {
      setApproving(false);
    }
  }

  const pendingCount = members.filter((m) => m.paymentStatus !== "PAID").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto space-y-4 rounded-2xl border border-brand-card-border bg-brand-card p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">{team?.name ?? "Equipo"}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("equipo")} className={pillClass(tab === "equipo")}>
            Equipo
          </button>
          <button type="button" onClick={() => setTab("integrantes")} className={pillClass(tab === "integrantes")}>
            Integrantes {team ? `(${team.memberCount})` : ""}
          </button>
        </div>

        {error && <p className="text-xs font-semibold text-brand-blue">{error}</p>}
        {loading && !team && <p className="text-xs text-ink-muted">Cargando…</p>}

        {team && tab === "equipo" && (
          <div className="space-y-4 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-brand-card-border bg-surface p-3">
                <p className="text-[10px] uppercase tracking-widest text-ink-muted">Capitán</p>
                <p className="mt-1 font-semibold text-ink">{team.captainFullName}</p>
                <p className="text-ink-muted">{team.captainPhone}</p>
                {team.captainEmail && <p className="text-ink-muted">{team.captainEmail}</p>}
              </div>
              <div className="rounded-lg border border-brand-card-border bg-surface p-3">
                <p className="text-[10px] uppercase tracking-widest text-ink-muted">Modalidad</p>
                <p className="mt-1 font-semibold text-ink">{team.route === "33K_REDOMA" ? "33K · Redoma" : "22K · Ilustres"}</p>
                <p className="text-ink-muted">La modalidad del equipo no se puede editar desde el panel.</p>
              </div>
            </div>

            <div className="rounded-lg border border-brand-card-border bg-surface p-3">
              <p className="text-[10px] uppercase tracking-widest text-ink-muted">Pago</p>
              <div className="mt-1.5 flex justify-between">
                <span className="text-ink-muted">Subtotal ({team.memberCount} × precio)</span>
                <span className="text-ink">{formatUsd(team.subtotalAmountUsd)}</span>
              </div>
              {team.discountPercent > 0 && (
                <div className="flex justify-between text-brand-neon">
                  <span>Descuento aplicado</span>
                  <span>{team.discountPercent}%</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-white/10 pt-1.5 font-bold">
                <span className="text-ink">Total</span>
                <span className="text-ink">{formatUsd(team.totalAmountUsd)}</span>
              </div>
              <div className="mt-1 flex justify-between text-ink-muted">
                <span>Aprobado hasta ahora</span>
                <span>{formatUsd(team.paidAmountUsd)}</span>
              </div>
              {team.proofUrl && (
                <a
                  href={`${API_BASE}${team.proofUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-brand-neon underline underline-offset-2"
                >
                  <ExternalLink size={12} /> Ver comprobante de pago
                </a>
              )}
            </div>

            {team.discountEligible && (
              <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-[11px] leading-relaxed text-yellow-400">
                Este equipo ya tiene {team.memberCount} integrantes y calificaría para el 10% de descuento, pero se
                inscribió sin él. Si corresponde ajustarlo, hazlo manualmente desde el pago de cada integrante.
              </p>
            )}

            <div className="rounded-lg border border-brand-card-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-ink-muted">Aprobar pago del equipo</p>
                  <p className="mt-1 text-ink-muted">
                    {pendingCount > 0
                      ? `${pendingCount} de ${team.memberCount} integrantes todavía no están solventes.`
                      : "Todos los integrantes ya están solventes."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pendingCount === 0}
                  onClick={() => {
                    setApprovalResult(null);
                    setConfirmingApproval(true);
                  }}
                  className="shrink-0 rounded-full bg-brand-neon px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-surface disabled:opacity-30"
                >
                  Aprobar pago del equipo
                </button>
              </div>

              {approvalResult && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-neon/10 p-3 text-[11px] text-brand-neon">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  <p>
                    Se aprobaron {approvalResult.approvedCount} pagos ({approvalResult.alreadyPaidCount} ya estaban
                    solventes) y se asignaron {approvalResult.bibsAssigned} dorsales nuevos. Se están enviando{" "}
                    {approvalResult.certificatesQueued} certificados por correo
                    {approvalResult.membersWithoutEmail > 0 &&
                      ` (${approvalResult.membersWithoutEmail} integrante${approvalResult.membersWithoutEmail === 1 ? "" : "s"} sin correo registrado no recibirá certificado)`}
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {team && tab === "integrantes" && (
          <div className="overflow-x-auto rounded-xl border border-brand-card-border">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-surface text-[10px] uppercase tracking-widest text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5">Integrante</th>
                  <th className="px-3 py-2.5">Talla</th>
                  <th className="px-3 py-2.5">Pago</th>
                  <th className="px-3 py-2.5">Check-in</th>
                  <th className="px-3 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const busy = busyMemberId === member.id;
                  return (
                    <tr key={member.id} className="border-t border-white/5">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-ink">{member.fullName}</div>
                        <div className="text-ink-muted">{member.ci}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">
                        {member.jerseySize} <span className="text-[10px] uppercase">({member.jerseyCut})</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${STATUS_STYLES[member.paymentStatus]}`}
                        >
                          {STATUS_LABELS[member.paymentStatus]}
                        </span>
                        <div className="mt-1 text-ink-muted">
                          {formatUsd(member.paidAmountUsd ?? 0)} / {formatUsd(member.totalAmountUsd)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">
                        {member.checkedIn ? `Dorsal #${member.bibNumber}` : "No"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy || !member.payments?.some((p) => p.status === "PENDING")}
                            onClick={() => handleApproveMember(member)}
                            className="rounded-full bg-brand-neon/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-neon disabled:opacity-30"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPayingMember(member)}
                            className="rounded-full bg-brand-blue/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-blue disabled:opacity-30"
                          >
                            Abono
                          </button>
                          <button
                            type="button"
                            disabled={busy || !member.payments?.some((p) => p.status === "PENDING")}
                            onClick={() => handleRejectMember(member)}
                            className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400 disabled:opacity-30"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDownloadCertificate(member)}
                            title="Descargar certificado PDF"
                            aria-label="Descargar certificado PDF"
                            className="rounded-full bg-brand-neon/15 p-1.5 text-brand-neon transition-colors hover:text-brand-neon/80 disabled:opacity-30"
                          >
                            <Download size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                      Este equipo no tiene integrantes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payingMember && (
        <AddPaymentModal
          athlete={payingMember}
          onClose={() => setPayingMember(null)}
          onSaved={() => {
            setPayingMember(null);
            load();
            onMutated();
          }}
        />
      )}

      {confirmingApproval && team && (
        <ConfirmDialog
          title="Aprobar pago del equipo"
          message={`Se aprobarán los pagos pendientes de ${pendingCount} de ${team.memberCount} integrantes, se les asignará dorsal y se les enviará su certificado por correo (los que tengan correo registrado). Esta acción no se puede deshacer.`}
          confirmLabel="Aprobar pago del equipo"
          busy={approving}
          onConfirm={handleConfirmApproval}
          onCancel={() => setConfirmingApproval(false)}
        />
      )}
    </div>
  );
}
