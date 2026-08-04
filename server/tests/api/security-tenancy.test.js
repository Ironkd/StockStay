import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { getApp } from "../helpers/app.js";
import { resetDatabase, prisma } from "../helpers/db.js";
import {
  authHeader,
  createOwnerContext,
  createTeamMember,
  createClient,
  createProperty,
  createStockScenario,
} from "../helpers/factories.js";

describe("Security: tenancy and ACL", () => {
  let app;

  beforeEach(async () => {
    await resetDatabase();
    app = await getApp();
  });

  it("rejects client teamId reassignment via PUT body", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const client = await createClient(ownerA.team.id, { name: "Client A" });

    const res = await request(app)
      .put(`/api/clients/${client.id}`)
      .set(authHeader(ownerA.token))
      .send({ name: "Client A renamed", teamId: ownerB.team.id });

    expect(res.status).toBe(200);
    expect(res.body.teamId).toBe(ownerA.team.id);

    const row = await prisma.client.findUnique({ where: { id: client.id } });
    expect(row.teamId).toBe(ownerA.team.id);
  });

  it("rejects invoice teamId reassignment via PUT body", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const client = await createClient(ownerA.team.id);
    const invoice = await prisma.invoice.create({
      data: {
        id: crypto.randomUUID(),
        teamId: ownerA.team.id,
        invoiceNumber: "INV-SEC-1",
        clientId: client.id,
        clientName: client.name,
        date: new Date().toISOString().slice(0, 10),
        items: "[]",
        subtotal: 10,
        tax: 0,
        total: 10,
        status: "draft",
      },
    });

    const res = await request(app)
      .put(`/api/invoices/${invoice.id}`)
      .set(authHeader(ownerA.token))
      .send({ notes: "updated", teamId: ownerB.team.id, status: "draft" });

    expect(res.status).toBe(200);
    expect(res.body.teamId).toBe(ownerA.team.id);

    const row = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(row.teamId).toBe(ownerA.team.id);
  });

  it("blocks viewer from writing clients and properties", async () => {
    const owner = await createOwnerContext();
    const viewer = await createTeamMember(owner.team.id, {
      teamRole: "viewer",
      allowedPages: ["clients", "inventory", "invoices", "settings"],
    });
    const client = await createClient(owner.team.id);
    const property = await createProperty(owner.team.id);

    const clientWrite = await request(app)
      .post("/api/clients")
      .set(authHeader(viewer.token))
      .send({ name: "Nope" });
    expect(clientWrite.status).toBe(403);

    const propertyWrite = await request(app)
      .put(`/api/properties/${property.id}`)
      .set(authHeader(viewer.token))
      .send({ name: "Hacked" });
    expect(propertyWrite.status).toBe(403);

    const propertyDelete = await request(app)
      .delete(`/api/properties/${property.id}`)
      .set(authHeader(viewer.token));
    expect(propertyDelete.status).toBe(403);

    const invoiceWrite = await request(app)
      .post("/api/invoices")
      .set(authHeader(viewer.token))
      .send({
        invoiceNumber: "X",
        clientId: client.id,
        clientName: client.name,
        date: new Date().toISOString().slice(0, 10),
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        status: "draft",
      });
    expect(invoiceWrite.status).toBe(403);
  });

  it("blocks non-owner members from updating or deleting properties", async () => {
    const owner = await createOwnerContext();
    const member = await createTeamMember(owner.team.id, {
      teamRole: "member",
      allowedPages: ["inventory"],
    });
    const property = await createProperty(owner.team.id);

    const update = await request(app)
      .put(`/api/properties/${property.id}`)
      .set(authHeader(member.token))
      .send({ name: "Member rename" });
    expect(update.status).toBe(403);

    const del = await request(app)
      .delete(`/api/properties/${property.id}`)
      .set(authHeader(member.token));
    expect(del.status).toBe(403);
  });

  it("scoped member cannot list or replenish unassigned properties", async () => {
    const scenario = await createStockScenario();
    const otherProperty = await createProperty(scenario.team.id, {
      name: "Other property",
    });
    const member = await createTeamMember(scenario.team.id, {
      teamRole: "member",
      allowedPages: ["inventory"],
      allowedPropertyIds: [scenario.property.id],
    });

    const list = await request(app)
      .get("/api/properties")
      .set(authHeader(member.token));
    expect(list.status).toBe(200);
    expect(list.body.map((p) => p.id)).toEqual([scenario.property.id]);
    expect(list.body.map((p) => p.id)).not.toContain(otherProperty.id);

    await request(app)
      .post(`/api/skus/${scenario.sku.id}/receive`)
      .set(authHeader(scenario.token))
      .send({ stockLocationId: scenario.stockLocation.id, quantity: 5 });

    const blocked = await request(app)
      .post("/api/replenishments")
      .set(authHeader(member.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: otherProperty.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 1 }],
      });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PROPERTY_ACCESS_DENIED");

    const allowed = await request(app)
      .post("/api/replenishments")
      .set(authHeader(member.token))
      .send({
        stockLocationId: scenario.stockLocation.id,
        propertyId: scenario.property.id,
        lines: [{ skuId: scenario.sku.id, baseQty: 1 }],
      });
    expect(allowed.status).toBe(201);
  });

  it("does not expose invitation tokens on GET /api/team", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const created = await request(app)
      .post("/api/team/invitations")
      .set(authHeader(owner.token))
      .send({ email: "invitee@example.com", teamRole: "member" });
    expect(created.status).toBe(201);
    expect(created.body.token).toBeTruthy();

    const team = await request(app).get("/api/team").set(authHeader(owner.token));
    expect(team.status).toBe(200);
    expect(team.body.invitations.length).toBeGreaterThan(0);
    for (const inv of team.body.invitations) {
      expect(inv.token).toBeUndefined();
    }
  });
});
