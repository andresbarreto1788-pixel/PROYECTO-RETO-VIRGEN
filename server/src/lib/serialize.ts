import { TEAM_DISCOUNT_MIN_SIZE } from "./pricing.js";

export function serializePayment(row: Record<string, unknown>) {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    amountBs: Number(row.amount_bs),
    amountUsdEquiv: Number(row.amount_usd_equiv),
    bcvRate: Number(row.bcv_rate),
    reference: row.reference,
    bankOrigin: row.bank_origin,
    proofUrl: row.proof_url,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function serializeAthlete(row: Record<string, unknown>) {
  return {
    id: row.id,
    fullName: row.full_name,
    ci: row.ci,
    phone: row.phone,
    email: row.email ?? null,
    emergencyContact: row.emergency_contact,
    bloodType: row.blood_type,
    route: row.route,
    jerseyCut: row.jersey_cut ?? "caballero",
    jerseySize: row.jersey_size,
    paymentStatus: row.payment_status,
    totalAmountUsd: Number(row.total_amount_usd),
    bibNumber: row.bib_number,
    checkedIn: row.checked_in,
    checkedInAt: row.checked_in_at,
    qrToken: row.qr_token,
    createdAt: row.created_at,
    teamId: row.team_id ?? null,
    teamName: row.team_name ?? null,
    ...(row.paid_amount_usd !== undefined ? { paidAmountUsd: Number(row.paid_amount_usd) } : {}),
    ...(Array.isArray(row.payments) ? { payments: row.payments.map(serializePayment) } : {}),
  };
}

export function serializeTeam(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    route: row.route,
    memberCount: row.member_count,
    discountPercent: Number(row.discount_percent),
    captainFullName: row.captain_full_name,
    captainPhone: row.captain_phone,
    captainEmail: row.captain_email ?? null,
    subtotalAmountUsd: Number(row.subtotal_amount_usd),
    totalAmountUsd: Number(row.total_amount_usd),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

// Fila de teams + los agregados en vivo sobre athletes (ver ADMIN_TEAM_LIST_SELECT en
// adminTeams.ts). El conteo/estatus vienen de COUNT(*) sobre athletes, no de
// teams.member_count (que solo se actualiza en el registro inicial y puede quedar
// desactualizado si se agregan/quitan integrantes después).
export function serializeTeamSummary(row: Record<string, unknown>) {
  const liveMemberCount = Number(row.live_member_count ?? row.member_count ?? 0);
  const discountPercent = Number(row.discount_percent);
  return {
    ...serializeTeam(row),
    memberCount: liveMemberCount,
    storedMemberCount: Number(row.member_count),
    paidMembers: Number(row.paid_members ?? 0),
    partialMembers: Number(row.partial_members ?? 0),
    pendingMembers: Number(row.pending_members ?? 0),
    rejectedMembers: Number(row.rejected_members ?? 0),
    checkedInMembers: Number(row.checked_in_members ?? 0),
    membersTotalUsd: Number(row.members_total_usd ?? 0),
    paidAmountUsd: Number(row.paid_amount_usd ?? 0),
    proofUrl: row.proof_url ?? null,
    discountEligible: liveMemberCount >= TEAM_DISCOUNT_MIN_SIZE && discountPercent === 0,
  };
}

export function serializeConversation(row: Record<string, unknown>) {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    athleteFullName: row.athlete_full_name ?? null,
    athleteCi: row.athlete_ci ?? null,
    athleteRoute: row.athlete_route ?? null,
    athleteJerseyCut: row.athlete_jersey_cut ?? null,
    athleteJerseySize: row.athlete_jersey_size ?? null,
    athletePaymentStatus: row.athlete_payment_status ?? null,
    athleteBibNumber: row.athlete_bib_number ?? null,
    athleteEmail: row.athlete_email ?? null,
    channel: row.channel,
    contactIdentifier: row.contact_identifier,
    lastMessage: row.last_message,
    botActive: row.bot_active,
    unreadCount: row.unread_count,
    internalNotes: row.internal_notes ?? null,
    metaWaId: row.meta_wa_id ?? null,
    waProfileName: row.wa_profile_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeCrmMessage(row: Record<string, unknown>) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender,
    messageBody: row.message_body,
    attachmentUrl: row.attachment_url,
    emailSubject: row.email_subject ?? null,
    createdAt: row.created_at,
  };
}
