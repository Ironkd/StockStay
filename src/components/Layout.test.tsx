import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../components/Layout";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "owner@example.com",
      name: "Owner",
      teamId: "t1",
      teamRole: "owner",
      memberships: [],
    },
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
    loading: false,
    canWrite: true,
    updateUser: vi.fn(),
    refreshUser: vi.fn(),
    switchTeam: vi.fn(),
  }),
}));

vi.mock("../services/teamApi", () => ({
  teamApi: {
    getTeamName: vi.fn(async () => ({ name: "Test Team" })),
    getTeamLimits: vi.fn(async () => ({ effectivePlan: "pro" })),
  },
}));

vi.mock("../config/api", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("./OverLimitBanner", () => ({
  OverLimitBanner: () => null,
}));

describe("E1-10 Layout Send feedback + legal links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens feedback modal and links to Terms/Privacy", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Layout>
          <div>child</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /Terms/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /Privacy/i })).toHaveAttribute("href", "/privacy");

    await user.click(screen.getByRole("button", { name: /Send feedback/i }));
    expect(await screen.findByRole("heading", { name: /Send feedback/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("owner@example.com")).toBeInTheDocument();
  });
});
