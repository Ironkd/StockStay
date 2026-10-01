import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import type { Invoice, Property } from "../types";

const mockUseAuth = vi.fn();
const mockUseInvoices = vi.fn();
const mockUseProperties = vi.fn();

const listLowStockMock = vi.fn();
const listUnbilledMock = vi.fn();
const getAllSkusMock = vi.fn();

vi.mock("../contexts/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../hooks/useInvoices", () => ({
  useInvoices: () => mockUseInvoices(),
}));

vi.mock("../hooks/useProperties", () => ({
  useProperties: () => mockUseProperties(),
}));

vi.mock("../services/catalogueApi", () => ({
  locationSupplyThresholdsApi: {
    listLowStock: () => listLowStockMock(),
  },
  skusApi: {
    getAll: () => getAllSkusMock(),
  },
}));

vi.mock("../services/replenishmentApi", () => ({
  replenishmentApi: {
    listUnbilled: () => listUnbilledMock(),
  },
}));

vi.mock("../components/LowStockCategoryChart", () => ({
  LowStockCategoryChart: ({ data }: { data: Array<{ name: string; value: number }> }) => (
    <div>Mock chart ({data.length})</div>
  ),
}));

const defaultProperties: Property[] = [
  {
    id: "property-1",
    name: "Property 1",
    clientId: null,
    markupPercentage: "0",
    location: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const createInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: overrides.id ?? crypto.randomUUID(),
  invoiceNumber: overrides.invoiceNumber ?? "INV-1",
  clientId: overrides.clientId ?? "client-1",
  clientName: overrides.clientName ?? "Client 1",
  date: overrides.date ?? "2026-09-01",
  dueDate: overrides.dueDate ?? "2026-09-01",
  items: overrides.items ?? [],
  lines: overrides.lines,
  billingPeriodStart: overrides.billingPeriodStart,
  billingPeriodEnd: overrides.billingPeriodEnd,
  taxRate: overrides.taxRate,
  subtotal: overrides.subtotal ?? 100,
  tax: overrides.tax ?? 0,
  total: overrides.total ?? 100,
  status: overrides.status ?? "sent",
  notes: overrides.notes,
  createdAt: overrides.createdAt ?? "2026-09-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-09-01T00:00:00.000Z",
});

const renderHomePage = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: { teamRole: "owner", allowedPropertyIds: null },
    });

    mockUseInvoices.mockReturnValue({
      invoices: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mockUseProperties.mockReturnValue({
      properties: defaultProperties,
      isLoaded: true,
      error: null,
      refresh: vi.fn(),
    });

    listLowStockMock.mockResolvedValue([]);
    listUnbilledMock.mockResolvedValue([]);
    getAllSkusMock.mockResolvedValue([]);
  });

  it("surfaces property, invoice, and dashboard load errors with retry actions", async () => {
    const refreshInvoices = vi.fn();
    const refreshProperties = vi.fn();

    mockUseInvoices.mockReturnValue({
      invoices: [],
      loading: false,
      error: "Invoice API failed",
      refresh: refreshInvoices,
    });

    mockUseProperties.mockReturnValue({
      properties: [],
      isLoaded: true,
      error: "Property API failed",
      refresh: refreshProperties,
    });

    listLowStockMock.mockRejectedValue(new Error("Dashboard API failed"));
    listUnbilledMock.mockRejectedValue(new Error("Dashboard API failed"));
    getAllSkusMock.mockRejectedValue(new Error("Dashboard API failed"));

    renderHomePage();

    expect(await screen.findByText(/couldn't load properties/i)).toBeInTheDocument();
    expect(await screen.findByText(/couldn't load dashboard data/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn't load overdue invoices/i)).toBeInTheDocument();

    const retryDashboardButtons = screen.getAllByRole("button", {
      name: /retry dashboard data/i,
    });
    await userEvent.click(retryDashboardButtons[0]);
    await waitFor(() => expect(listLowStockMock).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: /retry invoices/i }));
    expect(refreshInvoices).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /retry properties/i }));
    expect(refreshProperties).toHaveBeenCalledTimes(1);
  });

  it("keeps the dashboard in a loading state while invoices are still loading", () => {
    mockUseInvoices.mockReturnValue({
      invoices: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    renderHomePage();

    expect(screen.getByLabelText(/loading dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/no overdue invoices/i)).not.toBeInTheDocument();
  });

  it("uses the full overdue set for totals while limiting the displayed rows", async () => {
    const overdueInvoices = Array.from({ length: 12 }, (_, index) =>
      createInvoice({
        id: `invoice-${index + 1}`,
        invoiceNumber: `INV-${index + 1}`,
        dueDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
        total: 100,
      })
    );

    mockUseInvoices.mockReturnValue({
      invoices: [
        ...overdueInvoices,
        createInvoice({
          id: "invoice-invalid",
          invoiceNumber: "INV-BAD",
          dueDate: "not-a-date",
          total: 50,
        }),
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderHomePage();

    expect(await screen.findByText("$1200.00")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          Boolean(
            element?.classList.contains("overdue-count") && element.textContent === "12"
          )
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/1 invoice with invalid due date was skipped/i)).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(11);
    expect(screen.queryByText("#INV-11")).not.toBeInTheDocument();
    expect(screen.queryByText("#INV-12")).not.toBeInTheDocument();
    expect(screen.getByText("#INV-1")).toBeInTheDocument();
  });
});
