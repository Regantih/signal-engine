import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const BASE_URL = "http://localhost:5000";

const pages = [
  { name: "Dashboard", path: "/" },
  { name: "Scanner", path: "/scanner" },
  { name: "Trading", path: "/trading" },
  { name: "Macro", path: "/macro" },
  { name: "Market", path: "/market" },
];

test.use({ viewport: MOBILE_VIEWPORT });

for (const page of pages) {
  test(`${page.name} - mobile screenshot`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const p = await context.newPage();
    await p.goto(`${BASE_URL}/#${page.path}`, { waitUntil: "load" });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `e2e/screenshots/${page.name.toLowerCase()}-mobile.png`, fullPage: true });
    await context.close();
  });

  test(`${page.name} - no horizontal overflow`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const p = await context.newPage();
    await p.goto(`${BASE_URL}/#${page.path}`, { waitUntil: "load" });
    await p.waitForTimeout(3000);

    const scrollWidth = await p.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await p.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px tolerance
    await context.close();
  });

  test(`${page.name} - bottom nav visible`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const p = await context.newPage();
    await p.goto(`${BASE_URL}/#${page.path}`, { waitUntil: "load" });
    await p.waitForTimeout(2000);

    const bottomNav = p.locator('[data-testid="bottom-nav"]');
    await expect(bottomNav).toBeVisible();
    await context.close();
  });

  test(`${page.name} - sidebar hidden on mobile`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const p = await context.newPage();
    await p.goto(`${BASE_URL}/#${page.path}`, { waitUntil: "load" });
    await p.waitForTimeout(2000);

    // Sidebar should be hidden on mobile (via lg:block, hidden by default)
    const sidebar = p.locator("aside");
    const isVisible = await sidebar.isVisible().catch(() => false);
    expect(isVisible).toBeFalsy();
    await context.close();
  });
}

test("Bottom nav - More menu opens and navigates", async ({ browser }) => {
  const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
  const p = await context.newPage();
  await p.goto(`${BASE_URL}/#/`, { waitUntil: "load" });
  await p.waitForTimeout(2000);

  // Click More button
  await p.click('[data-testid="bottom-nav-more"]');
  await p.waitForTimeout(500);

  // Should see the More menu with additional pages (in the overlay, not sidebar)
  const moreMenu = p.locator("text=More Pages");
  await expect(moreMenu).toBeVisible();

  await p.screenshot({ path: "e2e/screenshots/more-menu-mobile.png" });
  await context.close();
});

test("PWA manifest is accessible", async ({ browser }) => {
  const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
  const p = await context.newPage();
  await p.goto(`${BASE_URL}/#/`, { waitUntil: "load" });
  await p.waitForTimeout(1000);

  // Check manifest link exists
  const manifest = await p.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifest).toBe("/manifest.json");

  // Check theme-color meta
  const themeColor = await p.locator('meta[name="theme-color"]').getAttribute("content");
  expect(themeColor).toBe("#0d9488");

  await context.close();
});
