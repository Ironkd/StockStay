import { vi } from "vitest";

vi.mock("../email.js", () => ({
  sendVerificationEmail: vi.fn(async () => true),
  sendInvoiceEmail: vi.fn(async () => ({ ok: true })),
  sendInvitationEmail: vi.fn(async () => true),
  sendSupportEmail: vi.fn(async () => true),
}));
