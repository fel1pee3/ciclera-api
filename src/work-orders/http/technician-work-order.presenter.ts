import { formatQuantity } from '../../additional-items/domain/additional-item';
import type { TechnicianWorkOrdersService } from '../application/technician-work-orders.service';
import { formatWorkOrderNumber } from '../domain/work-order';
import type { TechnicianWorkOrderResponseDto } from './technician-work-order.dto';

type TechnicianWorkOrderResult = Awaited<
  ReturnType<TechnicianWorkOrdersService['find']>
>;

export function toTechnicianWorkOrderResponse(
  workOrder: TechnicianWorkOrderResult,
): TechnicianWorkOrderResponseDto {
  return {
    ...workOrder,
    number: formatWorkOrderNumber(workOrder.number),
    execution: workOrder.execution
      ? {
          ...workOrder.execution,
          evidence: workOrder.execution.evidence.map((item) => ({
            ...item,
            sizeBytes: item.sizeBytes.toString(),
          })),
          additionalItems: workOrder.execution.additionalItems.map((item) => ({
            ...item,
            quantity: formatQuantity(item.quantityInThousand),
            quantityInThousand: undefined,
            unitAmountInCents: item.unitAmountInCents.toString(),
            totalAmountInCents: item.totalAmountInCents.toString(),
          })),
          additionalTotalInCents:
            workOrder.execution.additionalTotalInCents.toString(),
        }
      : null,
  };
}
