export type RouteModalityId = "reto-33k" | "reto-22k";

export interface RouteModality {
  id: RouteModalityId;
  label: string;
  distanceKm: number;
  startPoint: string;
  finishPoint: string;
  description: string;
  priceUsd: number;
}

export type JerseyCut = "caballero" | "dama";

export type JerseySize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

export type BloodType = "O+" | "O-" | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-";

export interface ElevationPoint {
  km: number;
  meters: number;
  label?: string;
}

export interface RacePhase {
  id: string;
  index: number;
  title: string;
  kicker: string;
  description: string;
  image: string;
}

export interface KitItem {
  id: string;
  title: string;
  description: string;
  image?: string;
}

export interface Sponsor {
  name: string;
}

export type PaymentMethod = "pago-movil" | "transferencia";

export type PaymentPlan = "full" | "partial";

export interface RegistrationData {
  fullName: string;
  idNumber: string;
  phone: string;
  email: string;
  emergencyContact: string;
  bloodType: BloodType;
  modality: RouteModalityId;
  jerseyCut: JerseyCut;
  jerseySize: JerseySize;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentPlan: PaymentPlan;
  amountUsd: number;
  amountBs: number;
  paidAmountUsd: number;
  paidAmountBs: number;
  pendingAmountUsd: number;
  pendingAmountBs: number;
  bcvRate: number;
  registrationId: string;
  athleteId: string;
  qrCodeToken: string;
  createdAt: string;
}

export interface BcvRateState {
  rate: number;
  source: "api" | "fallback";
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
}

export interface TeamMemberInput {
  fullName: string;
  idNumber: string;
  phone: string;
  email: string;
  emergencyContact: string;
  bloodType: BloodType;
  jerseyCut: JerseyCut;
  jerseySize: JerseySize;
}

export interface TeamMemberResult extends TeamMemberInput {
  athleteId: string;
  qrCodeToken: string;
  amountUsd: number;
  amountBs: number;
}

export interface TeamRegistrationData {
  registrationId: string;
  teamName: string;
  teamId: string;
  modality: RouteModalityId;
  captainFullName: string;
  captainPhone: string;
  captainEmail: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  memberCount: number;
  discountPercent: number;
  subtotalUsd: number;
  totalUsd: number;
  totalBs: number;
  bcvRate: number;
  members: TeamMemberResult[];
  createdAt: string;
}
