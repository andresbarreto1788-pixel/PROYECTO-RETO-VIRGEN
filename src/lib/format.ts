export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatBs(amount: number): string {
  return `${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(amount)} Bs`;
}

export function generateRegistrationId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RVP-${timestamp}-${random}`;
}
