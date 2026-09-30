import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase } from "../helpers/db.js";
import { createStockScenario, createSupplyItem, authHeader } from "../helpers/factories.js";

let app;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("Property supply items", () => {
  it("starts empty for a new property", async () => {
    const scenario = await createStockScenario();
    const res = await request(app)
      .get(`/api/properties/${scenario.property.id}/supply-items`)
      .set(authHeader(scenario.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("adds a supply item to a property's stocked list with a par quantity", async () => {
    const scenario = await createStockScenario();
    const res = await request(app)
      .put(`/api/properties/${scenario.property.id}/supply-items/${scenario.supplyItem.id}`)
      .set(authHeader(scenario.token))
      .send({ parQuantity: 25 });
    expect(res.status).toBe(200);
    expect(Number(res.body.parQuantity)).toBe(25);
    expect(res.body.supplyItem.id).toBe(scenario.supplyItem.id);

    const list = await request(app)
      .get(`/api/properties/${scenario.property.id}/supply-items`)
      .set(authHeader(scenario.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].parQuantity)).toBe(25);
    expect(Number(list.body[0].allocatedSinceInvoice)).toBe(0);
  });

  it("updates par quantity on re-upsert without creating a duplicate row", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .put(`/api/properties/${scenario.property.id}/supply-items/${scenario.supplyItem.id}`)
      .set(authHeader(scenario.token))
      .send({ parQuantity: 10 });
    const res = await request(app)
      .put(`/api/properties/${scenario.property.id}/supply-items/${scenario.supplyItem.id}`)
      .set(authHeader(scenario.token))
      .send({ parQuantity: 40 });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get(`/api/properties/${scenario.property.id}/supply-items`)
      .set(authHeader(scenario.token));
    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].parQuantity)).toBe(40);
  });

  it("reflects unbilled replenishment activity as allocatedSinceInvoice", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .put(`/api/properties/${scenario.property.id}/supply-items/${scenario.supplyItem.id}`)
      .set(authHeader(scenario.token))
      .send({ parQuantity: 5 });

    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 10 });

    await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 30 }],
      });

    const list = await request(app)
      .get(`/api/properties/${scenario.property.id}/supply-items`)
      .set(authHeader(scenario.token));
    expect(list.status).toBe(200);
    expect(Number(list.body[0].allocatedSinceInvoice)).toBe(30);
  });

  it("rejects a supply item from another team", async () => {
    const scenario = await createStockScenario();
    const other = await createStockScenario();
    const res = await request(app)
      .put(`/api/properties/${scenario.property.id}/supply-items/${other.supplyItem.id}`)
      .set(authHeader(scenario.token))
      .send({ parQuantity: 5 });
    expect(res.status).toBe(400);
  });

  it("removes a stocked item without affecting replenishment history", async () => {
    const scenario = await createStockScenario();
    const extra = await createSupplyItem(scenario.team.id, { name: "Coffee pods" });
    await request(app)
      .put(`/api/properties/${scenario.property.id}/supply-items/${extra.id}`)
      .set(authHeader(scenario.token))
      .send({ parQuantity: 8 });

    const del = await request(app)
      .delete(`/api/properties/${scenario.property.id}/supply-items/${extra.id}`)
      .set(authHeader(scenario.token));
    expect(del.status).toBe(200);

    const list = await request(app)
      .get(`/api/properties/${scenario.property.id}/supply-items`)
      .set(authHeader(scenario.token));
    expect(list.body).toHaveLength(0);
  });

  it("returns 404 for a property outside the caller's team", async () => {
    const scenario = await createStockScenario();
    const other = await createStockScenario();
    const res = await request(app)
      .get(`/api/properties/${other.property.id}/supply-items`)
      .set(authHeader(scenario.token));
    expect(res.status).toBe(404);
  });
});
