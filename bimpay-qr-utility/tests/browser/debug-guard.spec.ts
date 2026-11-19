import { test, expect } from "@playwright/test";

test("debug build guard controls navigation and direct hash routes", async ({ page }, testInfo) => {
  const debugEnabled = testInfo.project.metadata.debugEnabled ?? (process.env.VITE_ENABLE_DEBUG === "true");
  await page.goto("/");
  const debugLink = page.getByRole("link", { name: "Debug QR Scheme" });
  if (debugEnabled) {
    await expect(page.getByLabel("Upload QR logo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Logo", exact: true })).toBeVisible();
  } else {
    await expect(page.getByLabel("Upload QR logo")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "QR logo (optional)" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Logo", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use BiMPay Logo", exact: true })).toHaveCount(0);
  }
  if (debugEnabled) {
    await expect(debugLink).toHaveAttribute("href", "#/debug");
    await debugLink.click();
    await expect(page).toHaveURL(/#\/debug$/);
    await expect(page.getByLabel(/^59 Merchant Name/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Show Advanced" })).toBeVisible();
    await page.getByRole("link", { name: "Back to QR creator" }).click();
    await expect(page.getByLabel(/^Business name/)).toBeVisible();
  } else {
    await expect(debugLink).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Experiment with QR Scheme" })).toHaveCount(0);
  }
  for (const route of ["#/debug", "#/customise"]) {
    await page.goto(`/${route}`);
    if (debugEnabled) {
      await expect(page.getByLabel(/^59 Merchant Name/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Show Advanced" })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/#\/$/);
      await expect(page.getByLabel(/^Business name/)).toBeVisible();
      await expect(page.getByLabel(/^59 Merchant Name/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Show Advanced" })).toHaveCount(0);
    }
  }
});

test("advanced debug initiation and timer controls encode payloads and invalidate stale output", async ({ page }, testInfo) => {
  const debugEnabled = testInfo.project.metadata.debugEnabled ?? (process.env.VITE_ENABLE_DEBUG === "true");
  await page.goto("/#/debug");
  if (!debugEnabled) {
    await expect(page.getByLabel(/^01 Initiation Method/)).toHaveCount(0);
    await expect(page.getByLabel(/^80.02 Timer duration/)).toHaveCount(0);
    return;
  }
  await page.getByRole("button", { name: "Show Advanced" }).click();
  await page.getByLabel(/^59 Merchant Name/).fill("EXAMPLE CHARITY");
  await page.getByLabel(/^26.01 Financial Institution Alias/).fill("TESTBB");
  await page.getByLabel(/^26.02 Branch/).fill("TESTBB");
  await page.getByLabel(/^26.03 Account/).fill("00123");
  await page.getByLabel(/^26.04 Participant Code/).fill("00000");
  await page.getByLabel(/^01 Initiation Method/).selectOption("12");
  await page.getByLabel(/^80.02 Timer duration/).fill("1.5");
  await page.getByLabel(/^Timer unit/).selectOption("minutes");
  await expect(page.getByText(/Encoded 80.02: 00000090/)).toBeVisible();
  await page.getByRole("button", { name: "Generate QR Codes" }).click();
  await expect(page.getByText("QR generated.", { exact: true })).toBeVisible();
  const payload = await page.getByText(/^000201010212/).innerText();
  expect(payload).toContain("5403***");
  expect(payload).toContain("020800000090");
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
  await page.getByLabel(/^80.02 Timer duration/).fill("2");
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
  await page.getByLabel(/^Timer unit/).selectOption("seconds");
  await page.getByLabel(/^80.02 Timer duration/).fill("0.5");
  await expect(page.getByText(/The duration must convert to a whole number of seconds/)).toBeVisible();
});
