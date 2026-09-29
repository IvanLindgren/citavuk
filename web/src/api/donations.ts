import { request } from './client';

export interface DonationStart {
  id: string;
  confirmationUrl: string;
}

export type DonationStatus = 'pending' | 'succeeded' | 'canceled' | 'refunded';

export interface DonationState {
  status: DonationStatus;
  amountKopecks: number;
  publicName: string;
  showPublic: boolean;
  hasAccount: boolean;
  /** Вся оплаченная поддержка аккаунта; у гостя — этот платёж. */
  totalKopecks: number;
  unlocked: boolean;
  thresholdKopecks: number;
}

export interface Supporter {
  name: string;
  since: string;
}

export interface AdminDonation {
  id: string;
  publicName: string;
  showPublic: boolean;
  message: string;
  amountKopecks: number;
  status: DonationStatus;
  source: 'yookassa' | 'manual';
  providerPaymentId?: string;
  isTest: boolean;
  paidAt?: string;
  userEmail?: string;
}

export interface AdminDonationsMonth {
  month: string;
  donations: AdminDonation[];
  paidKopecks: number;
  refundKopecks: number;
  paymentEnabled: boolean;
}

export interface DonationAvailability {
  available: boolean;
  /** Тестовый магазин: видно только администратору. */
  testMode: boolean;
}

export function getDonationAvailability(): Promise<DonationAvailability> {
  return request<DonationAvailability>('/v1/donations/availability');
}

export function startDonation(input: {
  amountRubles: number;
  name: string;
  showPublic: boolean;
  message: string;
}): Promise<DonationStart> {
  return request<DonationStart>('/v1/donations', { method: 'POST', body: input, timeoutMs: 40_000 });
}

export function getDonation(id: string): Promise<DonationState> {
  return request<DonationState>(`/v1/donations/${encodeURIComponent(id)}`, { anonymous: true, timeoutMs: 40_000 });
}

export async function getSupporters(): Promise<Supporter[]> {
  const response = await request<{ supporters: Supporter[] }>('/v1/supporters', { anonymous: true });
  return response.supporters ?? [];
}

export function getAdminDonations(month: string): Promise<AdminDonationsMonth> {
  return request<AdminDonationsMonth>(`/v1/admin/donations?month=${encodeURIComponent(month)}`);
}

export function addManualDonation(input: {
  email: string;
  amountRubles: number;
  name: string;
  showPublic: boolean;
}): Promise<AdminDonation> {
  return request<AdminDonation>('/v1/admin/donations/manual', { method: 'POST', body: input });
}

export function formatRubles(kopecks: number): string {
  const rubles = kopecks / 100;
  return `${rubles.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}
