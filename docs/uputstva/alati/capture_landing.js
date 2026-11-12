// Clean screenshots (no numbered frames) for the public website, landing/public/screens.
// Run on a freshly seeded throw-away backend (seed.py + seed_admin.py), with the web build on :8099 and the
// portal on :3100 (as for capture_admin.js). Then: python3 finalize_landing.py <out> ../../../landing/public/screens
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { open, login } = require('./lib');
const seed = require('./seed.json');
const O = process.argv[2] || 'out/';
const PORTAL = process.env.PORTAL || 'http://localhost:3100';
const P = (k) => seed.products[k];
const [, , , , O5] = seed.orders;

(async () => {
  // --- sales rep: a customer picked and two quantities typed
  {
    const { browser, page } = await open();
    const wait = (ms = 700) => page.waitForTimeout(ms);
    await login(page, seed.operator, seed.password); await wait(1500);
    await page.getByTestId('customer-picker-button').click(); await wait();
    await page.getByTestId(`customer-option-${seed.customers['Maxi Market d.o.o.']}`).click(); await wait();
    await page.getByTestId(`qty-input-${P('jogurt')}`).fill('24');
    await page.getByTestId(`qty-input-${P('mleko')}`).fill('36'); await wait();
    await page.screenshot({ path: O + 'katalog.png' });
    await browser.close();
  }
  // --- warehouse: an order being packed
  {
    const { browser, page } = await open();
    const wait = (ms = 700) => page.waitForTimeout(ms);
    const tid = (id) => page.getByTestId(id);
    await login(page, seed.warehouse, seed.password); await wait(1800);
    await tid('card-orders').click(); await wait(1500);
    await page.setViewportSize({ width: 390, height: 1100 }); await wait();
    await tid(`pack-order-${O5}`).getByText('Delikates Sunce').click(); await wait();
    await tid(`take-${O5}`).click(); await wait(1500);
    for (const k of ['sok', 'jogurt']) { await tid(`pick-${O5}-${P(k)}`).click(); await wait(600); }
    const c = await tid(`pack-order-${O5}`).boundingBox();
    await page.screenshot({ path: O + 'pakovanje.png', clip: { x: 0, y: Math.max(0, c.y - 12), width: 390, height: c.height + 24 } });
    await browser.close();
  }
  // --- portal: the admin's reports
  {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: 'sr-RS' });
    const page = await ctx.newPage();
    const wait = (ms = 900) => page.waitForTimeout(ms);
    const hide = () => page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
    await page.goto(PORTAL + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(3000);
    await page.evaluate(() => localStorage.setItem('easy-order-admin-lang', 'sr'));
    await page.reload({ waitUntil: 'domcontentloaded' }); await wait(2500);
    await page.locator('input[type="email"]').fill(seed.admin);
    await page.locator('input[type="password"]').fill(seed.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
    await page.goto(PORTAL + '/reports', { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(3500); await hide();
    // the billing notice of the demo client is not part of the product shot
    await page.evaluate(() => [...document.querySelectorAll('main div')].find((d) => d.textContent.startsWith('Novo zaduženje'))?.remove());
    await wait(300);
    await page.screenshot({ path: O + 'izvestaji.png', clip: { x: 0, y: 0, width: 1280, height: 680 } });
    await browser.close();
  }
})();
