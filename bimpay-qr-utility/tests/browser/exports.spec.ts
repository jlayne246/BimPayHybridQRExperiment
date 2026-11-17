import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
async function validForm(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Business name", { exact: false }).fill("EXAMPLE SHOP");
  await page.getByLabel("Bank or credit union").selectOption("AFPUBBB2");
  await page.getByLabel(/^Branch/).selectOption("0");
  await page.getByLabel("Account / merchant number").fill("00123");
}
async function generate(page: import("@playwright/test").Page, previewVisible = true) {
  await page.getByRole("button", { name: "Create Payment QR" }).click();
  await expect(page.getByText("QR generated.", { exact: true })).toBeVisible();
  if (previewVisible) {
    const createCard = page.getByRole("button", { name: "Create a Payment Card" });
    if (await createCard.count()) await createCard.click();
    await expect(page.getByAltText(/ preview$/)).toBeVisible();
  }
}
test("real browser renders eight templates and downloads PNG/PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await validForm(page);
  await generate(page);
  // Test each of the three variable layouts in both orientations.
  for (const template of ["bimpay-accepted", "bimpay-merchant"]) {
    await page.getByLabel(/^Template/).selectOption(template);
    for (const orientation of ["Portrait", "Landscape"]) {
      await page.getByRole("button", { name: orientation, exact: true }).click();
      await expect(page.getByAltText(/ preview$/)).toBeVisible();
      await expect.poll(() => page.getByAltText(/ preview$/).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(orientation === "Landscape" ? 3508 : 2480);
    }
  }
  await page.getByLabel(/^Recipient type/).selectOption("organisation");
  await page.getByLabel("This QR code is for charitable donations").check();
  await page.getByLabel(/^Give to \/ Cause/).fill("ORGAN APPEAL");
  for (const orientation of ["Portrait", "Landscape"]) {
    await page.getByRole("button", { name: orientation, exact: true }).click();
    await expect(page.getByAltText(/Donations preview$/)).toBeVisible();
  }
  await page.getByLabel("How much will supporters give?").selectOption("fixed");
  await page.getByLabel(/^Amount/).fill("50.00");
  await generate(page);
  await page.getByRole("button", { name: "Portrait", exact: true }).click();
  await expect(page.getByAltText(/ preview$/)).toBeVisible();
  await page.getByRole("button", { name: "Landscape", exact: true }).click();
  await expect(page.getByAltText(/ preview$/)).toBeVisible();
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download as PNG" }).click();
  const png = await readFile((await (await pngDownload).path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([3508, 2480]);
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download as PDF" }).click();
  const file = await pdfDownload;
  const pdf = await PDFDocument.load(await readFile((await file.path())!));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPages()[0].getWidth()).toBeCloseTo(297 * 72 / 25.4);
  expect(pdf.getPages()[0].getHeight()).toBeCloseTo(210 * 72 / 25.4);
  await page.getByLabel("Organisation account number").fill("00999");
  await expect(page.getByRole("alert")).toContainText("Payment details have changed");
  await expect(page.getByRole("button", { name: "Download as PNG" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download as PDF" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("public QR API prepares logos and honours image dimensions and error correction", async ({ page }) => {
  await page.goto("/");
  const modulePath = `/@fs/${process.cwd()}/packages/bimpay-qr-generator/dist/index.js`;
  const result = await page.evaluate(async modulePath => {
    const api = await import(modulePath);
    const canvas = document.createElement("canvas");
    canvas.width = 200; canvas.height = 100;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, 200, 100);
    context.fillStyle = "blue"; context.fillRect(50, 25, 100, 50);
    const logo = await api.prepareQrLogo(canvas.toDataURL());
    const input = { merchantName: "EXAMPLE", fiAlias: "TEST", branchAlias: "TEST", participantCode: "00000", accountReference: "00123", timestamp: "20260501123456" };
    const plain = await api.generateBiMPayQr(input, { width: 512, errorCorrectionLevel: "Q", margin: 2 });
    const branded = await api.generateBiMPayQr(input, { width: 640, logo });
    const image = new Image(); image.src = branded.image; await image.decode();
    const plainImage = new Image(); plainImage.src = plain.image; await plainImage.decode();
    const logoImage = new Image(); logoImage.src = logo; await logoImage.decode();
    return { plainWidth: plainImage.naturalWidth, width: image.naturalWidth, height: image.naturalHeight, logoWidth: logoImage.naturalWidth, logoHeight: logoImage.naturalHeight, equivalent: plain.payload === branded.payload };
  }, modulePath);
  expect(result).toEqual({ plainWidth: 512, width: 640, height: 640, logoWidth: 102, logoHeight: 52, equivalent: true });
});

test("standalone QR dialog downloads a real 2048px PNG and closes with Escape", async ({ page }) => {
  await validForm(page);
  await expect(page.getByRole("button", { name: "Open high-resolution QR" })).toHaveCount(0);
  await generate(page, false);
  await page.getByRole("button", { name: "Open high-resolution QR" }).click();
  const dialog = page.getByRole("dialog", { name: "High-resolution payment QR" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.getByAltText("High-resolution payment QR").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(2048);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download QR PNG" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("example-shop-qr-2048.png");
  const png = await readFile((await file.path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2048, 2048]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open high-resolution QR" })).toBeFocused();
  await page.getByLabel("Account / merchant number").fill("00999");
  await expect(page.getByRole("button", { name: "Open high-resolution QR" })).toBeDisabled();
});

test("standalone panel sits above printable preview and exports QR-only PNG, PDF and sharing fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await validForm(page);
  await expect(page.getByRole("region", { name: "QR Code", exact: true })).toHaveCount(0);
  await generate(page, false);
  await expect(page.getByRole("region", { name: "QR Code", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "QR Payment Card", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create a Payment Card" }).click();
  const panel = page.getByRole("region", { name: "Standalone QR output" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Download QR as PNG" })).toBeEnabled();
  const position = await panel.evaluate(element => {
    const printable = document.getElementById("payment-card-preview-title")!;
    const card = document.querySelector('[aria-labelledby="payment-card-section-title"]')!;
    return {
      panelBottom: element.getBoundingClientRect().bottom,
      optionsTop: card.querySelector("select")!.getBoundingClientRect().top,
      printableTop: printable.getBoundingClientRect().top,
    };
  });
  expect(position.panelBottom).toBeLessThan(position.optionsTop);
  expect(position.optionsTop).toBeLessThan(position.printableTop);
  await expect(page.getByRole("heading", { name: "QR Code", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QR Payment Card", exact: true })).toBeVisible();
  await expect(page.getByText("Your payment QR is ready.", { exact: true })).toHaveCount(0);
  const qrSection = page.getByRole("region", { name: "QR Code", exact: true });
  const cardSection = page.getByRole("region", { name: "QR Payment Card", exact: true });
  const qrImage = await panel.getByAltText("Standalone payment QR").getAttribute("src");
  await expect(qrSection.locator("details")).toHaveCount(0);
  await expect(cardSection.locator("details")).toHaveCount(0);
  await cardSection.getByLabel("Paper size").selectOption("a5");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(panel).toBeVisible();
  await expect(cardSection.getByLabel("Paper size")).toHaveValue("a5");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  await expect(cardSection.getByLabel("Paper size")).toBeVisible();
  await expect(panel.getByAltText("Standalone payment QR")).toHaveAttribute("src", qrImage!);
  await cardSection.getByLabel("Paper size").selectOption("a4");
  let download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download QR as PNG" }).click();
  const pngFile = await download;
  const png = await readFile((await pngFile.path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2048, 2048]);
  download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download QR as PDF" }).click();
  const pdfFile = await download;
  const pdf = await PDFDocument.load(await readFile((await pdfFile.path())!));
  expect(pdf.getPages()[0].getWidth()).toBeCloseTo(100 * 72 / 25.4);
  expect(pdf.getPages()[0].getHeight()).toBeCloseTo(100 * 72 / 25.4);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Share QR image" }).click();
  expect((await download).suggestedFilename()).toBe("example-shop-qr-2048.png");
  await page.getByLabel("Account / merchant number").fill("00999");
  for (const name of ["Download QR as PNG", "Download QR as PDF", "Share QR image"]) {
    await expect(panel.getByRole("button", { name })).toBeDisabled();
  }
});

for (const width of [390, 1280]) {
  test(`QR-first flow reveals the optional card editor and preserves settings at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await validForm(page);
    const qrSection = page.getByRole("region", { name: "QR Code", exact: true });
    await expect(qrSection).toHaveCount(0);
    await expect(page.getByRole("region", { name: "QR Payment Card", exact: true })).toHaveCount(0);
    await generate(page, false);
    await expect(qrSection).toBeVisible();
    await expect(page.getByRole("region", { name: "QR Payment Card", exact: true })).toHaveCount(0);
    await expect(qrSection.getByText("Example only", { exact: true })).toBeVisible();
    const sample = qrSection.getByAltText("Example BiMPay Accepted Here payment card");
    await expect(sample).toBeVisible();
    await expect.poll(() => sample.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await qrSection.screenshot({ path: testInfo.outputPath("qr-first-output.png") });
    await page.getByRole("button", { name: "Create a Payment Card" }).click();
    const card = page.getByRole("region", { name: "QR Payment Card", exact: true });
    await expect(card.getByAltText(/ preview$/)).toBeVisible();
    await card.getByLabel("Paper size").selectOption("a5");
    await expect(card.locator("details")).toHaveCount(0);
    await expect(card.getByLabel("Paper size")).toBeVisible();
    await page.getByRole("button", { name: "Edit Payment Card" }).click();
    await expect(card.getByLabel("Paper size")).toHaveValue("a5");
    await expect(card.getByLabel("Paper size")).toBeVisible();
    await page.getByLabel("Account / merchant number").fill("");
    await page.getByRole("button", { name: "Create Payment QR" }).click();
    await expect(page.getByText(/Enter the recipient name, choose a bank and branch/)).toBeVisible();
    await expect(qrSection).toBeVisible();
    await page.getByLabel("Account / merchant number").fill("00123");
    await generate(page, false);
    await expect(qrSection).toBeVisible();
    await expect(card.getByLabel("Paper size")).toHaveValue("a5");
    await page.getByRole("button", { name: "Clear Form" }).click();
    await expect(qrSection).toHaveCount(0);
    await expect(page.getByRole("region", { name: "QR Payment Card", exact: true })).toHaveCount(0);
  });
}
