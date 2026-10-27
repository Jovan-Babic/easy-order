// Warehouse guide: the computer portal (Magacin page, delivery note, Zalihe). Needs the portal running
// (npm run dev, BACKEND_URL=http://localhost:8000) and a freshly seeded backend; run it BEFORE
// capture_magacin.js changes the queue, or on a fresh seed.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { shot, union } = require('./lib');
const seed = require('./seed.json');
const O = process.argv[2] || 'out/';
const PORTAL = process.env.PORTAL || 'http://localhost:3100';
const CUST = 'Market Lipa'; // a new order of the seed (keks + čokolada); the first card with this name is the new one

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5, locale: 'sr-RS' });
  const page = await ctx.newPage();
  const wait = (ms = 800) => page.waitForTimeout(ms);
  await page.goto(PORTAL + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(3000); // let the page hydrate
  await page.locator('input[type="email"]').fill(seed.warehouse);
  await page.locator('input[type="password"]').fill(seed.password);
  await page.locator('button[type="submit"]').click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }); await wait(1500);
  // language: Serbian
  await page.evaluate((KEY) => { try { localStorage.setItem(KEY, 'sr'); } catch (e) {} }, 'easy-order-admin-lang');
  await page.goto(PORTAL + '/warehouse', { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(2500);
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
  const clip = { x: 0, y: 0, width: 1280, height: 760 };

  if (!process.env.ONLY) {
  // --- p1. queue and the order on the right
  await page.locator(`button:has-text("${CUST}")`).first().click(); await wait(1000);
  await shot(page, O + 'p1-magacin.png', [
    await union(page, [{ text: 'NOVA', exact: false, nth: 0 }, `button:has-text("${CUST}")`]).then((b) => ({ sel: b, n: 1, pad: 8 })),
    { sel: 'div.rounded-lg.p-6:has(h2)', n: 2, pad: 4, badge: 'right' },
    await union(page, [{ text: 'Preuzmi', exact: true }, { text: 'Otpremnica', exact: true }]).then((b) => ({ sel: b, n: 3, pad: 6, badge: 'right' })),
  ], clip);

  // --- p2. take it, enter the packed quantities
  await page.getByRole('button', { name: 'Preuzmi' }).click(); await wait(1500);
  const alls = page.getByRole('button', { name: 'Sve', exact: true });
  await alls.nth(0).click(); await wait(900);
  await alls.nth(1).click(); await wait(900);
  await shot(page, O + 'p2-pakovanje.png', [
    { sel: 'input[type=number] >> nth=0', n: 1, pad: 6 },
    { sel: { text: 'Sve', exact: true, nth: 0 }, n: 2, pad: 6, badge: 'right' },
    { sel: { text: 'Pošalji', exact: true }, n: 3, pad: 6 },
    { sel: { text: 'Vrati u red', exact: true }, n: 4, pad: 6 },
    { sel: { text: 'Otpremnica', exact: true }, n: 5, pad: 6, badge: 'right' },
  ], clip);

  // --- p3. delivery note
  await page.getByRole('button', { name: 'Otpremnica' }).click(); await wait(1500);
  await shot(page, O + 'p3-otpremnica.png', [
    { sel: { text: 'Otpremnica', exact: true, nth: 0 }, n: 1, pad: 6 },
    { sel: { text: 'Štampaj / Sačuvaj PDF', exact: true }, n: 2, pad: 6, badge: 'right' },
  ], { x: 0, y: 0, width: 1280, height: 860 });
  await page.keyboard.press('Escape'); await wait(500);
  }

  // --- p4. stock page
  await page.goto(PORTAL + '/stock', { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(2500);
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
  await shot(page, O + 'p4-stanje.png', [
    await union(page, [{ text: 'Artikli kojima ističe rok', exact: true }, { text: 'Otpiši', exact: true, nth: 0 }]).then((b) => ({ sel: b, n: 1, pad: 8 })),
    { sel: 'input[placeholder="Pretraga proizvoda"]', n: 2, pad: 2 },
    await union(page, [{ text: 'Prijem', exact: true, nth: 1 }, { text: 'Istorija', exact: true, nth: 1 }]).then((b) => ({ sel: b, n: 3, pad: 6, badge: 'right' })),
  ], { x: 0, y: 0, width: 1280, height: 860 });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
