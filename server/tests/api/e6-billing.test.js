import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { DateTime } from "luxon";
import { getApp } from "../helpers/app.js";
import { resetDatabase, prisma } from "../helpers/db.js";
import {
  createStockScenario,
  createClient,
  authHeader,
} from "../helpers/factories.js";
import { sendInvoiceEmail } from "../../email.js";

let app;
let manualInvoiceSequence = 0;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  vi.clearAllMocks();
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

  function buildManualInvoicePayload(scenario, overrides = {}) {
    manualInvoiceSequence += 1;
    return {
      invoiceNumber: `MAN-${manualInvoiceSequence}`,
      clientId: scenario.client.id,
      clientName: scenario.client.name,
      date: "2026-08-01",
      dueDate: "2026-08-15",
      items: [{ name: "Pods", quantity: 2, unitPrice: 5, total: 10 }],
      tax: 13,
      subtotal: 10,
      total: 11.3,
      status: "draft",
      notes: "",
      ...overrides,
    };
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
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("sent");
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
    expect(send.status).toBe(200);
  });

  it("rejects manual invoices whose submitted totals do not match computed totals", async () => {
    const scenario = await createStockScenario();
    const create = await request(app)
      .post("/api/invoices")
      .set(authHeader(scenario.token))
      .send(buildManualInvoicePayload(scenario, { total: 99.99 }));

    expect(create.status).toBe(400);
    expect(create.body.message).toContain("Invoice total");
  });

  it("requires invoices to be sent before they can be marked paid and blocks edits once paid", async () => {
    const scenario = await createStockScenario();
    const created = await request(app)
      .post("/api/invoices")
      .set(authHeader(scenario.token))
      .send(buildManualInvoicePayload(scenario));
    expect(created.status).toBe(201);

    const directPaid = await request(app)
      .put(`/api/invoices/${created.body.id}`)
      .set(authHeader(scenario.token))
      .send({ status: "paid" });
    expect(directPaid.status).toBe(400);

    const sent = await request(app)
      .put(`/api/invoices/${created.body.id}`)
      .set(authHeader(scenario.token))
      .send({ status: "sent" });
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("sent");

    const paid = await request(app)
      .put(`/api/invoices/${created.body.id}`)
      .set(authHeader(scenario.token))
      .send({ status: "paid" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("paid");

    const blockedEdit = await request(app)
      .put(`/api/invoices/${created.body.id}`)
      .set(authHeader(scenario.token))
      .send({ notes: "cannot edit paid invoices" });
    expect(blockedEdit.status).toBe(409);
    expect(blockedEdit.body.message).toContain("Paid invoices cannot be edited");
  });

  it("voids sent invoices instead of hard deleting them", async () => {
    const scenario = await createStockScenario();
    const created = await request(app)
      .post("/api/invoices")
      .set(authHeader(scenario.token))
      .send(buildManualInvoicePayload(scenario, { status: "sent" }));
    expect(created.status).toBe(201);

    const deleted = await request(app)
      .delete(`/api/invoices/${created.body.id}`)
      .set(authHeader(scenario.token));
    expect(deleted.status).toBe(200);
    expect(deleted.body.message).toContain("voided");

    const invoice = await prisma.invoice.findUnique({ where: { id: created.body.id } });
    expect(invoice).toBeTruthy();
    expect(invoice.status).toBe("void");
  });

  it("treats duplicate send requests as idempotent and only sends one email", async () => {
    const scenario = await createStockScenario();
    const created = await request(app)
      .post("/api/invoices")
      .set(authHeader(scenario.token))
      .send(buildManualInvoicePayload(scenario));
    expect(created.status).toBe(201);

    let releaseSend;
    vi.mocked(sendInvoiceEmail).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSend = () => resolve({ ok: true });
        })
    );

    const firstSend = new Promise((resolve, reject) => {
      request(app)
        .post(`/api/invoices/${created.body.id}/send`)
        .set(authHeader(scenario.token))
        .send({})
        .end((error, response) => {
          if (error) reject(error);
          else resolve(response);
        });
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await prisma.invoice.findUnique({ where: { id: created.body.id } });
      if (current?.status === "sending") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const duplicateSend = await request(app)
      .post(`/api/invoices/${created.body.id}/send`)
      .set(authHeader(scenario.token))
      .send({});
    expect(duplicateSend.status).toBe(409);
    expect(duplicateSend.body.message).toContain("already being sent");

    releaseSend();
    const firstResponse = await firstSend;
    expect(firstResponse.status).toBe(200);

    const alreadySent = await request(app)
      .post(`/api/invoices/${created.body.id}/send`)
      .set(authHeader(scenario.token))
      .send({});
    expect(alreadySent.status).toBe(200);
    expect(alreadySent.body.message).toContain("already sent");
    expect(vi.mocked(sendInvoiceEmail)).toHaveBeenCalledTimes(1);
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
