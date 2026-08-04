import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../pages/LoginPage";

vi.mock("../contexts/useAuth", () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: false,
    loading: false,
    user: null,
    canWrite: false,
    updateUser: vi.fn(),
    refreshUser: vi.fn(),
    switchTeam: vi.fn(),
  }),
}));

vi.mock("../services/authApi", () => ({
  authApi: {
    signup: vi.fn(),
    login: vi.fn(),
    forgotPassword: vi.fn(),
  },
}));

vi.mock("../lib/analytics", () => ({
  track: vi.fn(),
}));

describe("E1-1 LoginPage Free signup UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Free plan messaging in signup mode", async () => {
    render(
      <MemoryRouter initialEntries={["/login?mode=signup"]}>
        <LoginPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByText(/You'll start on the Free plan/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/credit card/i)).not.toBeInTheDocument();
  });
});
