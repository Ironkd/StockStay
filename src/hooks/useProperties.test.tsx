import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProperties } from "./useProperties";
import type { Property } from "../types";

const getAllMock = vi.fn();
const createClientMock = vi.fn();
const createPropertyMock = vi.fn();
const updatePropertyMock = vi.fn();
const deletePropertyMock = vi.fn();

vi.mock("../services/propertiesApi", () => ({
  propertiesApi: {
    getAll: () => getAllMock(),
    create: (...args: unknown[]) => createPropertyMock(...args),
    update: (...args: unknown[]) => updatePropertyMock(...args),
    delete: (...args: unknown[]) => deletePropertyMock(...args),
  },
}));

vi.mock("../services/clientsApi", () => ({
  clientsApi: {
    create: (...args: unknown[]) => createClientMock(...args),
  },
}));

const createProperty = (overrides: Partial<Property> = {}): Property => ({
  id: overrides.id ?? "property-1",
  name: overrides.name ?? "Property 1",
  location: overrides.location ?? "",
  clientId: overrides.clientId ?? null,
  markupPercentage: overrides.markupPercentage ?? "0",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe("useProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the latest refresh result when older requests resolve later", async () => {
    const initialLoad = createDeferred<Property[]>();
    const manualRefresh = createDeferred<Property[]>();

    getAllMock
      .mockReturnValueOnce(initialLoad.promise)
      .mockReturnValueOnce(manualRefresh.promise);

    const { result } = renderHook(() => useProperties());

    await waitFor(() => expect(getAllMock).toHaveBeenCalledTimes(1));

    act(() => {
      void result.current.refresh();
    });

    await waitFor(() => expect(getAllMock).toHaveBeenCalledTimes(2));

    manualRefresh.resolve([
      createProperty({ id: "property-new", name: "Newest property" }),
    ]);

    await waitFor(() =>
      expect(result.current.properties).toEqual([
        createProperty({ id: "property-new", name: "Newest property" }),
      ])
    );

    initialLoad.resolve([
      createProperty({ id: "property-old", name: "Stale property" }),
    ]);

    await act(async () => {
      await initialLoad.promise;
    });

    expect(result.current.properties).toEqual([
      createProperty({ id: "property-new", name: "Newest property" }),
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoaded).toBe(true);
  });

  it("does not apply an in-flight load result after unmount", async () => {
    const pendingLoad = createDeferred<Property[]>();

    getAllMock.mockReturnValueOnce(pendingLoad.promise);

    const { result, unmount } = renderHook(() => useProperties());

    await waitFor(() => expect(getAllMock).toHaveBeenCalledTimes(1));
    expect(result.current.isLoaded).toBe(false);

    unmount();

    pendingLoad.resolve([
      createProperty({ id: "property-late", name: "Late property" }),
    ]);

    await act(async () => {
      await pendingLoad.promise;
    });
  });
});
