import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InventoryForm } from "./InventoryForm";
import { InventoryItem } from "../types";

describe("InventoryForm", () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with all fields", () => {
    render(<InventoryForm onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sku/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reorder point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("submits form with correct values", async () => {
    const user = userEvent.setup();
    render(<InventoryForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByLabelText(/name/i), "USB Cable");
    await user.type(screen.getByLabelText(/sku/i), "USB-001");
    await user.type(screen.getByLabelText(/category/i), "Cables");
    await user.type(screen.getByLabelText(/location/i), "Warehouse A");
    await user.type(screen.getByLabelText(/quantity/i), "10");
    await user.type(screen.getByLabelText(/unit/i), "pcs");
    await user.type(screen.getByLabelText(/reorder point/i), "5");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "USB Cable",
          sku: "USB-001",
          category: "Cables",
          location: "Warehouse A",
          quantity: 10,
          unit: "pcs",
          reorderPoint: 5
        })
      );
    });
  });

  it("pre-fills form when editing an item", () => {
    const item: InventoryItem = {
      id: "123",
      name: "Existing Item",
      sku: "EXIST-001",
      category: "Electronics",
      location: "Shelf 1",
      quantity: 20,
      unit: "boxes",
      reorderPoint: 10,
      tags: ["critical", "fragile"],
      notes: "Handle with care",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    render(
      <InventoryForm
        initialValues={item}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByDisplayValue("Existing Item")).toBeInTheDocument();
    expect(screen.getByDisplayValue("EXIST-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Electronics")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Shelf 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByDisplayValue("boxes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("critical, fragile")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Handle with care")).toBeInTheDocument();
  });

  it("shows cancel button when editing", () => {
    const item: InventoryItem = {
      id: "123",
      name: "Test Item",
      sku: "TEST-001",
      category: "",
      location: "",
      quantity: 0,
      unit: "pcs",
      reorderPoint: 0,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    render(
      <InventoryForm
        initialValues={item}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(
      screen.getByRole("button", { name: /cancel/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const item: InventoryItem = {
      id: "123",
      name: "Test Item",
      sku: "TEST-001",
      category: "",
      location: "",
      quantity: 0,
      unit: "pcs",
      reorderPoint: 0,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    render(
      <InventoryForm
        initialValues={item}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it("parses tags from comma-separated string", async () => {
    const user = userEvent.setup();
    render(<InventoryForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByLabelText(/name/i), "Test Item");
    await user.type(screen.getByLabelText(/sku/i), "TEST-001");
    await user.type(
      screen.getByLabelText(/tags/i),
      "critical, fragile, important"
    );

    await user.click(screen.getByRole("button", { name: /add item/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ["critical", "fragile", "important"]
        })
      );
    });
  });
});
