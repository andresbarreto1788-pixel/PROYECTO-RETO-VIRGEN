import { EVENT, ROUTE_MODALITIES } from "../data/raceData";
import { formatBs, formatUsd } from "./format";
import type { RegistrationData } from "../types/race";

export function buildRegistrationWhatsAppLink(data: RegistrationData): string {
  const route = ROUTE_MODALITIES.find((m) => m.id === data.modality);
  const modalityLabel = route ? `${route.distanceKm} KM — Salida ${route.startPoint}` : data.modality;
  const paymentLabel = data.paymentMethod === "pago-movil" ? "Pago Móvil" : "Transferencia";

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
    `Talla de jersey: ${data.jerseySize}`,
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
  return `https://wa.me/${EVENT.whatsappDigits}?text=${text}`;
}
