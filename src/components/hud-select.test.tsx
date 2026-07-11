import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HudSelect, type HudOption } from "./hud-select";

const OPTIONS: HudOption[] = [
  { id: "a", label: "Camera A" },
  { id: "b", label: "Camera B" },
];

afterEach(cleanup);

describe("HudSelect", () => {
  it("shows the current option's label, and — when nothing matches", () => {
    const { rerender } = render(<HudSelect value="b" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByText("Camera B")).toBeInTheDocument();
    rerender(<HudSelect value="zzz" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opens the menu on click and lists all options", () => {
    render(<HudSelect value="a" options={OPTIONS} onChange={() => {}} />);
    expect(screen.queryByText("Camera B")).not.toBeInTheDocument(); // closed
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Camera B")).toBeInTheDocument(); // menu open
  });

  it("calls onChange with the option id and closes the menu", () => {
    const onChange = vi.fn();
    render(<HudSelect value="a" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button")); // open
    fireEvent.click(screen.getByText("Camera B")); // pick
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByText("Camera B")).not.toBeInTheDocument(); // closed again
  });

  it("does not open when disabled", () => {
    render(<HudSelect value="a" options={OPTIONS} onChange={() => {}} disabled />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(screen.queryByText("Camera B")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", () => {
    render(<HudSelect value="a" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button")); // open
    expect(screen.getByText("Camera B")).toBeInTheDocument();
    fireEvent.mouseDown(document.body); // outside click
    expect(screen.queryByText("Camera B")).not.toBeInTheDocument();
  });
});
