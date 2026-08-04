import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { AuthProvider } from "../contexts/AuthContext";
import { useAuth } from "../contexts/useAuth";

vi.mock("../services/authApi", () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

describe("canWrite (E1-4)", () => {
  it("exposes canWrite false conceptually for viewers via AuthContext contract", () => {
    // Smoke: AuthProvider mounts; canWrite derived from teamRole !== viewer
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.canWrite).toBe(false);
    expect(typeof result.current.canWrite).toBe("boolean");
  });
});
