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
async function generate(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Create Payment QR" }).click();
  await expect(page.getByText("QR generated.", { exact: true })).toBeVisible();
  await expect(page.getByAltText(/ preview$/)).toBeVisible();
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
