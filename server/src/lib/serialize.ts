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
