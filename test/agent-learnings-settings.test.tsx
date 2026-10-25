// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentLearnings } from "../src/shared/agent-learnings.js";

const empty: AgentLearnings = { preferences: [], skills: [] };
const api = {
  getAgentLearnings: vi.fn(async () => empty),
  addAgentPreference: vi.fn(async (text: string) => ({
    preferences: [
      {
        id: "preference-1",
        text,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    skills: [],
  })),
  updateAgentPreference: vi.fn(async () => empty),
  deleteAgentPreference: vi.fn(async () => empty),
  deleteAgentSkill: vi.fn(async () => empty),
};
vi.doMock(path.resolve("src/renderer/api.ts"), async () => ({
  ...(await vi.importActual(path.resolve("src/renderer/api.ts"))),
  ...api,
}));
const { AgentLearningsSettings } =
  await import("../src/renderer/agent-learnings-settings.js");

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.getAgentLearnings.mockClear().mockResolvedValue(empty);
  api.addAgentPreference.mockClear();
  api.deleteAgentPreference.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(): Promise<void> {
  await act(async () => {
    root.render(<AgentLearningsSettings />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

it("lists saved lessons and adds a preference", async () => {
  api.getAgentLearnings.mockResolvedValue({
    preferences: [
      { id: "old", text: "Prefer pixel art.", createdAt: "", updatedAt: "" },
    ],
    skills: [
      {
        name: "sprite-sheet-animation",
        description: "Use when animating a character.",
        createdAt: "",
        updatedAt: "",
      },
    ],
  });
  await render();

  expect(container.textContent).toContain("Preferences and learned Skills");
  expect(container.textContent).toContain("Prefer pixel art.");
  expect(container.textContent).toContain("sprite-sheet-animation");
  expect(container.textContent).toContain("Use when animating a character.");

  const input = container.querySelector<HTMLInputElement>(
    ".agent-learnings-add input",
  );
  if (!input) throw new Error("Expected the add input");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "Generate sprite sheets.");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = container.querySelector<HTMLFormElement>(".agent-learnings-add");
  await act(async () => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(api.addAgentPreference).toHaveBeenCalledWith(
    "Generate sprite sheets.",
  );
  expect(container.textContent).toContain("Generate sprite sheets.");
});

it("deletes a preference after confirmation and keeps it when cancelled", async () => {
  api.getAgentLearnings.mockResolvedValue({
    preferences: [
      { id: "old", text: "Prefer pixel art.", createdAt: "", updatedAt: "" },
    ],
    skills: [],
  });
  await render();

  vi.mocked(window.confirm).mockReturnValue(false);
  const deleteButtons = [
    ...container.querySelectorAll<HTMLButtonElement>(
      ".agent-learnings-item button",
    ),
  ].filter((button) => button.textContent === "Delete");
  await act(async () => {
    deleteButtons[0]?.click();
  });
  expect(api.deleteAgentPreference).not.toHaveBeenCalled();

  vi.mocked(window.confirm).mockReturnValue(true);
  await act(async () => {
    deleteButtons[0]?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api.deleteAgentPreference).toHaveBeenCalledWith("old");
});
