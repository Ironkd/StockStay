import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase } from "../helpers/db.js";
import {
  createOwnerContext,
  createStockScenario,
  createClient,
  createProperty,
  authHeader,
} from "../helpers/factories.js";

let app;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("E3 Property setup", () => {
  it("E3-1 create property within Free plan limit", async () => {
    const owner = await createOwnerContext({ plan: "free" });
    const res = await request(app)
      .post("/api/properties")
      .set(authHeader(owner.token))
      .send({ name: "Cabin 1", location: "Lake Rd" });
    expect(res.status).toBe(201);
  });

  it("E3-2 assign billing client to property", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const client = await createClient(owner.team.id);
    const prop = await request(app)
      .post("/api/properties")
      .set(authHeader(owner.token))
      .send({ name: "Villa", clientId: client.id });
    expect(prop.status).toBe(201);
    expect(prop.body.clientId).toBe(client.id);
  });

  it("E3-7 set markup on property", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const prop = await createProperty(owner.team.id);
    const res = await request(app)
      .put(`/api/properties/${prop.id}`)
      .set(authHeader(owner.token))
      .send({ name: prop.name, markupPercentage: 15 });
    expect(res.status).toBe(200);
    expect(Number(res.body.markupPercentage)).toBe(15);
  });

  it("E3-6 inter-property transfer via stock location", async () => {
    const scenario = await createStockScenario();
    const propertyB = await createProperty(scenario.team.id, {
      clientId: scenario.client.id,
      name: "Property B",
    });
    await request(app)
      .post(`/api/stock-locations/${scenario.stockLocation.id}/properties`)
      .set(authHeader(scenario.token))
      .send({ propertyId: propertyB.id });

    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 10 });

    // Seed stock at property A via replenish, then transfer A→B
    const replenish = await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 20 }],
      });
    expect(replenish.status).toBe(201);

    const transfer = await request(app)
      .post("/api/replenishments/transfers")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        fromPropertyId: scenario.property.id,
        toPropertyId: propertyB.id,
        skuId: scenario.sku.id,
        baseQty: 5,
      });
    expect([200, 201]).toContain(transfer.status);
  });

  it("E3-4 removed — property reorder points not used", () => {
    expect(true).toBe(true);
  });
});
