// Constantes de precio de inscripción grupal, compartidas entre el registro público
// (routes/register.ts) y la administración de equipos (routes/adminTeams.ts) para que no
// existan dos copias que puedan desincronizarse. Debe mantenerse igual a
// ROUTE_MODALITIES[].priceUsd en src/data/raceData.ts (ambas modalidades cuestan lo mismo).
export const TEAM_PRICE_PER_MEMBER_USD = 30;

export const TEAM_MIN_SIZE = 2;
export const TEAM_MAX_SIZE = 80;

// A partir de este número de integrantes el equipo recibe el descuento grupal. Por debajo
// del mínimo el equipo se puede inscribir igual, solo que sin descuento.
export const TEAM_DISCOUNT_MIN_SIZE = 10;
export const TEAM_DISCOUNT_PERCENT = 10;

export function discountPercentForSize(memberCount: number): number {
  return memberCount >= TEAM_DISCOUNT_MIN_SIZE ? TEAM_DISCOUNT_PERCENT : 0;
}

export function perMemberUsd(discountPercent: number): number {
  return Math.round(TEAM_PRICE_PER_MEMBER_USD * (1 - discountPercent / 100) * 100) / 100;
}
