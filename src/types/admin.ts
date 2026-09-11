import type { BloodType, JerseySize } from "./race";

export type AthleteRoute = "33K_REDOMA" | "22K_ILUSTRES";

export type PaymentStatus = "PENDING_REVIEW" | "PARTIAL" | "PAID" | "REJECTED";

export type PaymentApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Payment {
  id: string;
  athleteId: string;
  amountBs: number;
  amountUsdEquiv: number;
  bcvRate: number;
  reference: string;
  bankOrigin: string | null;
  proofUrl: string | null;
  status: PaymentApprovalStatus;
  createdAt: string;
}

export interface Athlete {
  id: string;
  fullName: string;
  ci: string;
  phone: string;
  emergencyContact: string;
  bloodType: BloodType;
  route: AthleteRoute;
  jerseySize: JerseySize;
  paymentStatus: PaymentStatus;
  totalAmountUsd: number;
  bibNumber: number | null;
  checkedIn: boolean;
  checkedInAt: string | null;
  qrToken: string;
  createdAt: string;
  paidAmountUsd?: number;
  payments?: Payment[];
}

export interface AthleteListResponse {
  items: Athlete[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminMetrics {
  totalAthletes: number;
  total33k: number;
  total22k: number;
  checkedIn: number;
  totalRevenueUsd: number;
  totalRevenueBs: number;
}

export type CheckInResult =
  | { status: "checked_in" | "already_checked_in"; fullName: string; route: AthleteRoute; jerseySize: JerseySize; bibNumber: number }
  | { status: "blocked"; paymentStatus: PaymentStatus; fullName: string; owedUsd: number };

export interface CheckInPreview {
  fullName: string;
  route: AthleteRoute;
  jerseySize: JerseySize;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  bibNumber: number | null;
  owedUsd: number;
}
