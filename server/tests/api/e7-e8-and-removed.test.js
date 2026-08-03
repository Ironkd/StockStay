import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase } from "../helpers/db.js";
import { createOwnerContext, createStockScenario, authHeader } from "../helpers/factories.js";
import { getAllPlans } from "../../planConfig.js";

let app;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("E7 / E8 reports and SaaS", () => {
  it("E8-5 GET /api/plans matches plan-limits.json", async () => {
    const res = await request(app).get("/api/plans");
    expect(res.status).toBe(200);
    const expected = getAllPlans();
    expect(res.body.plans.free.maxProperties).toBe(expected.plans.free.maxProperties);
    expect(res.body.plans.pro.name).toBe(expected.plans.pro.name);
  });

  it("E8-1..E8-4 billing endpoints return 503 when Stripe unset", async () => {
    const owner = await createOwnerContext({ plan: "free" });
    const checkout = await request(app)
      .post("/api/billing/create-checkout-session")
      .set(authHeader(owner.token))
      .send({ plan: "pro", interval: "month" });
    expect([400, 503]).toContain(checkout.status);

    const portal = await request(app)
      .post("/api/billing/customer-portal")
      .set(authHeader(owner.token))
      .send({});
    expect([400, 503]).toContain(portal.status);
  });

  it("E7-3 low-stock / shopping signal available (Pro shopping-list UI uses location-low-stock)", async () => {
    const scenario = await createStockScenario();
    const res = await request(app)
      .get("/api/location-low-stock")
      .set(authHeader(scenario.token));
    expect(res.status).toBe(200);
  });

  it("E7-2 stock transactions report exists", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 2 });
    const res = await request(app)
      .get("/api/stock-transactions")
      .set(authHeader(scenario.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it.todo("E7-1 dashboard aggregates endpoint (if/when dedicated)");
  it.todo("E7-4 inventory value report shape");
  it.todo("E7-5 CSV export of reports");
  it.todo("E7-6 usage summary by property");
});

describe("Removed legacy paths R-1 / R-2", () => {
  it("R-1/R-2 legacy inventory bill-to and sales create are gone", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const sale = await request(app)
      .post("/api/sales")
      .set(authHeader(owner.token))
      .send({});
    expect([404, 410]).toContain(sale.status);

    const bill = await request(app)
      .post("/api/inventory/bill-to-client")
      .set(authHeader(owner.token))
      .send({});
    expect([404, 410]).toContain(bill.status);
  });
});
