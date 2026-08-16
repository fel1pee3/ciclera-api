import type { WorkOrder, WorkOrderDetails } from '../domain/work-order';
import { formatWorkOrderNumber } from '../domain/work-order';
import type {
  WorkOrderDetailsResponseDto,
  WorkOrderResponseDto,
} from './work-order.dto';

export function toWorkOrderResponse(
  workOrder: WorkOrder,
): WorkOrderResponseDto {
  return {
    ...workOrder,
    number: formatWorkOrderNumber(workOrder.number),
    expectedAmountInCents: workOrder.expectedAmountInCents?.toString() ?? null,
    finalAmountInCents: workOrder.finalAmountInCents?.toString() ?? null,
  };
}

export function toWorkOrderDetailsResponse(
  workOrder: WorkOrderDetails,
): WorkOrderDetailsResponseDto {
  return {
    ...toWorkOrderResponse(workOrder),
    history: workOrder.history,
  };
}
