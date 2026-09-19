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
    jerseySize: row.jersey_size,
    paymentStatus: row.payment_status,
    totalAmountUsd: Number(row.total_amount_usd),
    bibNumber: row.bib_number,
    checkedIn: row.checked_in,
    checkedInAt: row.checked_in_at,
    qrToken: row.qr_token,
    createdAt: row.created_at,
    ...(row.paid_amount_usd !== undefined ? { paidAmountUsd: Number(row.paid_amount_usd) } : {}),
    ...(Array.isArray(row.payments) ? { payments: row.payments.map(serializePayment) } : {}),
  };
}

export function serializeConversation(row: Record<string, unknown>) {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    athleteFullName: row.athlete_full_name ?? null,
    athleteCi: row.athlete_ci ?? null,
    athleteRoute: row.athlete_route ?? null,
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
