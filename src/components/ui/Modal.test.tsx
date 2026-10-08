import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("keeps focus in an edited field across parent rerenders", () => {
    const onClose = vi.fn();
    const ModalHarness = () => {
      const [value, setValue] = useState("");
      return (
        <Modal open onClose={() => onClose()} title="Add item">
          <input aria-label="Item name" value={value} onChange={(event) => setValue(event.target.value)} />
        </Modal>
      );
    };
    render(<ModalHarness />);
    const input = screen.getByRole("textbox", { name: "Item name" });

    fireEvent.change(input, { target: { value: "Coffee" } });

    expect(input).toHaveValue("Coffee");
    expect(input).toHaveFocus();
  });
});
