import type { WorkOrder, WorkOrderDetails } from '../domain/work-order';
import { formatWorkOrderNumber } from '../domain/work-order';
import { formatQuantity } from '../../additional-items/domain/additional-item';
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
    assignments: workOrder.assignments,
    additionalItems: workOrder.additionalItems.map((item) => ({
      id: item.id,
      type: item.type,
      description: item.description,
      quantity: formatQuantity(item.quantityInThousand),
      unitAmountInCents: item.unitAmountInCents.toString(),
      totalAmountInCents: item.totalAmountInCents.toString(),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    additionalTotalInCents: workOrder.additionalTotalInCents.toString(),
  };
}
