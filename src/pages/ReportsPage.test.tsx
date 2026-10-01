import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsPage } from "./ReportsPage";
import type {
  LocationSupplyThreshold,
  Sku,
  StockLocation,
  StockTransaction,
  StockTransactionType,
} from "../types";

const getAllLocationsMock = vi.fn();
const getAllSkusMock = vi.fn();
const getAllTransactionsMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock("../config/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock("../services/catalogueApi", () => ({
  skusApi: {
    getAll: (...args: unknown[]) => getAllSkusMock(...args),
  },
  stockTransactionsApi: {
    getAll: (...args: unknown[]) => getAllTransactionsMock(...args),
  },
}));

vi.mock("../services/stockLocationsApi", () => ({
  stockLocationsApi: {
    getAll: (...args: unknown[]) => getAllLocationsMock(...args),
  },
}));

const defaultLocation: StockLocation = {
  id: "location-1",
  teamId: "team-1",
  name: "Main Closet",
  address: null,
  tags: [],
  visibleCategories: null,
  showUncategorized: true,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const defaultSku: Sku = {
  id: "sku-1",
  teamId: "team-1",
  supplyItemId: "item-1",
  name: "Paper Towels",
  supplier: null,
  packSize: "1",
  purchasePrice: "0",
  unitRate: "0",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  stockOnHands: [],
  supplyItem: {
    id: "item-1",
    name: "Paper Towels",
    category: "Supplies",
    baseUnitId: "unit-1",
  },
};

const defaultThreshold: LocationSupplyThreshold = {
  id: "threshold-1",
  stockLocationId: "location-1",
  supplyItemId: "item-1",
  reorderPoint: "0",
  reorderQuantity: "0",
  onHandBase: "0",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  stockLocation: { id: "location-1", name: "Main Closet" },
  supplyItem: {
    id: "item-1",
    name: "Paper Towels",
    category: "Supplies",
    baseUnitId: "unit-1",
  },
};

function createTransaction(
  id: string,
  transactionType: StockTransactionType,
  overrides: Partial<StockTransaction> = {}
): StockTransaction {
  return {
    id,
    teamId: "team-1",
    entityType: "stock_on_hand",
    entityId: "soh-1",
    quantityDelta: "1",
    transactionType,
    postingId: `posting-${id}`,
    referenceType: null,
    referenceId: null,
    reason: null,
    createdByUserId: null,
    createdByUser: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllLocationsMock.mockResolvedValue([defaultLocation]);
    getAllSkusMock.mockResolvedValue([defaultSku]);
    apiRequestMock.mockResolvedValue([defaultThreshold]);
  });

  it("keeps the newest transaction filter results when earlier requests resolve later", async () => {
    const initialTransactions = [createTransaction("tx-initial", "invoice")];
    const receiptTransactions = [createTransaction("tx-receipt", "receipt")];
    const adjustmentTransactions = [createTransaction("tx-adjustment", "adjustment")];
    const receiptRequest = deferred<StockTransaction[]>();
    const adjustmentRequest = deferred<StockTransaction[]>();

    getAllTransactionsMock.mockImplementation(
      ({ transactionType }: { transactionType?: string }) => {
        if (transactionType === "receipt") {
          return receiptRequest.promise;
        }
        if (transactionType === "adjustment") {
          return adjustmentRequest.promise;
        }
        return Promise.resolve(initialTransactions);
      }
    );

    render(<ReportsPage />);

    const transactionsSection = await screen.findByRole("heading", {
      name: /recent stock transactions/i,
    });
    const getTransactionTable = () =>
      within(transactionsSection.closest("section") as HTMLElement).getByRole("table");

    expect(await within(getTransactionTable()).findByText("Invoice")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/transaction type/i), "receipt");
    await user.selectOptions(screen.getByLabelText(/transaction type/i), "adjustment");

    await act(async () => {
      adjustmentRequest.resolve(adjustmentTransactions);
      await adjustmentRequest.promise;
    });
    expect(await within(getTransactionTable()).findByText("Adjustment")).toBeInTheDocument();
    expect(within(getTransactionTable()).queryByText("Receipt")).not.toBeInTheDocument();

    await act(async () => {
      receiptRequest.resolve(receiptTransactions);
      await receiptRequest.promise;
    });

    await waitFor(() =>
      expect(within(getTransactionTable()).getByText("Adjustment")).toBeInTheDocument()
    );
    expect(within(getTransactionTable()).queryByText("Receipt")).not.toBeInTheDocument();
  });
});
