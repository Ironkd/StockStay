import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionMenu } from "./ActionMenu";

describe("ActionMenu", () => {
  it("keeps actions hidden until opened and invokes the selected action", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ActionMenu
        ariaLabel="Manage Cedar House"
        items={[{ label: "Edit property", onSelect }]}
      />
    );

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

    await user.click(screen.getByText("Manage"));
    await user.click(screen.getByRole("menuitem", { name: "Edit property" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
