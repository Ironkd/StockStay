import crypto from "crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase, prisma } from "../helpers/db.js";
import {
  authHeader,
  createClient,
  createOwnerContext,
} from "../helpers/factories.js";
import { sendInvoiceEmail } from "../../email.js";

let app;
let invoiceSequence = 0;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDatabase();
});

async function createInvoiceForTeam(teamId, client, overrides = {}) {
  invoiceSequence += 1;
  return prisma.invoice.create({
    data: {
      id: crypto.randomUUID(),
      teamId,
      invoiceNumber: `INV-TENANCY-${invoiceSequence}`,
      clientId: client.id,
      clientName: client.name,
      date: "2026-08-01",
      dueDate: "2026-08-15",
      items: "[]",
      subtotal: 10,
      tax: 0,
      total: 10,
      status: "draft",
      notes: "original note",
      ...overrides,
    },
  });
}

describe("E6 billing tenant isolation", () => {
  it("returns 404 for cross-team single invoice fetches without leaking data", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const clientA = await createClient(ownerA.team.id, { name: "Client A" });
    const invoiceA = await createInvoiceForTeam(ownerA.team.id, clientA, {
      invoiceNumber: "INV-TEAM-A-GET",
    });

    const crossTeam = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerB.token));

    expect(crossTeam.status).toBe(404);
    expect(crossTeam.body).toEqual({ message: "Invoice not found" });

    const sameTeam = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(sameTeam.status).toBe(200);
    expect(sameTeam.body.id).toBe(invoiceA.id);
    expect(sameTeam.body.invoiceNumber).toBe("INV-TEAM-A-GET");
    expect(sameTeam.body.teamId).toBe(ownerA.team.id);
  });

  it("returns 404 for cross-team invoice updates and leaves the invoice unchanged", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const clientA = await createClient(ownerA.team.id, { name: "Client A" });
    const invoiceA = await createInvoiceForTeam(ownerA.team.id, clientA, {
      invoiceNumber: "INV-TEAM-A-PUT",
    });

    const crossTeam = await request(app)
      .put(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerB.token))
      .send({ notes: "hijacked", status: "sent" });

    expect(crossTeam.status).toBe(404);
    expect(crossTeam.body).toEqual({ message: "Invoice not found" });

    const unchanged = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(unchanged.status).toBe(200);
    expect(unchanged.body.notes).toBe("original note");
    expect(unchanged.body.status).toBe("draft");

    const sameTeamUpdate = await request(app)
      .put(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token))
      .send({ notes: "team a update", status: "sent" });

    expect(sameTeamUpdate.status).toBe(200);
    expect(sameTeamUpdate.body.notes).toBe("team a update");
    expect(sameTeamUpdate.body.status).toBe("sent");
  });

  it("returns 404 for cross-team invoice deletes and does not void or delete the invoice", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const clientA = await createClient(ownerA.team.id, { name: "Client A" });
    const invoiceA = await createInvoiceForTeam(ownerA.team.id, clientA, {
      invoiceNumber: "INV-TEAM-A-DELETE",
      status: "sent",
    });

    const crossTeam = await request(app)
      .delete(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerB.token));

    expect(crossTeam.status).toBe(404);
    expect(crossTeam.body).toEqual({ message: "Invoice not found" });

    const stillExists = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(stillExists.status).toBe(200);
    expect(stillExists.body.status).toBe("sent");

    const sameTeamDelete = await request(app)
      .delete(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(sameTeamDelete.status).toBe(200);
    expect(sameTeamDelete.body.message).toContain("voided");

    const afterDelete = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.status).toBe("void");
  });

  it("returns 404 for cross-team invoice sends and does not send or mutate the invoice", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const clientA = await createClient(ownerA.team.id, {
      name: "Client A",
      email: "client-a@example.com",
    });
    const invoiceA = await createInvoiceForTeam(ownerA.team.id, clientA, {
      invoiceNumber: "INV-TEAM-A-SEND",
    });

    const crossTeam = await request(app)
      .post(`/api/invoices/${invoiceA.id}/send`)
      .set(authHeader(ownerB.token))
      .send({});

    expect(crossTeam.status).toBe(404);
    expect(crossTeam.body).toEqual({ message: "Invoice not found" });
    expect(vi.mocked(sendInvoiceEmail)).not.toHaveBeenCalled();

    const stillDraft = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(stillDraft.status).toBe(200);
    expect(stillDraft.body.status).toBe("draft");

    const sameTeamSend = await request(app)
      .post(`/api/invoices/${invoiceA.id}/send`)
      .set(authHeader(ownerA.token))
      .send({});

    expect(sameTeamSend.status).toBe(200);
    expect(sameTeamSend.body.message).toContain("Invoice sent to client-a@example.com.");
    expect(vi.mocked(sendInvoiceEmail)).toHaveBeenCalledTimes(1);

    const sentInvoice = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set(authHeader(ownerA.token));

    expect(sentInvoice.status).toBe(200);
    expect(sentInvoice.body.status).toBe("sent");
  });

  it("returns 404 for cross-team single invoice CSV exports without leaking invoice content", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const clientA = await createClient(ownerA.team.id, { name: "Client A" });
    const invoiceA = await createInvoiceForTeam(ownerA.team.id, clientA, {
      invoiceNumber: "INV-TEAM-A-CSV",
    });

    const crossTeam = await request(app)
      .get(`/api/invoices/${invoiceA.id}/export.csv`)
      .set(authHeader(ownerB.token));

    expect(crossTeam.status).toBe(404);
    expect(crossTeam.body).toEqual({ message: "Invoice not found" });
    expect(String(crossTeam.text || "")).not.toContain("INV-TEAM-A-CSV");

    const sameTeam = await request(app)
      .get(`/api/invoices/${invoiceA.id}/export.csv`)
      .set(authHeader(ownerA.token));

    expect(sameTeam.status).toBe(200);
    expect(String(sameTeam.text || sameTeam.body)).toContain("INV-TEAM-A-CSV");
    expect(String(sameTeam.text || sameTeam.body)).toContain("Client A");
  });
});
