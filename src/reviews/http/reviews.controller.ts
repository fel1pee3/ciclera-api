import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { formatQuantity } from '../../additional-items/domain/additional-item';
import { formatWorkOrderNumber } from '../../work-orders/domain/work-order';
import { ReviewsService } from '../application/reviews.service';
import type { ReviewQueueItem } from '../application/ports/review.repository';
import {
  ReviewDetailsResponseDto,
  ReviewQueueQueryDto,
  ReviewQueueResponseDto,
} from './review.dto';

@ApiTags('reviews')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('queue')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ReviewQueueResponseDto })
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ReviewQueueQueryDto,
  ) {
    const result = await this.reviews.list(principal, query);
    return { ...result, items: result.items.map(serializeQueueItem) };
  }

  @Get('work-orders/:workOrderId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ReviewDetailsResponseDto })
  async find(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
  ) {
    const result = await this.reviews.find(principal, workOrderId);
    return {
      ...serializeQueueItem(result),
      description: result.description,
      serviceType: result.serviceType,
      location: result.location,
      equipment: result.equipment,
      execution: {
        ...result.execution,
        evidence: result.execution.evidence.map((item) => ({
          ...item,
          sizeBytes: item.sizeBytes.toString(),
        })),
        additionalItems: result.execution.additionalItems.map((item) => ({
          ...item,
          quantity: formatQuantity(item.quantityInThousand),
          quantityInThousand: undefined,
          unitAmountInCents: item.unitAmountInCents.toString(),
          totalAmountInCents: item.totalAmountInCents.toString(),
        })),
      },
    };
  }
}

function serializeQueueItem(item: ReviewQueueItem) {
  return {
    id: item.id,
    number: formatWorkOrderNumber(item.number),
    title: item.title,
    priority: item.priority,
    customer: item.customer,
    expectedAmountInCents: item.expectedAmountInCents?.toString() ?? null,
    additionalTotalInCents: item.additionalTotalInCents.toString(),
    waitingSince: item.waitingSince,
    agingSeconds: item.agingSeconds,
    version: item.version,
  };
}
