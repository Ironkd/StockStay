import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { getApp } from "../helpers/app.js";
import { resetDatabase, prisma } from "../helpers/db.js";
import {
  createOwnerContext,
  createTeamMember,
  createProperty,
  authHeader,
  TEST_PASSWORD,
} from "../helpers/factories.js";

let app;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("E1 Organization and access", () => {
  it("E1-1 Free signup without payment creates unverified user", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "newbie@example.com",
        password: TEST_PASSWORD,
        fullName: "New User",
      });
    expect(res.status).toBe(201);
    expect(res.body.teamId).toBeTruthy();
    expect(res.body.token).toBeFalsy();
    const user = await prisma.user.findUnique({ where: { email: "newbie@example.com" } });
    expect(user.emailVerified).toBe(false);
    const org = await prisma.organization.findFirst({ where: { ownerId: user.id } });
    expect(org?.plan).toBe("free");
  });

  it("E1-4 viewer cannot create clients (VIEWER_READ_ONLY)", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const viewer = await createTeamMember(owner.team.id, { teamRole: "viewer" });
    const res = await request(app)
      .post("/api/clients")
      .set(authHeader(viewer.token))
      .send({ name: "Should Fail", email: "x@y.com" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("VIEWER_READ_ONLY");
  });

  it("E1-3 invite member with allowedPages", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const invite = await request(app)
      .post("/api/team/invitations")
      .set(authHeader(owner.token))
      .send({
        email: "invited@example.com",
        teamRole: "member",
        allowedPages: ["inventory", "reports"],
      });
    expect(invite.status).toBe(201);
    expect(invite.body.token).toBeTruthy();
  });

  it("E1-8 verify-email marks user verified", async () => {
    await request(app).post("/api/auth/signup").send({
      email: "verifyme@example.com",
      password: TEST_PASSWORD,
      fullName: "Verify Me",
    });
    const user = await prisma.user.findUnique({ where: { email: "verifyme@example.com" } });
    const res = await request(app)
      .get("/api/auth/verify-email")
      .query({ token: user.emailVerificationToken });
    expect(res.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { email: "verifyme@example.com" } });
    expect(updated.emailVerified).toBe(true);
  });

  it("E1-9 Free plan blocks second property; existing preserved", async () => {
    const owner = await createOwnerContext({ plan: "free" });
    await createProperty(owner.team.id, { name: "Only One" });
    const res = await request(app)
      .post("/api/properties")
      .set(authHeader(owner.token))
      .send({ name: "Second" });
    expect(res.status).toBe(403);
    expect(res.body.code === "PLAN_LIMIT" || /limit/i.test(JSON.stringify(res.body))).toBe(true);
    const count = await prisma.property.count({ where: { teamId: owner.team.id } });
    expect(count).toBe(1);
  });

  it("E1-10 POST /api/contact accepts feedback", async () => {
    const res = await request(app).post("/api/contact").send({
      name: "Tester",
      email: "tester@example.com",
      message: "Hello from harness",
    });
    expect([200, 201]).toContain(res.status);
  });

  it("E1-7 AdminJS disabled when SUPER_ADMIN_EMAILS empty", async () => {
    const res = await request(app).get("/admin");
    expect(res.status).toBe(404);
  });

  it("E1-6 switch active team via POST /api/me/active-team", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const other = await createOwnerContext({ plan: "pro", email: "other-org@example.com" });
    await prisma.userMembership.create({
      data: {
        userId: owner.user.id,
        teamId: other.team.id,
        teamRole: "member",
      },
    });
    const res = await request(app)
      .post("/api/me/active-team")
      .set(authHeader(owner.token))
      .send({ teamId: other.team.id });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: owner.user.id } });
    expect(user.activeTeamId).toBe(other.team.id);
  });

  it("E1-5 org owner can create another team under organization", async () => {
    const owner = await createOwnerContext({ plan: "pro" });
    const res = await request(app)
      .post(`/api/organizations/${owner.organization.id}/teams`)
      .set(authHeader(owner.token))
      .send({ name: "Regional West" });
    expect([200, 201]).toContain(res.status);
  });

  it.todo("E1-2 Stripe subscription manage — covered lightly in e8 when billing configured");
});
