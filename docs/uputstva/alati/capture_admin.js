// Admin guide: the computer portal (admin of a firm). Run on a freshly seeded throw-away backend
// (seed.py + seed_admin.py) with the portal running (BACKEND_URL=http://localhost:8000 npx next dev -p 3100).
// ONLY=<step,step> runs just some steps (they don't depend on each other, except that "users" creates a user).
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { shot, union } = require('./lib');
const seed = require('./seed.json');
const O = process.argv[2] || 'out/';
const PORTAL = process.env.PORTAL || 'http://localhost:3100';
const API = 'http://localhost:8000/api';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const on = (name) => ONLY.length === 0 || ONLY.includes(name);
const P = (k) => seed.products[k];

async function api(path, opts = {}, token) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}
const post = (p, b, t) => api(p, { method: 'POST', body: JSON.stringify(b) }, t);
const put = (p, b, t) => api(p, { method: 'PUT', body: JSON.stringify(b) }, t);

(async () => {
  // --- data the screens need: goods in focus, targets, and orders of both reps made after that
  if (on('data')) {
    const admin = (await post('/auth/login', { email: seed.admin, password: seed.password })).access_token;
    const marko = (await post('/auth/login', { email: seed.operator, password: seed.password })).access_token;
    const ivana = (await post('/auth/login', { email: 'ivana@morava-primer.rs', password: seed.password })).access_token;
    const mm = await api('/auth/me', {}, marko), iv = await api('/auth/me', {}, ivana);
    await post('/focus', { product_id: P('sok'), reason: 'expiry', note: 'Kratak rok - ponudite svim kupcima', recommended_discount: 5 }, admin);
    await post('/focus', { product_id: P('plazma'), reason: 'stock', note: 'Višak na lageru' }, admin);
    const month = new Date().toISOString().slice(0, 7), year = month.slice(0, 4);
    for (const [uid, v] of [[mm.id, { revenue: 120000, orders: 10, customers: 5, focus_revenue: 30000 }], [iv.id, { revenue: 90000, orders: 8, customers: 4, focus_revenue: 20000 }]]) {
      await put('/targets', { user_id: uid, period_type: 'month', period: month, values: v }, admin);
      await put('/targets', { user_id: uid, period_type: 'year', period: year, values: { revenue: v.revenue * 12 } }, admin);
    }
    const line = (k, q, a = 0) => ({ product_id: P(k), ordered_qty: q, additional_discount: a });
    for (const [tok, cust, lines] of [
      [marko, 'Market Lipa', [line('plazma', 60), line('sok', 48, 5)]],
      [marko, 'Delikates Sunce', [line('plazma', 40), line('voda', 120)]],
      [ivana, 'Prodavnica Kod Mike', [line('sok', 24, 5), line('jogurt', 36, 2)]],
    ]) await post('/orders', { customer_id: seed.customers[cust], items: lines }, tok);
  }

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, locale: 'sr-RS' });
  const page = await ctx.newPage();
  const wait = (ms = 900) => page.waitForTimeout(ms);
  const hide = () => page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
  const go = async (path) => { await page.goto(PORTAL + path, { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(2800); await hide(); };
  const btn = (name, nth = 0) => ({ text: name, exact: true, nth });

  // --- login (the language is set to Serbian before)
  await page.goto(PORTAL + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(3000); await hide();
  await page.evaluate(() => localStorage.setItem('easy-order-admin-lang', 'sr'));
  await page.reload({ waitUntil: 'domcontentloaded' }); await wait(2500); await hide();
  if (on('login')) {
    await page.locator('input[type="email"]').fill(seed.admin);
    await page.locator('input[type="password"]').fill(seed.password);
    await shot(page, O + 'a01-prijava.png', [
      { sel: 'input[type="email"]', n: 1, pad: 4 }, { sel: 'input[type="password"]', n: 2, pad: 4 },
      { sel: 'button[type="submit"]', n: 3, pad: 2 }, { sel: { text: 'Zaboravljena lozinka?' }, n: 4, badge: 'right', pad: 6 },
    ], { x: 340, y: 150, width: 600, height: 520 });
  }
  await page.locator('input[type="email"]').fill(seed.admin);
  await page.locator('input[type="password"]').fill(seed.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }); await wait(2000); await hide();

  // --- dashboard
  if (on('dashboard')) {
    await page.setViewportSize({ width: 1280, height: 1500 });
    await go('/dashboard');
    await shot(page, O + 'a03-kontrolna-tabla.png', [
      await union(page, [{ text: 'OD DATUMA', exact: false }, { text: 'DO DATUMA', exact: false }]).then((b) => ({ sel: b, n: 1, pad: 10 })),
      await union(page, ['main :text-is("Narudžbine")', 'main :text-is("Aktivni kupci")']).then((b) => ({ sel: b, n: 2, pad: 8 })),
      { sel: { text: 'Promet kroz vreme' }, n: 3, pad: 8 },
      { sel: { text: 'Prodaja artikala' }, n: 4, pad: 8 },
      { sel: { text: 'Najbolji kupci' }, n: 5, pad: 8 },
      { sel: { text: 'Poslednje porudžbine' }, n: 6, pad: 8 },
    ], { x: 0, y: 0, width: 1280, height: 1500 });
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  const step = async (name, fn) => {
    if (!on(name)) return;
    try { await fn(); console.log('ok', name); } catch (e) { console.log('FAILED', name, String(e).split('\n')[0]); }
    await page.setViewportSize({ width: 1280, height: 900 });
  };
  const clipTop = (h = 900) => ({ x: 0, y: 0, width: 1280, height: h });
  const label = (t) => `label:has-text("${t}")`;

  await step('users', async () => {
    await go('/users');
    await shot(page, O + 'a04-korisnici.png', [
      { sel: btn('Novi korisnik'), n: 1, pad: 6 },
      { sel: 'table', n: 2, pad: 2 },
      { sel: btn('Izmeni', 0), n: 3, pad: 6, badge: 'right' },
      { sel: btn('Obriši', 0), n: 4, pad: 6, badge: 'right' },
    ], clipTop(520));
    await page.getByRole('button', { name: 'Novi korisnik' }).click(); await wait();
    await page.locator('input').nth(0).fill('Ana Nikolić');
    await shot(page, O + 'a05-novi-korisnik.png', [
      { sel: label('Ime'), n: 1, pad: 4, badge: 'right' }, { sel: label('Email'), n: 2, pad: 4, badge: 'right' },
      { sel: { text: 'Telefon', exact: false, nth: 1 }, n: 3, pad: 4, badge: 'right' },
      { sel: label('Uloga'), n: 4, pad: 4, badge: 'right' },
      { sel: { text: 'Lozinka se generiše automatski', exact: false }, n: 5, pad: 4, badge: 'right' },
      { sel: btn('Kreiraj korisnika'), n: 6, pad: 4 },
    ], clipTop(820));
    await page.getByRole('button', { name: 'Otkaži' }).first().click().catch(() => {}); await wait(500);
    await page.getByRole('button', { name: 'Izmeni' }).first().click(); await wait();
    await shot(page, O + 'a06-izmena-korisnika.png', [
      { sel: label('Ime'), n: 1, pad: 4, badge: 'right' },
      { sel: { text: 'Nova lozinka', exact: false, nth: 0 }, n: 2, pad: 4, badge: 'right' },
      { sel: label('Uloga'), n: 3, pad: 4, badge: 'right' }, { sel: label('Status'), n: 4, pad: 4, badge: 'right' },
      { sel: btn('Sačuvaj izmene'), n: 5, pad: 4 },
    ], clipTop(900));
  });

  await step('seats', async () => {
    await go('/seats');
    await shot(page, O + 'a07-nalozi-i-paket.png', [
      { sel: 'table', n: 1, pad: 2 },
      { sel: { text: 'Mesečni iznos', exact: false, nth: 0 }, n: 2, pad: 8 },
    ], clipTop(460));
  });

  await step('billing', async () => {
    await page.setViewportSize({ width: 1280, height: 1300 });
    await go('/billing');
    await shot(page, O + 'a08-zaduzenja.png', [
      { sel: 'p:text-is("Za uplatu")', n: 1, pad: 8, badge: 'right' },
      { sel: 'img[alt="IPS QR"]', n: 2, pad: 6 },
      await union(page, [{ text: 'Podaci za uplatu', exact: true }, { text: 'Uplatu izvršite', exact: false }]).then((b) => ({ sel: b, n: 3, pad: 8, badge: 'right' })),
      { sel: 'h2:text-is("Otvorena zaduženja")', n: 4, pad: 8, badge: 'right' },
      { sel: 'h2:text-is("Istorija")', n: 5, pad: 8, badge: 'right' },
    ], clipTop(1000));
  });

  await step('products', async () => {
    await page.setViewportSize({ width: 1500, height: 900 });
    await go('/products');
    await shot(page, O + 'a09-proizvodi.png', [
      { sel: btn('Uvoz'), n: 1, pad: 6 }, { sel: btn('Novi proizvod'), n: 2, pad: 6 },
      { sel: 'table', n: 3, pad: 2 }, { sel: btn('Izmeni', 0), n: 4, pad: 6, badge: 'right' },
    ], { x: 0, y: 0, width: 1500, height: 820 });
    await page.setViewportSize({ width: 1280, height: 1900 });
    await go('/products');
    await page.getByRole('button', { name: 'Novi proizvod' }).click(); await wait(900);
    await shot(page, O + 'a10-novi-proizvod.png', [
      await union(page, [{ text: 'Slika proizvoda', exact: true }, { text: 'Nema slike', exact: true }]).then((b) => ({ sel: b, n: 1, pad: 8 })),
      await union(page, [{ text: 'Ime', exact: true, nth: 0 }, { text: 'Proizvođač', exact: true }]).then((b) => ({ sel: { box: { ...b.box, height: b.box.height + 40 } }, n: 2, pad: 4, badge: 'right' })),
      await union(page, [{ text: 'Cena (bez PDV-a)', exact: true }, { text: 'PDV (%)', exact: true }]).then((b) => ({ sel: { box: { ...b.box, height: b.box.height + 40 } }, n: 3, pad: 4, badge: 'right' })),
      await union(page, [{ text: 'Podrazumevani popust (%)', exact: true }, { text: 'ili unesite:', exact: false }]).then((b) => ({ sel: { box: { ...b.box, height: b.box.height + 30 } }, n: 4, pad: 4, badge: 'right' })),
      await union(page, [{ text: 'Opcije dodatnog popusta (%)', exact: true }, { text: '15%', exact: true, nth: 1 }]).then((b) => ({ sel: b, n: 5, pad: 6, badge: 'right' })),
      await union(page, [{ text: 'Jedinica mere', exact: true }, { text: 'Količina i cena su u ovoj jedinici', exact: false }]).then((b) => ({ sel: b, n: 6, pad: 4, badge: 'right' })),
      await union(page, [{ text: 'Komada u pakovanju', exact: true }, { text: 'Barkod', exact: true }, { text: 'Kutija po transportu', exact: true }]).then((b) => ({ sel: { box: { ...b.box, height: b.box.height + 50 } }, n: 7, pad: 4, badge: 'right' })),
      { sel: { text: 'Aktivan (vidljiv komercijalistima)', exact: false }, n: 8, pad: 6, badge: 'right' },
      { sel: { text: 'Prati rok trajanja', exact: false }, n: 9, pad: 6, badge: 'right' },
      { sel: btn('Kreiraj proizvod'), n: 10, pad: 4 },
    ], clipTop(1230));
  });

  await step('import', async () => {
    await go('/products');
    await page.getByRole('button', { name: 'Uvoz' }).click(); await wait(900);
    await shot(page, O + 'a11-uvoz.png', [
      { sel: { text: 'Preuzmi primer fajla', exact: false }, n: 1, pad: 6, badge: 'right' },
      { sel: 'input[type=file]', n: 2, pad: 4, badge: 'right' },
      { sel: btn('Pregled'), n: 3, pad: 4 },
    ], clipTop(520));
    const tpl = await fetch(API + '/products/import-template', { headers: { Authorization: `Bearer ${(await post('/auth/login', { email: seed.admin, password: seed.password })).access_token}` } });
    require('fs').writeFileSync('/tmp/import-primer.xlsx', Buffer.from(await tpl.arrayBuffer()));
    await page.setViewportSize({ width: 1280, height: 1300 });
    await page.locator('input[type=file]').setInputFiles('/tmp/import-primer.xlsx'); await wait(500);
    await page.getByRole('button', { name: 'Pregled' }).click(); await wait(2500);
    await shot(page, O + 'a11b-uvoz-pregled.png', [
      { sel: { text: 'Pregled:', exact: false }, n: 1, pad: 6, badge: 'right' },
      { sel: btn('Potvrdi uvoz'), n: 2, pad: 4 },
    ], clipTop(1300));
  });

  await step('customers', async () => {
    await go('/customers');
    await page.getByRole('button', { name: 'Novi kupac' }).click(); await wait(900);
    await shot(page, O + 'a12-kupci.png', [
      { sel: btn('Uvoz'), n: 1, pad: 6 }, { sel: label('Ime'), n: 2, pad: 4, badge: 'right' }, { sel: label('PIB'), n: 3, pad: 4, badge: 'right' },
      { sel: btn('Kreiraj kupca'), n: 4, pad: 4 }, { sel: btn('Obriši', 0), n: 5, pad: 6, badge: 'right' },
    ], clipTop(900));
  });

  await step('orders', async () => {
    await go('/orders');
    await shot(page, O + 'a13-narudzbine.png', [
      { sel: 'main select', n: 1, pad: 4 }, { sel: 'table', n: 2, pad: 2 },
      { sel: btn('Detalji', 0), n: 3, pad: 6, badge: 'right' }, { sel: btn('Obriši', 0), n: 4, pad: 6, badge: 'right' },
    ], clipTop(900));
    await page.getByRole('button', { name: 'Detalji' }).last().click(); await wait(1500);
    await shot(page, O + 'a14-narudzbina-detalji.png', [
      await union(page, [btn('Faktura'), btn('Otpremnica')]).then((b) => ({ sel: b, n: 1, pad: 6 })),
      { sel: { text: 'Broj fakture:', exact: false }, n: 2, pad: 6, badge: 'right' },
      { sel: btn('Štampaj / Sačuvaj PDF'), n: 3, pad: 4 },
    ], clipTop(900));
  });

  await step('reports', async () => {
    await go('/reports');
    await shot(page, O + 'a15-izvestaji.png', [
      { sel: { text: 'Od', exact: true, nth: 0 }, n: 1, pad: 8 },
      { sel: { text: 'PO STATUSU', exact: false }, n: 2, pad: 8 },
      { sel: { text: 'PO KOMERCIJALISTI', exact: false }, n: 3, pad: 8 },
      { sel: { text: 'PO MAGACIONERU', exact: false }, n: 4, pad: 8 },
    ], clipTop(700));
  });

  await step('focus', async () => {
    await page.setViewportSize({ width: 1280, height: 1250 });
    await go('/focus');
    await shot(page, O + 'a16-roba-u-fokusu.png', [
      { sel: btn('Dodaj artikal u fokus'), n: 1, pad: 6 },
      await union(page, [{ text: 'Predlozi', exact: true }, { text: 'Sir gauda', exact: true }]).then((b) => ({ sel: { box: { ...b.box, width: 1000 } }, n: 2, pad: 14, badge: 'right' })),
      { sel: 'table >> nth=0', n: 3, pad: 2 },
      await union(page, [{ text: 'Prodaja robe u fokusu', exact: true }, { text: 'Ivana Jovanović', exact: true }]).then((b) => ({ sel: b, n: 4, pad: 10, badge: 'right' })),
    ], clipTop(1250));
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.getByRole('button', { name: 'Dodaj artikal u fokus' }).click(); await wait(900);
    await shot(page, O + 'a17-fokus-dodaj.png', [
      { sel: label('Artikal'), n: 1, pad: 4, badge: 'right' }, { sel: label('Razlog'), n: 2, pad: 4, badge: 'right' },
      { sel: label('Napomena'), n: 3, pad: 4, badge: 'right' }, { sel: label('Preporučeni rabat'), n: 4, pad: 4, badge: 'right' },
      { sel: label('U fokusu do'), n: 5, pad: 4, badge: 'right' }, { sel: btn('Sačuvaj'), n: 6, pad: 4 },
    ], clipTop(1100));
  });

  await step('targets', async () => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await go('/targets');
    await shot(page, O + 'a18-ciljevi.png', [
      await union(page, [{ text: 'Mesec', exact: true }, { text: 'Godina', exact: true }]).then((b) => ({ sel: b, n: 1, pad: 6 })),
      { sel: btn('Kopiraj prethodni period'), n: 2, pad: 6 },
      { sel: btn('Predloži cilj (prošla godina +%)'), n: 3, pad: 6 },
      { sel: 'table', n: 4, pad: 2 },
    ], clipTop(1050));
  });

  // first sign-in of a fresh account: the portal asks for a new password
  if (on('firstlogin')) {
    const adm = (await post('/auth/login', { email: seed.admin, password: seed.password })).access_token;
    // sales reps don't use the portal, so the new account is a warehouse user (needs one more seat)
    const sa = (await post('/auth/login', { email: 'admin@easyorder.dev', password: 'ChangeMe123!' })).access_token;
    const cid = (await api('/clients', {}, sa)).find((c) => c.name.startsWith('Veleprodaja Morava')).id;
    await put(`/subscriptions/${cid}/seats`, { extra_seats: { operator: 1, warehouse: 1 }, discount_percent: 0 }, sa);
    const inv = await post('/users', { name: 'Petar Novi', email: `petar${Date.now()}@morava-primer.rs`, role: 'warehouse', phone: '+381 64 7654321' }, adm);
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, locale: 'sr-RS' });
    const p2 = await c2.newPage();
    await p2.goto(PORTAL + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 }); await p2.waitForTimeout(3000);
    await p2.evaluate(() => localStorage.setItem('easy-order-admin-lang', 'sr'));
    await p2.locator('input[type="email"]').fill(inv.email); await p2.locator('input[type="password"]').fill(inv.temporary_password);
    await p2.locator('button[type="submit"]').click();
    await p2.waitForURL((u) => u.pathname.includes('change-password'), { timeout: 60000 }); await p2.waitForTimeout(2500);
    await p2.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
    const pw = p2.locator('input[type=password]');
    await pw.nth(0).fill(inv.temporary_password); await pw.nth(1).fill('NovaLozinka1'); await pw.nth(2).fill('NovaLozinka1');
    await shot(p2, O + 'a02-nova-lozinka.png', [
      { sel: 'input[type=password] >> nth=0', n: 1, pad: 4, badge: 'right' }, { sel: 'input[type=password] >> nth=1', n: 2, pad: 4, badge: 'right' },
      { sel: 'input[type=password] >> nth=2', n: 3, pad: 4, badge: 'right' }, { sel: 'button[type=submit]', n: 4, pad: 4 },
    ], { x: 300, y: 100, width: 680, height: 640 });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
