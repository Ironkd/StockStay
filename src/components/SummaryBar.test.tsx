import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryBar } from "./SummaryBar";
import { InventoryItem } from "../types";

describe("SummaryBar", () => {
  const createItem = (
    quantity: number,
    reorderPoint: number = 10
  ): InventoryItem => ({
    id: crypto.randomUUID(),
    name: "Test Item",
    sku: "TEST-001",
    category: "Test",
    location: "Warehouse",
    quantity,
    unit: "pcs",
    reorderPoint,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  it("displays correct counts for visible items", () => {
    const items = [
      createItem(5),
      createItem(15),
      createItem(0)
    ];
    const filteredItems = [items[0], items[1]]; // Only first 2 items visible

    render(<SummaryBar items={items} filteredItems={filteredItems} />);

    expect(screen.getByText("Visible items")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("calculates total quantity correctly", () => {
    const items = [createItem(5), createItem(10), createItem(3)];
    const filteredItems = items;

    render(<SummaryBar items={items} filteredItems={filteredItems} />);

    expect(screen.getByText("Total quantity")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("identifies low stock items correctly", () => {
    const items = [
      createItem(5, 10),  // Low stock (5 <= 10)
      createItem(10, 10), // Low stock (10 <= 10)
      createItem(15, 10)  // In stock (15 > 10)
    ];
    const filteredItems = items;

    render(<SummaryBar items={items} filteredItems={filteredItems} />);

    expect(screen.getByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("identifies out of stock items correctly", () => {
    const items = [
      createItem(0),  // Out of stock
      createItem(5),  // In stock
      createItem(0)   // Out of stock
    ];
    const filteredItems = items;

    render(<SummaryBar items={items} filteredItems={filteredItems} />);

    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("handles empty filtered items", () => {
    const items = [createItem(5), createItem(10)];
    const filteredItems: InventoryItem[] = [];

    render(<SummaryBar items={items} filteredItems={filteredItems} />);

    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // Total quantity
  });
});
