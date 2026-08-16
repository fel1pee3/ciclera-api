import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { REVIEW_REPOSITORY } from './application/ports/review.repository';
import { ReviewsService } from './application/reviews.service';
import { ReviewsController } from './http/reviews.controller';
import { PrismaReviewRepository } from './infrastructure/prisma-review.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    { provide: REVIEW_REPOSITORY, useClass: PrismaReviewRepository },
  ],
  exports: [ReviewsService],
})
export class ReviewsModule {}
