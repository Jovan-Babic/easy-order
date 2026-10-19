// Screenshot helpers for the user guide: phone viewport + numbered highlight frames.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const APP = 'http://localhost:8099';

async function open() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'sr-RS' });
  const page = await ctx.newPage();
  return { browser, page };
}

// targets: [{ sel, n, pad }] - sel is a CSS selector or {testid}; n = number shown in the badge.
function locate(page, sel) {
  if (typeof sel === 'string') return page.locator(sel).first();
  if (sel.testid) return page.getByTestId(sel.testid).nth(sel.nth ?? 0);
  if (sel.text) return page.getByText(sel.text, { exact: sel.exact ?? true }).nth(sel.nth ?? 0);
  if (sel.box) return { boundingBox: async () => sel.box };
  throw new Error('bad selector');
}

// Union of several elements' boxes (to frame a group, e.g. label + field).
async function union(page, sels) {
  const boxes = [];
  for (const s of sels) { const b = await locate(page, s).boundingBox(); if (b) boxes.push(b); }
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.width)), btm = Math.max(...boxes.map((b) => b.y + b.height));
  return { box: { x, y, width: r - x, height: btm - y } };
}

async function mark(page, targets) {
  await page.evaluate(() => document.querySelectorAll('.guide-mark').forEach((e) => e.remove()));
  for (const t of targets) {
    const loc = locate(page, t.sel);
    const box = await loc.boundingBox();
    if (!box) { console.log('no box for', JSON.stringify(t.sel)); continue; }
    await page.evaluate(({ box, n, pad, badge }) => {
      const p = pad ?? 4;
      const d = document.createElement('div');
      d.className = 'guide-mark';
      Object.assign(d.style, {
        position: 'fixed', left: `${box.x - p}px`, top: `${box.y - p}px`, width: `${box.width + 2 * p}px`, height: `${box.height + 2 * p}px`,
        border: '3px solid #F97316', borderRadius: '10px', boxShadow: '0 0 0 3px rgba(249,115,22,0.25)', zIndex: 99999, pointerEvents: 'none', boxSizing: 'border-box',
      });
      if (n) {
        const b = document.createElement('div');
        b.textContent = n;
        const pos = badge === 'right' ? { right: '-12px' } : { left: '-12px' };
        Object.assign(b.style, {
          position: 'absolute', top: '-12px', ...pos, width: '24px', height: '24px', borderRadius: '12px', background: '#F97316', color: '#fff',
          font: '700 14px/24px sans-serif', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        });
        d.appendChild(b);
      }
      document.body.appendChild(d);
    }, { box, n: t.n, pad: t.pad, badge: t.badge });
  }
}

async function shot(page, file, targets = [], clip) {
  await mark(page, targets);
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, clip });
  await page.evaluate(() => document.querySelectorAll('.guide-mark').forEach((e) => e.remove()));
}

async function login(page, email, password) {
  await page.goto(APP + '/login', { waitUntil: 'networkidle' });
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForTimeout(3000);
}

module.exports = { open, mark, shot, login, locate, union, APP };
