// Operator guide, part 2: goods in focus and "Moj učinak". Run after capture_operator.js on the same
// (throw-away) backend: it creates the focus items, targets and a few orders by itself.
const { open, shot, login, union } = require('./lib');
const seed = require('./seed.json'); // written by seed.py
const API = 'http://localhost:8000/api';
const O = process.argv[2] || 'out/';
const P = (k) => seed.products[k];

async function api(path, opts = {}, token) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}
const post = (path, body, token) => api(path, { method: 'POST', body: JSON.stringify(body) }, token);
const put = (path, body, token) => api(path, { method: 'PUT', body: JSON.stringify(body) }, token);

(async () => {
  const admin = (await post('/auth/login', { email: seed.admin, password: seed.password })).access_token;
  const rep = (await post('/auth/login', { email: seed.operator, password: seed.password })).access_token;
  const me = await api('/auth/me', {}, rep);

  // Focus first, so the order lines below remember it.
  await post('/focus', { product_id: P('sok'), reason: 'expiry', note: 'Kratak rok - ponudite svim kupcima', recommended_discount: 5 }, admin);
  await post('/focus', { product_id: P('plazma'), reason: 'stock', note: 'Višak na lageru' }, admin);
  const month = new Date().toISOString().slice(0, 7);
  await put('/targets', { user_id: me.id, period_type: 'month', period: month, values: { revenue: 120000, orders: 10, customers: 5, focus_revenue: 30000 } }, admin);
  const line = (k, q, a = 0) => ({ product_id: P(k), ordered_qty: q, additional_discount: a });
  for (const [cust, lines] of [
    ['Market Lipa', [line('plazma', 60), line('sok', 48, 5)]],
    ['Delikates Sunce', [line('plazma', 40), line('voda', 120)]],
    ['Prodavnica Kod Mike', [line('sok', 24, 5), line('jogurt', 36, 2)]],
  ]) await post('/orders', { customer_id: seed.customers[cust], items: lines }, rep);

  const { browser, page } = await open();
  const wait = (ms = 700) => page.waitForTimeout(ms);
  await login(page, seed.operator, seed.password); await wait(1800);

  // --- 18. goods in focus in the catalog
  await shot(page, O + '18-fokus-katalog.png', [
    { sel: { testid: 'focus-chip' }, n: 1 },
    await union(page, [{ testid: `focus-${P('sok')}` }]).then((b) => ({ sel: b, n: 2, badge: 'right' })),
    { sel: { testid: `focus-apply-${P('sok')}` }, n: 3, badge: 'right', pad: 8 },
  ], { x: 0, y: 0, width: 390, height: 700 });

  // --- 19. "Primeni" sets the recommended additional discount
  await page.getByTestId('product-search-input').fill('sok od'); await wait();
  await page.getByTestId(`focus-apply-${P('sok')}`).click(); await wait();
  await page.getByTestId(`qty-input-${P('sok')}`).fill('24'); await wait();
  const c2 = await page.getByTestId(`product-card-${P('sok')}`).boundingBox();
  await shot(page, O + '19-fokus-primeni.png', [
    { sel: { text: 'Primenjeno' }, n: 1, badge: 'right', pad: 6 },
    { sel: { testid: `additional-discount-dropdown-${P('sok')}` }, n: 2 },
    { sel: { testid: `effective-discount-${P('sok')}` }, n: 3, badge: 'right', pad: 6 },
  ], { x: 0, y: c2.y - 12, width: 390, height: c2.height + 24 });
  await page.getByTestId(`qty-input-${P('sok')}`).fill('');
  await page.getByTestId('clear-product-search').click(); await wait();

  // --- 20. confirm: a hint when there is nothing from the focus list in the order
  await page.getByTestId('customer-picker-button').click(); await wait();
  await page.getByTestId(`customer-option-${seed.customers['Maxi Market d.o.o.']}`).click(); await wait();
  await page.getByTestId('product-search-input').fill('mleko'); await wait();
  await page.getByTestId(`qty-input-${P('mleko')}`).fill('12'); await wait();
  await page.getByTestId('confirm-button').click(); await wait();
  await shot(page, O + '20-fokus-podsetnik.png', [{ sel: { text: 'U porudžbini nema artikala iz fokusa', exact: false }, n: 1, pad: 6, badge: 'right' }]);

  // --- 21. progress tab
  await page.goto('http://localhost:8099/progress', { waitUntil: 'networkidle' }); await wait(1800);
  await shot(page, O + '21-moj-ucinak.png', [
    { sel: { testid: 'progress-revenue' }, n: 1, pad: 2 },
    { sel: { testid: 'progress-focus_revenue' }, n: 2, pad: 2 },
  ], { x: 0, y: 0, width: 390, height: 860 });
  await page.mouse.wheel(0, 3000); await wait();
  await shot(page, O + '22-moj-ucinak-istorija.png', [{ sel: { text: 'Prethodni meseci' }, n: 1, pad: 8 }]);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
