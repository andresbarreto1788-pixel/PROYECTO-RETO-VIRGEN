import { EVENT, JERSEY_CUTS, PAYMENT_METHOD_LABELS, ROUTE_MODALITIES } from "../data/raceData";
import { formatBs, formatUsd } from "./format";
import type { RegistrationData, TeamRegistrationData } from "../types/race";

export function buildRegistrationWhatsAppLink(data: RegistrationData): string {
  const route = ROUTE_MODALITIES.find((m) => m.id === data.modality);
  const modalityLabel = route ? `${route.distanceKm} KM — Salida ${route.startPoint}` : data.modality;
  const paymentLabel = PAYMENT_METHOD_LABELS[data.paymentMethod];
  const cutLabel = JERSEY_CUTS.find((c) => c.id === data.jerseyCut)?.label ?? data.jerseyCut;

  const planLabel = data.paymentPlan === "full" ? "Pago Completo (100%)" : "Pago por Cuotas";

  const lines = [
    `*Nueva inscripción — Reto Virgen de la Paz*`,
    `ID: ${data.registrationId}`,
    ``,
    `Nombre: ${data.fullName}`,
    `Cédula/Pasaporte: ${data.idNumber}`,
    `Teléfono: ${data.phone}`,
    `Contacto de emergencia: ${data.emergencyContact}`,
    `Grupo sanguíneo: ${data.bloodType}`,
    `Modalidad: ${modalityLabel}`,
    `Talla de jersey: ${data.jerseySize} (${cutLabel})`,
    ``,
    `Monto total: ${formatUsd(data.amountUsd)} (${formatBs(data.amountBs)} · tasa ${data.bcvRate})`,
    `Modalidad de pago: ${planLabel}`,
    `Monto pagado: ${formatUsd(data.paidAmountUsd)} (${formatBs(data.paidAmountBs)})`,
    ...(data.paymentPlan === "partial"
      ? [`Saldo pendiente: ${formatUsd(data.pendingAmountUsd)} (${formatBs(data.pendingAmountBs)})`]
      : []),
    `Método de pago: ${paymentLabel}`,
    `Referencia: ${data.paymentReference}`,
    ``,
    `Adjunto el capture/recibo del pago en este chat.`,
  ];

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${EVENT.organizerWhatsappDigits}?text=${text}`;
}

export function buildTeamRegistrationWhatsAppLink(data: TeamRegistrationData): string {
  const route = ROUTE_MODALITIES.find((m) => m.id === data.modality);
  const modalityLabel = route ? `${route.distanceKm} KM — Salida ${route.startPoint}` : data.modality;
  const paymentLabel = PAYMENT_METHOD_LABELS[data.paymentMethod];

  const lines = [
    `*Nueva inscripción de equipo — Reto Virgen de la Paz*`,
    `ID: ${data.registrationId}`,
    ``,
    `Equipo: ${data.teamName}`,
    `Capitán: ${data.captainFullName} (${data.captainPhone})`,
    `Modalidad: ${modalityLabel}`,
    `Integrantes: ${data.memberCount}${data.discountPercent > 0 ? ` (10% dto. aplicado)` : ""}`,
    ``,
    `Monto total: ${formatUsd(data.totalUsd)} (${formatBs(data.totalBs)} · tasa ${data.bcvRate})`,
    `Método de pago: ${paymentLabel}`,
    `Referencia: ${data.paymentReference}`,
    ``,
    `Roster:`,
    ...data.members.map(
      (m, i) => `${i + 1}. ${m.fullName} — ${m.idNumber} — ${JERSEY_CUTS.find((c) => c.id === m.jerseyCut)?.label ?? m.jerseyCut} ${m.jerseySize}`,
    ),
    ``,
    `Adjunto el capture/recibo del pago en este chat.`,
  ];

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${EVENT.organizerWhatsappDigits}?text=${text}`;
}
