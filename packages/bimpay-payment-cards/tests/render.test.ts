// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import templateHashes from "./template-sha256.json";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { renderPaymentCard, resolveTemplateUrl, templateDimensions, outputDimensions, paymentCardPdfDimensions, exportPaymentCardPdf } from "../src/index.js";
import type { QrExportTemplateId } from "../src/index.js";
const ids: QrExportTemplateId[] = ["bimpay-accepted", "bimpay-merchant", "bimpay-donations", "bimpay-fixed", "bimpay-landscape", "bimpay-landscape-merchant", "bimpay-landscape-donations", "bimpay-landscape-fixed"];
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
let commands: unknown[];
let canvas: HTMLCanvasElement;
beforeEach(() => {
  commands = [];
  vi.stubGlobal("Image", class {
    naturalWidth = 720; naturalHeight = 720; onload?: () => void; onerror?: () => void;
    _src = "";
    set src(value: string) { this._src = value; queueMicrotask(() => value === "bad" ? this.onerror?.() : this.onload?.()); }
    get src() { return this._src; }
  });
  vi.stubGlobal("FontFace", class { async load() { return this; } });
  Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn(), load: vi.fn().mockResolvedValue([]) } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function(this: HTMLCanvasElement) {
    canvas = this;
    const context = new Proxy({ measureText: (text: string) => ({ width: text.length * 43 }) } as unknown as CanvasRenderingContext2D, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => commands.push([key, ...args.map(arg => typeof arg === "object" && arg && "src" in arg ? String(arg.src).match(/bimpay-[^/]+\.svg/)?.[0] ?? "qr-image" : arg)]);
      },
      set(target, key, value) { commands.push([key, value]); Reflect.set(target, key, value); return true; },
    });
    return context;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
});
describe("payment-card assets and print configuration", () => {
  it.each(ids)("resolves bundled template %s", id => {
    const url = resolveTemplateUrl(id);
    expect(url).toContain(`${id}.svg`);
    expect(createHash("sha256").update(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), `../assets/${id}.svg`))).digest("hex")).toBe(templateHashes[`${id}.svg`]);
    expect(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), `../assets/${id}.svg`), "utf8")).toContain("<svg");
    expect(resolveTemplateUrl(id, { [id]: "https://example.test/custom.svg" })).toBe("https://example.test/custom.svg");
  });
  it("rejects unknown templates", () => expect(() => resolveTemplateUrl("unknown" as QrExportTemplateId)).toThrow("Unknown"));
  it("retains portrait, landscape and paper dimensions", () => {
    expect(templateDimensions("bimpay-fixed")).toEqual({ width: 1134, height: 1701 });
    expect(templateDimensions("bimpay-landscape-fixed")).toEqual({ width: 1701, height: 1134 });
    expect(outputDimensions("bimpay-fixed", "a4")).toMatchObject({ width: 2480, height: 3508 });
    expect(outputDimensions("bimpay-landscape", "a5")).toMatchObject({ width: 2480, height: 1748 });
    expect(paymentCardPdfDimensions("bimpay-fixed")).toEqual({ width: 283.5, height: 425.25 });
    expect(paymentCardPdfDimensions("bimpay-landscape", "a4").width).toBeCloseTo(841.8898);
  });
  it.each(ids)("retains original drawing layout for %s", async templateId => {
    expect(await renderPaymentCard({ templateId, qr: png, merchantName: "EXAMPLE ORGANISATION", donationCause: "ORGAN APPEAL", fixedDescription: "EVENT TICKETS", fixedPrice: "BBD $50.00" })).toBe(png);
    expect([canvas.width, canvas.height]).toEqual(templateId.includes("landscape") ? [1701, 1134] : [1134, 1701]);
    expect(commands).toMatchSnapshot();
  });
  it.each(["bimpay-fixed", "bimpay-landscape-fixed"] as const)("retains fixed-donation heading and two-line wrapping: %s", async templateId => {
    await renderPaymentCard({ templateId, qr: png, merchantName: "EXAMPLE", fixedPrice: "BBD $50.00", donationCause: "A VERY LONG ORGAN APPEAL", isDonation: true });
    expect(commands).toMatchSnapshot();
    expect(commands).toContainEqual(expect.arrayContaining(["fillText", "GIVE BBD $50.00"]));
    expect(commands).toContainEqual(expect.arrayContaining(["fillText", "TO"]));
  });
  it("prevents unsupported fixed-card inputs", async () => {
    await expect(renderPaymentCard({ templateId: "bimpay-fixed", qr: png, merchantName: "X" })).rejects.toThrow("fixed-amount");
    await expect(renderPaymentCard({ templateId: "bimpay-fixed", qr: png, merchantName: "X", fixedPrice: "BBD $5.00", fixedDescription: "x".repeat(31) })).rejects.toThrow("30");
  });
  it("reports unavailable QR images", async () => {
    await expect(renderPaymentCard({ templateId: "bimpay-accepted", qr: "bad", merchantName: "X" })).rejects.toThrow("load");
  });
  it.each(["a4", "a5", "original"] as const)("exports real PDF with %s page geometry and metadata", async size => {
    const bytes = await exportPaymentCardPdf(png, { templateId: "bimpay-landscape", size, title: "Example card" });
    const pdf = await PDFDocument.load(bytes);
    const expected = paymentCardPdfDimensions("bimpay-landscape", size);
    expect(pdf.getPages()[0].getSize()).toEqual(expected);
    expect(pdf.getTitle()).toBe("Example card");
    expect(pdf.getPageCount()).toBe(1);
  });
  it("centres original artwork with preserved aspect ratio on A4", async () => {
    await renderPaymentCard({ templateId: "bimpay-accepted", qr: png, merchantName: "X", outputSize: "a4" });
    expect([canvas.width, canvas.height]).toEqual([2480, 3508]);
    expect(commands).toContainEqual(["scale", 3508 / 1701, 3508 / 1701]);
    const translation = commands.find((command: any) => command[0] === "translate") as number[];
    expect(translation[1]).toBeCloseTo((2480 - 1134 * (3508 / 1701)) / 2);
    expect(translation[2]).toBeCloseTo(0);
  });
});
