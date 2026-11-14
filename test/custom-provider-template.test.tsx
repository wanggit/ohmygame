// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomProviderForm } from "../src/renderer/custom-provider-dialog.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function labelControl(caption: string): HTMLSelectElement | HTMLInputElement {
  const label = [...host.querySelectorAll("label")].find((entry) => entry.textContent?.startsWith(caption));
  if (!label) throw new Error(`Missing label ${caption}`);
  return label.querySelector("select, input") as HTMLSelectElement | HTMLInputElement;
}

describe("custom provider template", () => {
  it("prefills the Agent Plan Base URL and preset, and restores a clean generic form", async () => {
    await act(async () => root.render(<CustomProviderForm onClose={() => {}} onSaved={() => {}} />));

    const template = labelControl("Provider template") as HTMLSelectElement;
    expect(template.value).toBe("generic");
    expect((labelControl("Base URL") as HTMLInputElement).value).toBe("");

    await act(async () => {
      template.value = "volcengine-agent-plan";
      template.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect((labelControl("Base URL") as HTMLInputElement).value).toBe("https://ark.cn-beijing.volces.com/api/plan/v3");
    expect(host.textContent).toContain("Agent Plan API key");

    // A user-typed endpoint survives switching; only the prefilled URL clears.
    await act(async () => {
      template.value = "generic";
      template.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect((labelControl("Base URL") as HTMLInputElement).value).toBe("");

    await act(async () => {
      template.value = "volcengine-agent-plan";
      template.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const baseUrl = labelControl("Base URL") as HTMLInputElement;
    await act(async () => {
      // Bypass React's value tracker with the native setter so onChange fires.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(baseUrl, "https://relay.example/v1");
      baseUrl.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      template.value = "generic";
      template.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect((labelControl("Base URL") as HTMLInputElement).value).toBe("https://relay.example/v1");
  });

  it("preselects Seedream/Seedance protocols when a use is ticked on a manual model", async () => {
    await act(async () => root.render(<CustomProviderForm onClose={() => {}} onSaved={() => {}} />));
    const template = labelControl("Provider template") as HTMLSelectElement;
    await act(async () => {
      template.value = "volcengine-agent-plan";
      template.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // The manual add section requires a model ID before its fields enable.
    const modelId = labelControl("Model ID") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(modelId, "doubao-seedream-5-0-pro");
      modelId.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const useBox = (caption: string): HTMLInputElement => {
      const label = [...host.querySelectorAll("label")].find((entry) => entry.textContent === caption);
      if (!label) throw new Error(`Missing use checkbox ${caption}`);
      return label.querySelector("input")!;
    };
    await act(async () => useBox("Image").click());
    await act(async () => useBox("Video").click());

    // The media protocol pickers appear under the use checkboxes, preselected
    // by the Agent Plan template — this is the setting users look for.
    expect((labelControl("Image protocol") as HTMLSelectElement).value).toBe("volcengine-images");
    expect((labelControl("Video protocol") as HTMLSelectElement).value).toBe("seedance");
  });
});