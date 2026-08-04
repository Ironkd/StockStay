import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "../pages/LandingPage";

vi.mock("../contexts/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    loading: false,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    canWrite: false,
    updateUser: vi.fn(),
    refreshUser: vi.fn(),
    switchTeam: vi.fn(),
  }),
}));

vi.mock("../services/plansApi", () => ({
  fetchPlansConfig: vi.fn(async () => ({
    currency: "USD",
    extraUserPrice: 5,
    plans: {
      free: {
        id: "free",
        name: "Free",
        monthlyPrice: 0,
        annualPrice: 0,
        maxProperties: 1,
        marketingFeatures: ["1 property", "No credit card required"],
      },
      starter: {
        id: "starter",
        name: "Starter",
        monthlyPrice: 18,
        annualPrice: 180,
        marketingFeatures: ["3 properties"],
      },
      pro: {
        id: "pro",
        name: "Pro",
        monthlyPrice: 39,
        annualPrice: 390,
        marketingFeatures: ["10 properties"],
      },
    },
  })),
}));

vi.mock("../config/api", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  track: vi.fn(),
}));

describe("E8-5 Landing live plans + legal footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders plan names from live config and footer legal links", async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("link", { name: /^Terms$/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /^Privacy$/i })).toHaveAttribute("href", "/privacy");
  });
});
