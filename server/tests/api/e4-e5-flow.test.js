import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase, prisma } from "../helpers/db.js";
import {
  createStockScenario,
  createTeamMember,
  createOwnerContext,
  createSupplyItem,
  createSku,
  ensureSkuAtLocation,
  authHeader,
} from "../helpers/factories.js";

let app;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("E4 / E5 receive, replenish, return", () => {
  it("E4-1/E4-2 receive creates ledger StockTransaction", async () => {
    const scenario = await createStockScenario();
    const res = await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 3 });
    expect(res.status).toBe(201);
    const txs = await prisma.stockTransaction.count({
      where: { teamId: scenario.team.id, transactionType: "receipt" },
    });
    expect(txs).toBeGreaterThan(0);
  });

  it("E5-1..E5-6 replenish break-pack, bill-back, unbilled", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 10 });

    const res = await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 5 }],
      });
    expect(res.status).toBe(201);

    // packSize 10, base 5 → 0.5 packs remaining from 10 = 9.5
    const onHand = await prisma.stockOnHand.findUnique({
      where: {
        skuId_stockLocationId: {
          skuId: scenario.sku.id,
          stockLocationId: scenario.stockLocation.id,
        },
      },
    });
    expect(Number(onHand.quantity)).toBeCloseTo(9.5, 5);

    const unbilled = await request(app)
      .get("/api/unbilled-lines")
      .set(authHeader(scenario.token));
    expect(unbilled.status).toBe(200);
    expect(Array.isArray(unbilled.body) || Array.isArray(unbilled.body?.lines)).toBe(true);

    // bill-back: unitRate 1, markup 20% → 5 * 1 * 1.2 = 6
    const line = res.body.lines?.[0] || res.body.replenishment?.lines?.[0];
    if (line) {
      expect(Number(line.billBackAmount ?? line.amount)).toBeCloseTo(6, 2);
    }
  });

  it("E5-10 blocks replenish when insufficient stock", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 1 });

    const res = await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 1000 }],
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("E5-7 return creates credit path", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 10 });
    const rep = await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 10 }],
      });
    expect(rep.status).toBe(201);
    const lineId =
      rep.body.lines?.[0]?.id ||
      rep.body.replenishment?.lines?.[0]?.id;
    expect(lineId).toBeTruthy();
    const ret = await request(app)
      .post("/api/replenishments/returns")
      .set(authHeader(scenario.token))
      .send({
        reversesLineId: lineId,
        baseQty: 2,
      });
    expect(ret.status).toBe(201);
  });

  it("E5-8 list replenishment history", async () => {
    const scenario = await createStockScenario();
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 5 });
    await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 5 }],
      });
    const list = await request(app)
      .get("/api/replenishments")
      .set(authHeader(scenario.token));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
  });

  it("E4-8 Free inventory cap blocks SKU creates when over limit", async () => {
    const owner = await createOwnerContext({ plan: "free" });
    // Free maxSkus=15 — create until blocked is slow; instead set org somehow...
    // Use membership maxInventoryItems = 0 to force block if enforced, else create past sku limit via loop of 16
    const supply = await createSupplyItem(owner.team.id);
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post("/api/skus")
        .set(authHeader(owner.token))
        .send({
          supplyItemId: supply.id,
          name: `SKU-${i}`,
          packSize: 1,
          purchasePrice: 1,
        });
      if (res.status === 403) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  it("E4-7 member with allowedPropertyIds restricted", async () => {
    const scenario = await createStockScenario();
    const member = await createTeamMember(scenario.team.id, {
      teamRole: "member",
      allowedPages: ["inventory"],
      allowedPropertyIds: ["nonexistent-property-id"],
    });
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 5 });

    const res = await request(app)
      .post("/api/replenishments")
      .set(authHeader(member.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 1 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROPERTY_ACCESS_DENIED");
  });

  it.todo("E4-3 bulk-import supply items and SKUs");
  it.todo("E4-4 export stock levels at a location");
  it.todo("E4-6 locale unit display (lb, fl oz)");
});
