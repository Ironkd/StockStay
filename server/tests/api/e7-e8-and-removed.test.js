import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase } from "../helpers/db.js";
import {
  createOwnerContext,
  createStockScenario,
  createSupplyItem,
  createSku,
  ensureSkuAtLocation,
  authHeader,
} from "../helpers/factories.js";
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

  it("E7-2 stock transactions include rows on the selected end date", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        quantity: 2,
        purchasedAt: "2026-03-15T15:30:00.000Z",
      });

    const res = await request(app)
      .get("/api/stock-transactions")
      .set(authHeader(scenario.token))
      .query({ toDate: "2026-03-15" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].effectiveAt).toContain("2026-03-15");
  });

  it("E7-2 stock transactions reject invalid date filters", async () => {
    const scenario = await createStockScenario();
    const res = await request(app)
      .get("/api/stock-transactions")
      .set(authHeader(scenario.token))
      .query({ fromDate: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LEDGER_VALIDATION");
    expect(res.body.message).toMatch(/fromDate/i);
  });

  it("E7-2 stock transactions limit orders by business date (effectiveAt), not creation order", async () => {
    const scenario = await createStockScenario();
    // Insert transactions in creation order newest->oldest business date is reversed:
    // the first one created has the OLDEST business date, the last one created has the
    // NEWEST. A limit applied by createdAt alone would keep the wrong rows once truncated.
    const businessDates = [
      "2026-01-01T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    ];
    for (const purchasedAt of businessDates) {
      const res = await request(app)
        .post(`/api/skus/${scenario.sku.id}/receive`)
        .set(authHeader(scenario.token))
        .send({ stockLocationId: scenario.stockLocation.id, quantity: 1, purchasedAt });
      expect(res.status).toBe(201);
    }

    const limited = await request(app)
      .get("/api/stock-transactions")
      .set(authHeader(scenario.token))
      .query({ limit: 2 });

    expect(limited.status).toBe(200);
    expect(limited.body).toHaveLength(2);
    // The two most recent business dates must be the ones returned, in descending order,
    // even though they were not the first two rows created.
    expect(limited.body[0].effectiveAt).toContain("2026-09-01");
    expect(limited.body[1].effectiveAt).toContain("2026-06-01");
  });

  it("E7-3 aggregate supply-threshold report returns multiple locations in one response", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const secondLocation = await request(app)
      .post("/api/stock-locations")
      .set(authHeader(owner.token))
      .send({ name: "Overflow Closet" });
    expect(secondLocation.status).toBe(201);

    const supplyItem = await createSupplyItem(owner.team.id, {
      name: "Laundry Pods",
      defaultReorderPoint: 4,
    });
    const sku = await createSku(owner.team.id, supplyItem.id, {
      name: "Laundry Pods 4pk",
      packSize: 4,
      purchasePrice: 12,
    });

    await ensureSkuAtLocation(sku.id, owner.stockLocation.id);
    await ensureSkuAtLocation(sku.id, secondLocation.body.id);

    await request(app)
      .post(`/api/skus/${sku.id}/receive`)
      .set(authHeader(owner.token))
      .send({ stockLocationId: owner.stockLocation.id, quantity: 2 });
    await request(app)
      .post(`/api/skus/${sku.id}/receive`)
      .set(authHeader(owner.token))
      .send({ stockLocationId: secondLocation.body.id, quantity: 3 });

    await request(app)
      .put(`/api/stock-locations/${owner.stockLocation.id}/supply-thresholds`)
      .set(authHeader(owner.token))
      .send({ supplyItemId: supplyItem.id, reorderPoint: 10, reorderQuantity: 12 });
    await request(app)
      .put(`/api/stock-locations/${secondLocation.body.id}/supply-thresholds`)
      .set(authHeader(owner.token))
      .send({ supplyItemId: supplyItem.id, reorderPoint: 15, reorderQuantity: 20 });

    const res = await request(app)
      .get("/api/stock-location-supply-thresholds")
      .set(authHeader(owner.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const rowsByLocation = new Map(res.body.map((row) => [row.stockLocationId, row]));
    expect(rowsByLocation.get(owner.stockLocation.id)).toMatchObject({
      stockLocationId: owner.stockLocation.id,
      onHandBase: "8.000000",
      reorderPoint: "10.000000",
    });
    expect(rowsByLocation.get(secondLocation.body.id)).toMatchObject({
      stockLocationId: secondLocation.body.id,
      onHandBase: "12.000000",
      reorderPoint: "15.000000",
    });
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
