import {
  InvalidWorkOrderTransitionError,
  transitionWorkOrderStatus,
  type WorkOrderAction,
} from './work-order-state-machine';
import { formatWorkOrderNumber } from './work-order';

describe('work order state machine', () => {
  it.each<[string, WorkOrderAction, string]>([
    ['DRAFT', 'SCHEDULE', 'SCHEDULED'],
    ['DRAFT', 'CANCEL', 'CANCELED'],
    ['SCHEDULED', 'RESCHEDULE', 'SCHEDULED'],
    ['SCHEDULED', 'START', 'IN_PROGRESS'],
    ['SCHEDULED', 'CANCEL', 'CANCELED'],
    ['IN_PROGRESS', 'SUBMIT_FOR_REVIEW', 'AWAITING_REVIEW'],
    ['AWAITING_REVIEW', 'REQUEST_CORRECTION', 'PENDING_CORRECTION'],
    ['PENDING_CORRECTION', 'RESUME_CORRECTION', 'IN_PROGRESS'],
    ['AWAITING_REVIEW', 'APPROVE', 'READY_TO_BILL'],
    ['READY_TO_BILL', 'MARK_BILLED', 'BILLED'],
  ])('moves from %s through %s to %s', (current, action, expected) => {
    expect(
      transitionWorkOrderStatus(
        current as Parameters<typeof transitionWorkOrderStatus>[0],
        action,
      ),
    ).toBe(expected);
  });

  it.each([
    ['DRAFT', 'START'],
    ['IN_PROGRESS', 'CANCEL'],
    ['BILLED', 'SCHEDULE'],
    ['CANCELED', 'SCHEDULE'],
  ] as const)('rejects %s through %s', (current, action) => {
    expect(() => transitionWorkOrderStatus(current, action)).toThrow(
      InvalidWorkOrderTransitionError,
    );
  });

  it('formats a readable number without losing larger values', () => {
    expect(formatWorkOrderNumber(42n)).toBe('OS-000042');
    expect(formatWorkOrderNumber(1_000_000n)).toBe('OS-1000000');
  });
});
