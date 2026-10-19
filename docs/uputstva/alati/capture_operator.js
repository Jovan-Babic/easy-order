const { open, shot, login, locate, union } = require('./lib');
const seed = require('./seed.json'); // written by seed.py
const API = 'http://localhost:8000/api';
const O = process.argv[2] || 'out/';
const P = (k) => seed.products[k];

async function api(path, opts = {}, token) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return r.json();
}

(async () => {
  const { browser, page } = await open();
  const wait = (ms = 700) => page.waitForTimeout(ms);

  // --- 1. login
  await page.goto('http://localhost:8099/login', { waitUntil: 'networkidle' }); await wait(1200);
  await page.getByTestId('login-email-input').fill(seed.operator);
  await page.getByTestId('login-password-input').fill('Primer2026!');
  await shot(page, O + '01-prijava.png', [
    { sel: { testid: 'login-email-input' }, n: 1 }, { sel: { testid: 'login-password-input' }, n: 2 },
    { sel: { testid: 'login-submit-button' }, n: 3 }, { sel: { text: 'Zaboravljena lozinka?' }, n: 4, badge: 'right' },
  ]);

  // --- 2. first sign-in: change the temporary password (a fresh invited rep)
  const adm = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jelena@morava-primer.rs', password: 'Primer2026!' }) });
  const inv = await api('/users', { method: 'POST', body: JSON.stringify({ name: 'Ana Novi', email: `ana${Date.now()}@morava-primer.rs`, role: 'operator', phone: '+381 64 1111111' }) }, adm.access_token);
  await login(page, inv.email, inv.temporary_password); await wait(800);
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill(inv.temporary_password); await pw.nth(1).fill('NovaLozinka1'); await pw.nth(2).fill('NovaLozinka1');
  await shot(page, O + '02-nova-lozinka.png', [
    { sel: 'input[type=password] >> nth=0', n: 1 }, { sel: 'input[type=password] >> nth=1', n: 2 }, { sel: 'input[type=password] >> nth=2', n: 3 },
  ]);
  await page.evaluate(() => localStorage.clear()); await page.context().clearCookies();

  // --- 3. main screen
  await login(page, seed.operator, 'Primer2026!'); await wait(1500);
  await shot(page, O + '03-glavni-ekran.png', [
    { sel: { testid: 'customer-picker-button' }, n: 1 },
    { sel: { testid: 'product-search-input' }, n: 2, pad: 14 },
    { sel: { testid: 'scan-product-search' }, n: 3, badge: 'right' },
    { sel: { testid: 'manu-chip-__all__' }, n: 4 },
    { sel: { testid: `product-card-${P('jogurt')}` }, n: 5, pad: 2 },
    { sel: { testid: 'lang-toggle' }, n: 6 }, { sel: { testid: 'logout-button' }, n: 7, badge: 'right' },
  ]);

  // --- 4. customer picker
  await page.getByTestId('customer-picker-button').click(); await wait();
  await page.getByTestId('customer-search-input').fill('ma'); await wait(400);
  await shot(page, O + '04-izbor-kupca.png', [
    { sel: { testid: 'customer-search-input' }, n: 1, pad: 10 },
    { sel: { testid: `customer-option-${seed.customers['Maxi Market d.o.o.']}` }, n: 2 },
  ]);
  await page.getByTestId(`customer-option-${seed.customers['Maxi Market d.o.o.']}`).click(); await wait();

  // --- 5. product card explained
  const card = page.getByTestId(`product-card-${P('jogurt')}`);
  const cb = await card.boundingBox();
  const clip = { x: 0, y: cb.y - 12, width: 390, height: cb.height + 24 };
  await shot(page, O + '05-kartica-artikla.png', [
    { sel: { testid: `product-image-${P('jogurt')}` }, n: 1 },
    await union(page, [{ text: 'Cena bez PDV-a' }, { text: 'Transportno pakovanje' }, { text: '145' }, { text: '60' }, { text: '12' }]).then((b) => ({ sel: b, n: 2, badge: 'right' })),
    { sel: { testid: `stock-${P('jogurt')}` }, n: 3, badge: 'right' },
    { sel: { testid: `supplier-discount-${P('jogurt')}` }, n: 4 },
    { sel: { testid: `additional-discount-dropdown-${P('jogurt')}` }, n: 5 },
    { sel: { testid: `qty-input-${P('jogurt')}` }, n: 6, badge: 'right' },
    { sel: { testid: `effective-discount-${P('jogurt')}` }, n: 7, badge: 'right', pad: 6 },
  ], clip);

  // --- 6. additional discount picker
  await page.getByTestId(`additional-discount-dropdown-${P('jogurt')}`).click(); await wait();
  await shot(page, O + '06-dodatni-popust.png', [{ sel: { testid: 'additional-discount-option-3' }, n: 1 }]);
  await page.getByTestId('additional-discount-option-3').click(); await wait();

  // --- 7. quantity typed
  await page.getByTestId(`qty-input-${P('jogurt')}`).fill('24'); await wait();
  const cb2 = await card.boundingBox();
  await shot(page, O + '07-uneta-kolicina.png', [
    { sel: { testid: `additional-discount-dropdown-${P('jogurt')}` }, n: 1 },
    { sel: { testid: `qty-input-${P('jogurt')}` }, n: 2, badge: 'right' },
    { sel: { testid: `effective-discount-${P('jogurt')}` }, n: 3, badge: 'right', pad: 6 },
  ], { x: 0, y: cb2.y - 12, width: 390, height: cb2.height + 24 });

  // --- 8. filter by manufacturer + mleko
  await page.getByTestId('manu-chip-Mlekara Zlatibor').click(); await wait();
  await page.getByTestId(`qty-input-${P('mleko')}`).fill('36'); await wait();
  await shot(page, O + '08-filter-proizvodjaca.png', [
    { sel: { testid: 'manu-chip-Mlekara Zlatibor' }, n: 1 },
    { sel: { testid: 'ordered-count' }, n: 2 },
  ]);

  // --- 9. search: product sold by kg
  await page.getByTestId('manu-chip-__all__').click();
  await page.getByTestId('product-search-input').fill('gauda'); await wait();
  await page.getByTestId(`qty-input-${P('gauda')}`).fill('2,5'); await wait();
  const gc = await page.getByTestId(`product-card-${P('gauda')}`).boundingBox();
  await shot(page, O + '09-pretraga-kg.png', [
    { sel: { testid: 'product-search-input' }, n: 1, pad: 14 },
    { sel: { testid: `qty-input-${P('gauda')}` }, n: 2, badge: 'right' },
  ], { x: 0, y: 0, width: 390, height: gc.y + gc.height + 16 });

  // --- 10. over the free stock
  await page.getByTestId('product-search-input').fill('kafa'); await wait();
  await page.getByTestId(`qty-input-${P('kafa')}`).fill('20'); await wait();
  const kc = await page.getByTestId(`product-card-${P('kafa')}`).boundingBox();
  await shot(page, O + '10-vise-od-stanja.png', [
    { sel: { testid: `stock-${P('kafa')}` }, n: 1, badge: 'right' },
    { sel: { text: 'Količina je veća od slobodnog stanja' }, n: 2, pad: 6 },
  ], { x: 0, y: kc.y - 12, width: 390, height: kc.height + 24 });
  await page.getByTestId(`qty-input-${P('kafa')}`).fill(''); await wait();
  await page.getByTestId('clear-product-search').click(); await wait();

  // --- 11. footer + confirm dialog
  await shot(page, O + '11-potvrdi-dugme.png', [{ sel: { testid: 'confirm-button' }, n: 1 }, { sel: { testid: 'ordered-count' }, n: 2 }]);
  await page.getByTestId('confirm-button').click(); await wait();
  await shot(page, O + '12-potvrda.png', [{ sel: { text: 'Potvrdi', nth: 2 }, n: 1 }, { sel: { text: 'Jogurt 1,5% 1 l x 24', exact: false }, n: 2 }]);
  await page.getByText('Potvrdi', { exact: true }).nth(2).click(); await wait(2500);

  // --- 13. invoice
  await shot(page, O + '13-faktura.png', [
    { sel: { testid: 'send-email-button' }, n: 1 }, { sel: { testid: 'export-pdf-button' }, n: 2, badge: 'right' },
    { sel: { testid: 'copy-invoice-button' }, n: 3 },
  ]);
  await page.mouse.wheel(0, 2000); await wait();
  await shot(page, O + '14-faktura-ukupno.png', [{ sel: { testid: 'invoice-totals' }, n: 1 }]);

  // --- 15. history
  await page.goto('http://localhost:8099/history', { waitUntil: 'networkidle' }); await wait(1500);
  const firstNew = await page.locator('[data-testid^="edit-"]').first().getAttribute('data-testid');
  await shot(page, O + '15-istorija.png', [
    { sel: { testid: 'status-new' }, n: 1, badge: 'right' },
    { sel: { testid: firstNew }, n: 2 }, { sel: { testid: firstNew.replace('edit-', 'cancel-') }, n: 3, badge: 'right' },
  ], { x: 0, y: 0, width: 390, height: 330 });
  await page.mouse.wheel(0, 1500); await wait();
  await shot(page, O + '16-istorija-statusi.png', [
    { sel: { testid: 'status-in_progress' }, n: 1, badge: 'right' },
    { sel: { testid: 'status-rejected' }, n: 2, badge: 'right' },
    { sel: { text: 'Razlog', exact: false }, n: 3 },
    { sel: { testid: 'status-shipped' }, n: 4, badge: 'right' },
    { sel: { text: 'Naručeno', exact: false }, n: 5 },
  ], { x: 0, y: 0, width: 390, height: 670 });

  // --- 17. edit a new order
  await page.mouse.wheel(0, -3000); await wait();
  await page.getByTestId(firstNew).click(); await wait(2000);
  await shot(page, O + '17-izmena.png', [{ sel: { text: 'Izmena porudžbine', exact: false }, n: 1, pad: 8 }, { sel: { testid: 'cancel-edit' }, n: 2, badge: 'right' }]);

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
