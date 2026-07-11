import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  listEntries: vi.fn(),
  removeEntry: vi.fn(async () => {}),
  deleteFiles: vi.fn(async () => {}),
  revealItemInDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => `asset://${p}` }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: h.revealItemInDir }));
vi.mock("./entries-store", () => ({ listEntries: h.listEntries, removeEntry: h.removeEntry }));
vi.mock("./library-client", () => ({ deleteFiles: h.deleteFiles }));

import { LibraryView } from "./library-view";
import type { Entry } from "./entries-store";

const makeEntry = (i: number): Entry =>
  ({
    id: `id-${i}`,
    path: `/movies/rec-${i}.mp4`,
    thumbPath: `/thumbs/rec-${i}.jpg`,
    name: `log-${i}`,
    logNo: i,
    durationSec: 65,
    dateISO: "2026-07-11T09:05:00.000Z",
    city: "HANOI",
    size: 5 * 1024 * 1024,
  }) as unknown as Entry;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("LibraryView", () => {
  it("shows the empty state when there are no recordings", async () => {
    h.listEntries.mockResolvedValue([]);
    render(<LibraryView onClose={() => {}} />);
    expect(await screen.findByText("No recordings yet.")).toBeInTheDocument();
    expect(screen.getByText("LOG LIBRARY · 0")).toBeInTheDocument();
  });

  it("renders entry cards with name + count", async () => {
    h.listEntries.mockResolvedValue([makeEntry(1), makeEntry(2)]);
    render(<LibraryView onClose={() => {}} />);
    expect(await screen.findByText("LOG-1 #1")).toBeInTheDocument();
    expect(screen.getByText("LOG-2 #2")).toBeInTheDocument();
    expect(screen.getByText("LOG LIBRARY · 2")).toBeInTheDocument();
  });

  it("paginates at 6 per page", async () => {
    h.listEntries.mockResolvedValue(Array.from({ length: 7 }, (_, i) => makeEntry(i + 1)));
    render(<LibraryView onClose={() => {}} />);
    await screen.findByText("LOG-1 #1");
    expect(screen.getByText("PAGE 1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "‹ PREV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "NEXT ›" }));
    expect(screen.getByText("PAGE 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("LOG-7 #7")).toBeInTheDocument(); // 7th entry on page 2
    expect(screen.getByRole("button", { name: "NEXT ›" })).toBeDisabled();
  });

  it("requires a second click to delete, then removes the file + index entry", async () => {
    h.listEntries.mockResolvedValue([makeEntry(1)]);
    render(<LibraryView onClose={() => {}} />);
    await screen.findByText("LOG-1 #1");
    fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
    expect(h.deleteFiles).not.toHaveBeenCalled(); // first click only arms confirm
    fireEvent.click(screen.getByRole("button", { name: "CONFIRM?" }));
    await waitFor(() => expect(h.deleteFiles).toHaveBeenCalledWith(["/movies/rec-1.mp4", "/thumbs/rec-1.jpg"]));
    expect(h.removeEntry).toHaveBeenCalledWith("id-1");
  });

  it("reveals the file in its folder", async () => {
    h.listEntries.mockResolvedValue([makeEntry(1)]);
    render(<LibraryView onClose={() => {}} />);
    await screen.findByText("LOG-1 #1");
    fireEvent.click(screen.getByRole("button", { name: "REVEAL" }));
    expect(h.revealItemInDir).toHaveBeenCalledWith("/movies/rec-1.mp4");
  });

  it("opens the player on PLAY", async () => {
    h.listEntries.mockResolvedValue([makeEntry(1)]);
    const { container } = render(<LibraryView onClose={() => {}} />);
    await screen.findByText("LOG-1 #1");
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PLAY" }));
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "asset:///movies/rec-1.mp4");
  });

  it("closes via the ✕ button", async () => {
    h.listEntries.mockResolvedValue([]);
    const onClose = vi.fn();
    render(<LibraryView onClose={onClose} />);
    await screen.findByText("No recordings yet.");
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onClose).toHaveBeenCalled();
  });
});
