import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../src/App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("presents one primary editorial journey without competing legacy generators", () => {
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  render(<App />);
  expect(
    screen.getByRole("button", { name: /Generate magazine/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", {
      name: /Generate my magazine|Read sample edition/,
    }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Skip to magazine prompt" }),
  ).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
});

it("accepts one prompt without configuration controls and keeps consent optional", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(<App />);
  const button = screen.getByRole("button", { name: /Generate magazine/ });
  expect(button).toHaveProperty("disabled", true);
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByRole("button", { name: "Scandinavian" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Focused A closer study/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("Your discovery prompt"), { target: { value: "A quiet home with paper lamps" } });
  expect(button).toHaveProperty("disabled", false);
  expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
});
it("composes a local edition after a network failure without granting AI consent", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const send = vi.fn(async (_url: string, _options?: RequestInit) => {
    void _url;
    void _options;
    throw Error("offline");
  });
  vi.stubGlobal("fetch", send);
  render(<App />);
  fireEvent.change(screen.getByLabelText("Your discovery prompt"), { target: { value: "paper lamps and quiet reading rooms" } });
  fireEvent.click(screen.getByRole("button", { name: /Generate magazine/ }));
  expect(
    await screen.findByRole("region", { name: "Read and explore" }),
  ).toBeTruthy();
  expect(JSON.parse(String(send.mock.calls[0][1]?.body)).consent).toBe(false);
});
it("blocks duplicate composition while a request is pending", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const send = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", send);
  render(<App />);
  fireEvent.change(screen.getByLabelText("Your discovery prompt"), { target: { value: "paper lamps and quiet reading rooms" } });
  fireEvent.click(screen.getByRole("button", { name: /Generate magazine/ }));
  expect(screen.getByRole("region", { name: "Composing your magazine" }).getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByRole("button", { name: /Generate magazine/ })).toBeNull();
  expect(send).toHaveBeenCalledOnce();
});
it("rejects unsupported AI copy in successful responses and renders a safe authored edition", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { curationCatalog } = await import("../shared/catalog");
  const { fallbackPlan, defaultPreferences } =
    await import("../shared/editorial");
  const plan = fallbackPlan(defaultPreferences);
  plan.features[0].narrative = "Acme manufactures this object from titanium.";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        plan,
        items: curationCatalog,
        source: "meta",
        retrieval: "fictional",
        cached: false,
      }),
    ),
  );
  render(<App />);
  fireEvent.change(screen.getByLabelText("Your discovery prompt"), { target: { value: "paper lamps and quiet reading rooms" } });
  fireEvent.click(screen.getByRole("button", { name: /Generate magazine/ }));
  expect(
    await screen.findByRole("region", { name: "Read and explore" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Acme manufactures this object from titanium."),
  ).toBeNull();
});
