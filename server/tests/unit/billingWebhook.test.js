import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { createOwnerContext } from "../helpers/factories.js";

async function loadBillingModuleForEvent(event) {
  vi.resetModules();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

  const constructEvent = vi.fn(() => event);

  vi.doMock("stripe", () => ({
    default: class StripeMock {
      constructor() {
        return {
          webhooks: { constructEvent },
          checkout: { sessions: { create: vi.fn() } },
          customers: { create: vi.fn() },
          subscriptions: { retrieve: vi.fn(), update: vi.fn() },
          billingPortal: { sessions: { create: vi.fn() } },
        };
      }
    },
  }));

  const billing = await import("../../billing.js");
  return { ...billing, constructEvent };
}

function makeSubscriptionEvent({
  id,
  organizationId,
  customer = "cus_test_123",
  subscriptionId = "sub_test_123",
  status = "active",
  plan = "pro",
  interval = "month",
} = {}) {
  return {
    id: id || "evt_test_123",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: subscriptionId,
        customer,
        status,
        metadata: {
          organizationId,
          plan,
        },
        items: {
          data: [
            {
              price: {
                id: "price_plan_test",
                recurring: { interval },
              },
            },
          ],
        },
      },
    },
  };
}

describe("billing webhook hardening", () => {
  beforeEach(async () => {
    await resetDatabase();
    await prisma.processedWebhookEvent.deleteMany();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.doUnmock("stripe");
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("treats duplicate Stripe event ids as a no-op", async () => {
    const owner = await createOwnerContext({ plan: "free" });
    const event = makeSubscriptionEvent({
      id: "evt_duplicate_123",
      organizationId: owner.organization.id,
      customer: "cus_duplicate_123",
      subscriptionId: "sub_duplicate_123",
    });
    const { handleWebhook } = await loadBillingModuleForEvent(event);

    await handleWebhook(Buffer.from("payload"), "sig_test");
    let org = await prisma.organization.findUnique({ where: { id: owner.organization.id } });
    expect(org.plan).toBe("pro");
    expect(org.stripeCustomerId).toBe("cus_duplicate_123");
    expect(org.stripeSubscriptionId).toBe("sub_duplicate_123");

    await prisma.organization.update({
      where: { id: owner.organization.id },
      data: {
        plan: "free",
        stripeSubscriptionStatus: "manually-reset",
      },
    });

    const duplicate = await handleWebhook(Buffer.from("payload"), "sig_test");
    org = await prisma.organization.findUnique({ where: { id: owner.organization.id } });

    expect(duplicate).toEqual({ received: true, duplicate: true });
    expect(org.plan).toBe("free");
    expect(org.stripeSubscriptionStatus).toBe("manually-reset");
    expect(
      await prisma.processedWebhookEvent.count({
        where: { stripeEventId: "evt_duplicate_123" },
      })
    ).toBe(1);
  });

  it("ignores mismatched Stripe customer/subscription ids even when metadata names the organization", async () => {
    const owner = await createOwnerContext({ plan: "free" });
    await prisma.organization.update({
      where: { id: owner.organization.id },
      data: {
        stripeCustomerId: "cus_expected_123",
        stripeSubscriptionId: "sub_expected_123",
        stripeSubscriptionStatus: "active",
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = makeSubscriptionEvent({
      id: "evt_mismatch_123",
      organizationId: owner.organization.id,
      customer: "cus_other_123",
      subscriptionId: "sub_other_123",
      plan: "starter",
    });
    const { handleWebhook } = await loadBillingModuleForEvent(event);

    const result = await handleWebhook(Buffer.from("payload"), "sig_test");
    const org = await prisma.organization.findUnique({ where: { id: owner.organization.id } });

    expect(result).toEqual({ received: true });
    expect(org.plan).toBe("free");
    expect(org.stripeCustomerId).toBe("cus_expected_123");
    expect(org.stripeSubscriptionId).toBe("sub_expected_123");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Stripe identity mismatch")
    );
    expect(
      await prisma.processedWebhookEvent.count({
        where: { stripeEventId: "evt_mismatch_123" },
      })
    ).toBe(1);
  });
});
