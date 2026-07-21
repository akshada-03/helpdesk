import { chromium } from "playwright";

const OUT =
  "C:/Users/hadal/AppData/Local/Temp/claude/C--Users-hadal-OneDrive-Desktop-playground-helpdesk/2551c26f-7f90-4972-b8ff-62a74bd9ec5c/scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

await page.goto("http://localhost:3000/login");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-login.png` });

await page.fill('input[type="email"]', "admin@example.com");
await page.fill('input[type="password"]', "password123");
await page.click('button[type="submit"]');
await page.waitForURL("http://localhost:3000/");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02-dashboard.png`, fullPage: true });

await page.goto("http://localhost:3000/tickets");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/03-tickets.png`, fullPage: true });

// First ticket detail, if there is one.
const link = page.locator('table a[href^="/tickets/"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/04-detail.png`, fullPage: true });
}

await page.goto("http://localhost:3000/users");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/05-users.png`, fullPage: true });

// Mobile check.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://localhost:3000/tickets");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/06-mobile-tickets.png`, fullPage: true });

await browser.close();
console.log("done");
