import { chromium } from "playwright";

const OUT =
  "C:/Users/hadal/AppData/Local/Temp/claude/C--Users-hadal-OneDrive-Desktop-playground-helpdesk/2551c26f-7f90-4972-b8ff-62a74bd9ec5c/scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

// Seed the stored preference the pre-paint script reads, so every page below
// loads straight into dark with no toggling.
await page.goto("http://localhost:3000/login");
await page.evaluate(() => localStorage.setItem("theme", "dark"));
await page.reload();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/d1-login.png` });

await page.fill('input[type="email"]', "admin@example.com");
await page.fill('input[type="password"]', "password123");
await page.click('button[type="submit"]');
await page.waitForURL("http://localhost:3000/");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/d2-dashboard.png`, fullPage: true });

await page.goto("http://localhost:3000/tickets");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/d3-tickets.png`, fullPage: true });

const link = page.locator('table a[href^="/tickets/"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/d4-detail.png`, fullPage: true });
}

await browser.close();
console.log("done");
