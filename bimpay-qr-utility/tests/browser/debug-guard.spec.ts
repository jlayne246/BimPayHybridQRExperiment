import { test, expect } from "@playwright/test";

test("debug build guard controls navigation and direct hash routes", async ({ page }, testInfo) => {
  const debugEnabled = testInfo.project.metadata.debugEnabled ?? (process.env.VITE_ENABLE_DEBUG === "true");
  await page.goto("/");
  const debugLink = page.getByRole("link", { name: "Debug QR Scheme" });
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
