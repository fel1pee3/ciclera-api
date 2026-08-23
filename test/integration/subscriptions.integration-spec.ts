import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../src/subscriptions/application/ports/subscription.repository';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Organization subscriptions', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let subscriptions: SubscriptionRepository;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    subscriptions = moduleRef.get(SUBSCRIPTION_REPOSITORY);
    await assertTestDatabase(prisma);
  }, 20_000);

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.subscriptionWebhookEvent.deleteMany({
        where: { organizationId },
      });
      await prisma.subscriptionPayment.deleteMany({
        where: { organizationId },
      });
      await prisma.subscriptionCheckout.deleteMany({
        where: { organizationId },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.organizationSubscription.deleteMany({
        where: { organizationId },
      });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('activates only the referenced tenant, validates price and processes retries idempotently', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const first = await createOrganization(prisma, `Subscription A ${suffix}`);
    const second = await createOrganization(prisma, `Subscription B ${suffix}`);
    organizationIds.push(first.organizationId, second.organizationId);

    const firstCheckout = await subscriptions.createCheckout({
      organizationId: first.organizationId,
      planCode: 'ESSENTIAL',
      paymentMethod: 'PIX',
      expiresAt: new Date(Date.now() + 60_000),
      actorUserId: first.ownerId,
      requestId: 'subscription-checkout-a',
    });
    const secondCheckout = await subscriptions.createCheckout({
      organizationId: second.organizationId,
      planCode: 'PROFESSIONAL',
      paymentMethod: 'BOLETO',
      expiresAt: new Date(Date.now() + 60_000),
      actorUserId: second.ownerId,
      requestId: 'subscription-checkout-b',
    });

    const confirmedEvent = paymentEvent({
      id: 'evt_subscription_confirmed_a',
      checkoutId: firstCheckout.id,
      paymentId: 'pay_subscription_a',
      providerSubscriptionId: 'sub_subscription_a',
      value: 199,
      status: 'CONFIRMED',
    });
    await expect(subscriptions.processWebhook(confirmedEvent)).resolves.toBe(
      'PROCESSED',
    );
    await expect(subscriptions.processWebhook(confirmedEvent)).resolves.toBe(
      'DUPLICATE',
    );
    const firstPeriod = await prisma.organizationSubscription.findUniqueOrThrow(
      {
        where: { organizationId: first.organizationId },
        select: { currentPeriodStart: true, currentPeriodEnd: true },
      },
    );
    await expect(
      subscriptions.processWebhook({
        ...confirmedEvent,
        id: 'evt_subscription_received_a',
        event: 'PAYMENT_RECEIVED',
        payment: {
          ...confirmedEvent.payment,
          status: 'RECEIVED',
          paymentDate: '2026-08-22',
        },
      }),
    ).resolves.toBe('PROCESSED');
    await expect(
      subscriptions.processWebhook({
        ...confirmedEvent,
        id: 'evt_subscription_late_overdue_a',
        event: 'PAYMENT_OVERDUE',
        payment: { ...confirmedEvent.payment, status: 'OVERDUE' },
      }),
    ).resolves.toBe('PROCESSED');

    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: first.organizationId },
      }),
    ).resolves.toMatchObject({
      planCode: 'ESSENTIAL',
      status: 'ACTIVE',
      providerSubscriptionId: 'sub_subscription_a',
      currentPeriodStart: firstPeriod.currentPeriodStart,
      currentPeriodEnd: firstPeriod.currentPeriodEnd,
    });
    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: second.organizationId },
      }),
    ).resolves.toMatchObject({ planCode: null, status: 'PENDING' });
    await expect(
      prisma.subscriptionPayment.count({
        where: { providerPaymentId: 'pay_subscription_a' },
      }),
    ).resolves.toBe(1);

    await expect(
      subscriptions.processWebhook(
        paymentEvent({
          id: 'evt_subscription_wrong_amount_b',
          checkoutId: secondCheckout.id,
          paymentId: 'pay_subscription_b',
          providerSubscriptionId: 'sub_subscription_b',
          value: 1,
          status: 'RECEIVED',
        }),
      ),
    ).resolves.toBe('PROCESSED');
    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: second.organizationId },
      }),
    ).resolves.toMatchObject({ planCode: null, status: 'PENDING' });
  });

  it('ignores unknown and malformed external references without crossing tenants', async () => {
    await expect(
      subscriptions.processWebhook(
        paymentEvent({
          id: 'evt_subscription_unknown_reference',
          checkoutId: 'not-a-uuid',
          paymentId: 'pay_unknown',
          providerSubscriptionId: 'sub_unknown',
          value: 199,
          status: 'CONFIRMED',
        }),
      ),
    ).resolves.toBe('IGNORED');
  });

  it('processes later monthly Pix charges by the stable subscription reference', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const organization = await createOrganization(
      prisma,
      `Monthly Pix ${suffix}`,
    );
    organizationIds.push(organization.organizationId);

    const checkout = await subscriptions.createCheckout({
      organizationId: organization.organizationId,
      planCode: 'ESSENTIAL',
      paymentMethod: 'PIX',
      expiresAt: new Date(Date.now() + 60_000),
      actorUserId: organization.ownerId,
      requestId: 'subscription-monthly-pix',
    });

    await expect(
      subscriptions.processWebhook(
        paymentEvent({
          id: 'evt_subscription_monthly_pix',
          checkoutId: checkout.subscriptionId,
          paymentId: 'pay_subscription_monthly_pix',
          providerSubscriptionId: 'sub_subscription_monthly_pix',
          value: 199,
          status: 'RECEIVED',
        }),
      ),
    ).resolves.toBe('PROCESSED');

    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: organization.organizationId },
      }),
    ).resolves.toMatchObject({
      planCode: 'ESSENTIAL',
      paymentMethod: 'PIX',
      providerSubscriptionId: 'sub_subscription_monthly_pix',
      status: 'ACTIVE',
    });
  });
});

function paymentEvent(input: {
  id: string;
  checkoutId: string;
  paymentId: string;
  providerSubscriptionId: string;
  value: number;
  status: 'CONFIRMED' | 'RECEIVED';
}) {
  return {
    id: input.id,
    event: `PAYMENT_${input.status}`,
    payment: {
      id: input.paymentId,
      subscription: input.providerSubscriptionId,
      status: input.status,
      value: input.value,
      dueDate: '2026-08-21',
      paymentDate: '2026-08-21',
      billingType: 'PIX',
      externalReference: input.checkoutId,
      invoiceUrl: `https://www.asaas.com/i/${input.paymentId}`,
    },
  };
}

async function createOrganization(prisma: PrismaService, name: string) {
  const organization = await prisma.organization.create({ data: { name } });
  const email = `${organization.id}@example.test`;
  const owner = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: 'Proprietário de teste',
      email,
      normalizedEmail: email,
      passwordHash: 'integration-only-hash',
      role: 'OWNER',
    },
  });
  return { organizationId: organization.id, ownerId: owner.id };
}

async function assertTestDatabase(prisma: PrismaService): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(
    new URL(testDatabaseUrl).pathname.slice(1),
  );
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected) {
    throw new Error('Subscription test connected to an unexpected database.');
  }
}
