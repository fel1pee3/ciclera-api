export const PASSWORD_RESET_DELIVERY_OBSERVER = Symbol(
  'PASSWORD_RESET_DELIVERY_OBSERVER',
);

export type PasswordResetDeliveryFailureStage =
  'processing' | 'delivery' | 'token-invalidation';

export interface PasswordResetDeliveryObserver {
  recordFailure(stage: PasswordResetDeliveryFailureStage): void;
}
