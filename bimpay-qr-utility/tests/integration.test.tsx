// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Generator from "../src/Generator";
import { renderPaymentQr, prepareQrLogo } from "bimpay-qr-generator";
import { renderPaymentCard, exportPaymentCardPdf } from "bimpay-payment-cards";
vi.mock("bimpay-qr-generator", async original => ({
  ...await original<typeof import("bimpay-qr-generator")>(),
  renderPaymentQr: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  prepareQrLogo: vi.fn().mockResolvedValue("data:image/png;base64,logo"),
}));
vi.mock("bimpay-payment-cards", async original => ({
  ...await original<typeof import("bimpay-payment-cards")>(),
  renderPaymentCard: vi.fn().mockResolvedValue("data:image/png;base64,card"),
  exportPaymentCardPdf: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));
const qr = vi.mocked(renderPaymentQr);
const card = vi.mocked(renderPaymentCard);
const pdf = vi.mocked(exportPaymentCardPdf);
function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(typeof label === "string" ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : label), { target: { value } });
}
async function validForm() {
  render(<Generator />);
  change("Business name", "EXAMPLE SHOP");
  change("Bank or credit union", "AFPUBBB2");
  change("Branch", "0");
  change("Account / merchant number", "00123");
}
function generate() { fireEvent.click(screen.getByRole("button", { name: "Create Payment QR" })); }
async function ready() {
  generate();
  await screen.findByText("QR generated.");
  await waitFor(() => expect(card).toHaveBeenCalled());
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  window.location.hash = "";
  vi.clearAllMocks();
  qr.mockReset().mockResolvedValue("data:image/png;base64,qr");
  card.mockReset().mockResolvedValue("data:image/png;base64,card");
  pdf.mockReset().mockResolvedValue(new Uint8Array([1]));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("workspace application integration", () => {
  it("generates the existing variable payload and passes a print-resolution image to cards", async () => {
    await validForm(); await ready();
    const payload = qr.mock.calls[0][0];
    expect(payload).toContain("5403***");
    expect(payload).toContain("1104QRBB");
    expect(payload).toContain("EXAMPLE SHOP");
    expect(qr.mock.calls[0][1]).toBe(380);
    expect(qr.mock.calls.some(call => call[1] > 720)).toBe(true);
    expect(card.mock.calls[0][0]).toMatchObject({ qr: "data:image/png;base64,qr", merchantName: "EXAMPLE SHOP" });
  });
  it("invalidates payment changes and prevents stale exports", async () => {
    await validForm(); await ready();
    change("Account / merchant number", "00999");
    expect(screen.getByText(/Payment details (?:have )?changed/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download as PNG" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Download as PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Share printable QR" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps QR current after paper or orientation changes", async () => {
    await validForm(); await ready();
    change("Paper size", "a5");
    fireEvent.click(screen.getByRole("button", { name: "Landscape" }));
    await waitFor(() => expect(card.mock.lastCall?.[0].templateId).toBe("bimpay-landscape"));
    expect(screen.queryByText(/Payment details (?:have )?changed/)).toBeNull();
    expect((screen.getByRole("button", { name: "Download as PNG" }) as HTMLButtonElement).disabled).toBe(false);
    expect(qr.mock.calls.filter(call => call[1] === 380)).toHaveLength(1);
  });
  it("keeps organisation distinct from donation and preserves fixed donation cause controls", async () => {
    await validForm();
    change("Recipient type", "organisation");
    expect(screen.queryByLabelText(/^Give to \/ Cause/)).toBeNull();
    fireEvent.click(screen.getByLabelText("This QR code is for charitable donations"));
    change("Give to / Cause", "ORGAN APPEAL");
    change("How much will supporters give?", "fixed");
    change("Amount", "50.00");
    await ready();
    expect(qr.mock.calls[0][0]).toContain("540550.00");
    expect(card.mock.lastCall?.[0]).toMatchObject({ templateId: "bimpay-fixed", fixedPrice: "BBD $50.00", isDonation: true, donationCause: "ORGAN APPEAL" });
    change("How much will supporters give?", "variable");
    expect((screen.getByLabelText(/^Give to \/ Cause/) as HTMLInputElement).value).toBe("ORGAN APPEAL");
    expect(screen.getByText(/Payment details (?:have )?changed/)).toBeTruthy();
    await ready();
    expect(card.mock.lastCall?.[0]).toMatchObject({ templateId: "bimpay-donations", fixedPrice: "" });
    change("Recipient type", "small-medium-business");
    expect(screen.queryByLabelText("This QR code is for charitable donations")).toBeNull();
    expect(screen.queryByLabelText(/^Give to \/ Cause/)).toBeNull();
  });
  it("invalidates a QR when recipient type changes encoded additional data", async () => {
    await validForm();
    change("Bill / invoice number", "BILL1");
    await ready();
    change("Recipient type", "organisation");
    expect(screen.getByText(/Payment details (?:have )?changed/)).toBeTruthy();
  });
  it("rejects an in-flight result after payment inputs change", async () => {
    const pending = deferred<string>(); qr.mockImplementationOnce(() => pending.promise);
    await validForm(); generate();
    change("Business name", "NEW SHOP");
    await act(async () => pending.resolve("old-qr"));
    expect(screen.getByText(/Payment details (?:have )?changed/)).toBeTruthy();
    expect(card).not.toHaveBeenCalled();
  });
  it("clear invalidates pending generations, including late errors", async () => {
    const pending = deferred<string>(); qr.mockImplementationOnce(() => pending.promise);
    await validForm(); generate();
    fireEvent.click(screen.getByRole("button", { name: "Clear Form" }));
    await act(async () => pending.reject(new Error("Old request failed")));
    expect(screen.getByText("Form cleared.")).toBeTruthy();
    expect(screen.queryByText("Old request failed")).toBeNull();
    expect(card).not.toHaveBeenCalled();
  });
  it("older generation cannot overwrite a newer generation after reset", async () => {
    const old = deferred<string>(); qr.mockImplementationOnce(() => old.promise);
    await validForm(); generate();
    fireEvent.click(screen.getByRole("button", { name: "Clear Form" }));
    change("Business name", "NEW SHOP"); change("Bank or credit union", "AFPUBBB2"); change("Branch", "0"); change("Account / merchant number", "00999");
    await ready();
    const calls = card.mock.calls.length;
    await act(async () => old.resolve("old-qr"));
    expect(card.mock.calls).toHaveLength(calls);
    expect(card.mock.lastCall?.[0].merchantName).toBe("NEW SHOP");
    expect(screen.getByText("QR generated.")).toBeTruthy();
  });
  it("blocks an export that finishes after payment details change", async () => {
    await validForm(); await ready();
    const pending = deferred<string>(); card.mockImplementationOnce(() => pending.promise);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Download as PNG" }));
    await waitFor(() => expect(card.mock.calls.length).toBeGreaterThan(1));
    change("Business name", "NEW SHOP");
    await act(async () => pending.resolve("old-card"));
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByText(/Payment details or flyer settings changed/)).toBeTruthy();
  });
  it("logo changes invalidate generated QR", async () => {
    await validForm(); await ready();
    fireEvent.change(screen.getByLabelText("Upload QR logo"), { target: { files: [new File(["image"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(prepareQrLogo).toHaveBeenCalled());
    await screen.findByText(/Payment details (?:have )?changed/);
  });
});

it("disables technical copy/share when payment fields become stale", async () => {
  await validForm(); await ready();
  act(() => { window.location.hash = "#/customise"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect((screen.getByRole("button", { name: "Copy", exact: true }) as HTMLButtonElement).disabled).toBe(false);
  change("59 Merchant Name", "NEW SHOP");
  expect((screen.getByRole("button", { name: "Copy", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Share QR", exact: true }) as HTMLButtonElement).disabled).toBe(true);
});
it("does not share a pending raw QR after its technical view unmounts", async () => {
  await validForm(); await ready();
  act(() => { window.location.hash = "#/customise"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  const share = vi.fn(); const copy = vi.fn();
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Share QR", exact: true }));
  act(() => { window.location.hash = "#/"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  await act(async () => pending.resolve({ blob: async () => new Blob(["png"], { type: "image/png" }) } as Response));
  expect(share).not.toHaveBeenCalled();
  expect(copy).not.toHaveBeenCalled();
});

function mockDialog() {
  // jsdom has no native dialog lifecycle; actual behaviour is checked in Chromium.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
}
it("renders a standalone 2048px QR from the current payload and preserves flyer-only validity", async () => {
  mockDialog(); await validForm(); await ready();
  fireEvent.click(screen.getByRole("button", { name: "Open high-resolution QR" }));
  await screen.findByAltText("High-resolution payment QR");
  expect(qr).toHaveBeenCalledWith(qr.mock.calls[0][0], 2048, "", 4);
  change("Paper size", "a5");
  expect(screen.getByRole("dialog")).toBeTruthy();
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("example-shop-qr-2048.png");
    expect(this.href).toBe("data:image/png;base64,qr");
  });
  fireEvent.click(screen.getByRole("button", { name: "Download QR PNG" }));
  expect(click).toHaveBeenCalledOnce();
  change("Account / merchant number", "00999");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect((screen.getByRole("button", { name: "Open high-resolution QR" }) as HTMLButtonElement).disabled).toBe(true);
});
it("discards a pending standalone QR when payment details change", async () => {
  mockDialog(); await validForm(); await ready();
  const pending = deferred<string>();
  qr.mockImplementation((_payload, width) => width === 2048 ? pending.promise : Promise.resolve("data:image/png;base64,qr"));
  fireEvent.click(screen.getByRole("button", { name: "Open high-resolution QR" }));
  expect((screen.getByRole("button", { name: "Download QR PNG" }) as HTMLButtonElement).disabled).toBe(true);
  change("Business name", "NEW SHOP");
  await act(async () => pending.resolve("old-standalone-qr"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByAltText("High-resolution payment QR")).toBeNull();
});

it("prevents pending standalone sharing from delivering an image after payment changes", async () => {
  await validForm(); await ready();
  await waitFor(() => expect((screen.getByRole("button", { name: "Share QR image" }) as HTMLButtonElement).disabled).toBe(false));
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  const share = vi.fn();
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Share QR image" }));
  change("Account / merchant number", "00999");
  await act(async () => pending.resolve({ blob: async () => new Blob(["png"], { type: "image/png" }) } as Response));
  expect(share).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
  for (const name of ["Download QR as PNG", "Download QR as PDF", "Share QR image"]) {
    expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  }
});
