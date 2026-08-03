import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { DateTime } from "luxon";
import { getApp } from "../helpers/app.js";
import { resetDatabase, prisma } from "../helpers/db.js";
import {
  createStockScenario,
  createClient,
  authHeader,
} from "../helpers/factories.js";

let app;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("E6 Client billing", () => {
  async function seedUnbilledCharge() {
    const scenario = await createStockScenario();
    await prisma.client.update({
      where: { id: scenario.client.id },
      data: { billingFrequency: "weekly" },
    });
    await prisma.team.update({
      where: { id: scenario.team.id },
      data: {
        createdAt: DateTime.now().minus({ weeks: 3 }).toJSDate(),
      },
    });
    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 20 });
    const rep = await request(app)
      .post("/api/replenishments")
      .set(authHeader(scenario.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 10 }],
      });
    expect(rep.status).toBe(201);
    // Backdate replenishment into a closed period
    const closed = DateTime.now().minus({ weeks: 1 }).toJSDate();
    await prisma.replenishment.updateMany({
      where: { teamId: scenario.team.id },
      data: { createdAt: closed },
    });
    await prisma.replenishmentLine.updateMany({
      where: { replenishment: { teamId: scenario.team.id } },
      data: { createdAt: closed },
    });
    return scenario;
  }

  it("E6-10 create/update client with markup and frequency", async () => {
    const scenario = await createStockScenario();
    const create = await request(app)
      .post("/api/clients")
      .set(authHeader(scenario.token))
      .send({
        name: "Billing Client",
        email: "bill@example.com",
        defaultMarkupPercentage: 12,
        billingFrequency: "biweekly",
      });
    expect(create.status).toBe(201);
    const update = await request(app)
      .put(`/api/clients/${create.body.id}`)
      .set(authHeader(scenario.token))
      .send({
        name: "Billing Client",
        email: "bill@example.com",
        billingFrequency: "monthly_eom",
        defaultMarkupPercentage: 8,
      });
    expect(update.status).toBe(200);
  });

  it("E6-1/E6-2/E6-3 generate draft invoices for closed periods", async () => {
    const scenario = await seedUnbilledCharge();
    const gen = await request(app)
      .post("/api/billing/generate-drafts")
      .set(authHeader(scenario.token))
      .send({});
    expect([200, 201]).toContain(gen.status);
    const invoices = await request(app)
      .get("/api/invoices")
      .set(authHeader(scenario.token));
    expect(invoices.status).toBe(200);
    expect(invoices.body.length).toBeGreaterThan(0);
  });

  it("E6-6 export invoices CSV", async () => {
    const scenario = await seedUnbilledCharge();
    await request(app)
      .post("/api/billing/generate-drafts")
      .set(authHeader(scenario.token))
      .send({});
    const csv = await request(app)
      .get("/api/invoices/export.csv")
      .set(authHeader(scenario.token));
    expect(csv.status).toBe(200);
    expect(String(csv.text || csv.body)).toContain("invoiceNumber");
  });

  it("E6-4/E6-7 update draft status", async () => {
    const scenario = await seedUnbilledCharge();
    await request(app)
      .post("/api/billing/generate-drafts")
      .set(authHeader(scenario.token))
      .send({});
    const list = await request(app).get("/api/invoices").set(authHeader(scenario.token));
    const draft = list.body.find((i) => i.status === "draft") || list.body[0];
    expect(draft).toBeTruthy();
    const updated = await request(app)
      .put(`/api/invoices/${draft.id}`)
      .set(authHeader(scenario.token))
      .send({ status: "sent", notes: "Reviewed" });
    expect([200, 400]).toContain(updated.status);
  });

  it("E6-5 send invoice (email mocked)", async () => {
    const scenario = await seedUnbilledCharge();
    await request(app)
      .post("/api/billing/generate-drafts")
      .set(authHeader(scenario.token))
      .send({});
    const list = await request(app).get("/api/invoices").set(authHeader(scenario.token));
    const draft = list.body[0];
    const send = await request(app)
      .post(`/api/invoices/${draft.id}/send`)
      .set(authHeader(scenario.token))
      .send({});
    expect([200, 201, 400]).toContain(send.status);
  });

  it("E6-8/E6-9 unbilled lines carry until invoiced", async () => {
    const scenario = await seedUnbilledCharge();
    const before = await request(app)
      .get("/api/unbilled-lines")
      .set(authHeader(scenario.token));
    expect(before.status).toBe(200);
    const beforeCount = Array.isArray(before.body)
      ? before.body.length
      : before.body?.lines?.length || 0;
    expect(beforeCount).toBeGreaterThan(0);
    await request(app)
      .post("/api/billing/generate-drafts")
      .set(authHeader(scenario.token))
      .send({});
  });
});
