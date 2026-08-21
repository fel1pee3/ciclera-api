export const subscriptionPlanCodes = [
  'ESSENTIAL',
  'PROFESSIONAL',
  'OPERATION',
] as const;

export type SubscriptionPlanCode = (typeof subscriptionPlanCodes)[number];

export interface SubscriptionPlan {
  code: SubscriptionPlanCode;
  name: string;
  priceInCents: number;
  maxTechnicians: number;
  maxAdministrativeUsers: number;
  evidenceStorageBytes: number;
  recommended?: boolean;
}

const gibibyte = 1024 * 1024 * 1024;

export const subscriptionPlans: readonly SubscriptionPlan[] = [
  {
    code: 'ESSENTIAL',
    name: 'Essencial',
    priceInCents: 19_900,
    maxTechnicians: 5,
    maxAdministrativeUsers: 3,
    evidenceStorageBytes: 5 * gibibyte,
  },
  {
    code: 'PROFESSIONAL',
    name: 'Profissional',
    priceInCents: 39_900,
    maxTechnicians: 15,
    maxAdministrativeUsers: 7,
    evidenceStorageBytes: 20 * gibibyte,
    recommended: true,
  },
  {
    code: 'OPERATION',
    name: 'Operação',
    priceInCents: 69_900,
    maxTechnicians: 30,
    maxAdministrativeUsers: 15,
    evidenceStorageBytes: 50 * gibibyte,
  },
] as const;

export function getSubscriptionPlan(code: SubscriptionPlanCode) {
  const plan = subscriptionPlans.find((candidate) => candidate.code === code);
  if (!plan) throw new Error('Unknown subscription plan.');
  return plan;
}
