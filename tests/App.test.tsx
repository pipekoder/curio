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
    screen.getByRole("button", { name: /Compose my edition/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", {
      name: /Generate my magazine|Read sample edition/,
    }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Skip to your edition" }),
  ).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
});

it("requires a valid mix and an aesthetic while keeping AI consent optional", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(<App />);
  const button = screen.getByRole("button", { name: /Compose my edition/ });
  expect(button).toHaveProperty("disabled", false);
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Editorial home weight" }),
    { target: { value: "70" } },
  );
  expect(button).toHaveProperty("disabled", true);
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Editorial home weight" }),
    { target: { value: "50" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Scandinavian" }));
  expect(button).toHaveProperty("disabled", true);
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
  fireEvent.click(screen.getByRole("button", { name: /Compose my edition/ }));
  expect(
    await screen.findByRole("heading", { name: "The art of quiet rooms" }),
  ).toBeTruthy();
  expect(JSON.parse(String(send.mock.calls[0][1]?.body)).consent).toBe(false);
});
it("blocks duplicate composition while a request is pending", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const send = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", send);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Compose my edition/ }));
  const busy = screen.getByRole("button", { name: "Composing your issue…" });
  expect(busy).toHaveProperty("disabled", true);
  fireEvent.click(busy);
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
  fireEvent.click(screen.getByRole("button", { name: /Compose my edition/ }));
  expect(
    await screen.findByRole("heading", { name: "The art of quiet rooms" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Acme manufactures this object from titanium."),
  ).toBeNull();
});
