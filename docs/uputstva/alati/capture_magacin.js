// Warehouse guide: phone screens (Početna, Pakovanje, Prijem, Popis, Rokovi, Istorija).
// Run on a freshly seeded throw-away backend (seed.py), as the warehouse user.
const { open, shot, login, union } = require('./lib');
const seed = require('./seed.json'); // written by seed.py
const O = process.argv[2] || 'out/';
const P = (k) => seed.products[k];
const [, , , O4, O5, O6, O7] = seed.orders; // queue orders made by the second rep

(async () => {
  const { browser, page } = await open();
  const wait = (ms = 700) => page.waitForTimeout(ms);
  const tid = (id) => page.getByTestId(id);

  await login(page, seed.warehouse, seed.password); await wait(1800);

  // --- 01. start screen
  await shot(page, O + '01-pocetna.png', [
    { sel: { testid: 'card-orders' }, n: 1 },
    { sel: { testid: 'card-expiry' }, n: 2 },
    await union(page, [{ text: 'Početna' }, { text: 'Istorija' }]).then((b) => ({ sel: { box: { ...b.box, y: b.box.y - 14, height: b.box.height + 28 } }, n: 3, badge: 'right' })),
  ]);

  // --- 02. packing queue
  await tid('card-orders').click(); await wait(1500);
  await shot(page, O + '02-pakovanje-lista.png', [
    await union(page, [{ testid: 'mode-pack' }, { testid: 'mode-receipt' }, { testid: 'mode-count' }, { testid: 'mode-expiry' }]).then((b) => ({ sel: b, n: 1, pad: 6 })),
    { sel: { testid: `pack-order-${O5}` }, n: 2, pad: 0 },
  ]);
  await page.setViewportSize({ width: 390, height: 1100 }); await wait();

  // --- 03. open a new order: take / reject
  await tid(`pack-order-${O5}`).getByText('Delikates Sunce').click(); await wait();
  const card = tid(`pack-order-${O5}`);
  const cb = await card.boundingBox();
  await shot(page, O + '03-nova-porudzbina.png', [
    { sel: { testid: `pick-${O5}-${P('sok')}` }, n: 1, pad: 2 },
    { sel: { testid: `take-${O5}` }, n: 2 },
    { sel: { text: 'Odbij', exact: true, nth: 0 }, n: 3, badge: 'right', pad: 6 },
  ], { x: 0, y: Math.max(0, cb.y - 12), width: 390, height: cb.height + 24 });

  // --- 04. reject form
  await page.getByText('Odbij', { exact: true }).first().click(); await wait(500);
  await tid(`reject-note-${O5}`).fill('Kupac traži isporuku tek u petak.'); await wait(300);
  const cr = await card.boundingBox();
  await shot(page, O + '04-odbijanje.png', [
    { sel: { testid: `reject-note-${O5}` }, n: 1, pad: 4 },
    { sel: { text: 'Odbij', exact: true, nth: 0 }, n: 2, badge: 'right', pad: 8 },
    { sel: { text: 'Otkaži', exact: true, nth: 0 }, n: 3, badge: 'right', pad: 8 },
  ], { x: 0, y: Math.max(0, cr.y - 12), width: 390, height: cr.height + 24 });
  await page.getByText('Otkaži', { exact: true }).first().click(); await wait(500);

  // --- 05. take it and pack
  await tid(`take-${O5}`).click(); await wait(1500);
  for (const k of ['sok', 'jogurt', 'gauda']) { await tid(`pick-${O5}-${P(k)}`).click(); await wait(600); }
  // the jogurt line: only 22 of 24 on the shelf
  const lineJog = tid(`pick-${O5}-${P('jogurt')}`);
  await lineJog.scrollIntoViewIfNeeded();
  const minus = page.locator(`[data-testid="pack-order-${O5}"] >> text=/Poslato: 24/`);
  await wait(300);
  const c5 = await card.boundingBox();
  await shot(page, O + '05-pakovanje.png', [
    { sel: { testid: `pick-${O5}-${P('sok')}` }, n: 1, pad: 2 },
    { sel: { text: 'Uzmi prvo rok', exact: false }, n: 2, pad: 4 },
    { sel: { text: 'Poslato: 24 / 24', exact: false }, n: 3, pad: 10 },
    { sel: { testid: `picked-${O5}-${P('gauda')}` }, n: 4, badge: 'right', pad: 4 },
    { sel: { testid: `ship-${O5}` }, n: 5, pad: 2 },
  ], { x: 0, y: Math.max(0, c5.y - 12), width: 390, height: c5.height + 24 });

  // --- 06. less than ordered on the jogurt line (22 of 24), then ship
  const stepper = page.locator('text=/Poslato: 24 \\/ 24/').first();
  const sb = await stepper.boundingBox();
  await page.mouse.click(sb.x - 30, sb.y + sb.height / 2); await wait(700);
  await page.mouse.click(sb.x - 30, sb.y + sb.height / 2); await wait(900);
  const c6 = await card.boundingBox();
  await shot(page, O + '06-manje-poslato.png', [
    { sel: { text: 'Poslato: 22 / 24', exact: false }, n: 1, pad: 10 },
    { sel: { testid: `ship-${O5}` }, n: 2, pad: 2 },
  ], { x: 0, y: Math.max(0, c6.y - 12), width: 390, height: c6.height + 24 });
  await tid(`ship-${O5}`).click(); await wait(2000);

  // --- 07. receipt (Prijem)
  await tid('mode-receipt').click(); await wait(1500);
  await tid('stock-search').fill('jogurt'); await wait(500);
  await page.getByText('Jogurt 1,5% 1 l', { exact: true }).first().click(); await wait(500);
  await tid(`qty-${P('jogurt')}`).fill('120'); await wait(300);
  await tid('stock-note').fill('Mlekara Zlatibor, otpremnica 123'); await wait(300);
  await shot(page, O + '07-prijem.png', [
    { sel: { testid: 'scan-button' }, n: 1 },
    { sel: { testid: 'stock-search' }, n: 2, pad: 4 },
    { sel: { text: 'Knjižno', exact: false }, n: 3, pad: 6 },
    { sel: { testid: `qty-${P('jogurt')}` }, n: 4, badge: 'right' },
    { sel: { testid: 'stock-note' }, n: 5, pad: 4 },
    { sel: { testid: 'stock-confirm' }, n: 6 },
  ], { x: 0, y: 0, width: 390, height: 640 });

  // --- 08. receipt of a product with expiry dates
  await tid('stock-search').fill('sok od'); await wait(500);
  await page.getByText('Sok od jabuke 1 l', { exact: true }).first().click(); await wait(1000);
  await tid(`exp-date-${P('sok')}`).fill('31122026'); await wait(200);
  await tid(`exp-qty-${P('sok')}`).fill('60'); await wait(300);
  const sokCard = await tid(`exp-date-${P('sok')}`).boundingBox();
  await shot(page, O + '08-prijem-rok.png', [
    { sel: { text: 'Na stanju po rokovima', exact: false }, n: 1, pad: 6 },
    { sel: { testid: `exp-date-${P('sok')}` }, n: 2 },
    { sel: { testid: `exp-qty-${P('sok')}` }, n: 3, badge: 'right' },
    { sel: { text: 'Dodaj još jedan rok', exact: false }, n: 4, pad: 4 },
  ], { x: 0, y: Math.max(0, sokCard.y - 150), width: 390, height: 330 });
  await tid('stock-confirm').click(); await wait(2000);

  // --- 09. count (Popis)
  await tid('mode-count').click(); await wait(1500);
  await tid('stock-search').fill('plazma'); await wait(500);
  await page.getByText('Keks Plazma 300 g', { exact: true }).first().click(); await wait(500);
  await tid(`qty-${P('plazma')}`).fill('155'); await wait(300);
  await tid('stock-note').fill('Mesečni popis'); await wait(300);
  await shot(page, O + '09-popis.png', [
    { sel: { text: 'Popis menja samo skenirane stavke', exact: false }, n: 1, pad: 6 },
    { sel: { text: 'Razlika', exact: false }, n: 2, pad: 6 },
    { sel: { testid: `qty-${P('plazma')}` }, n: 3, badge: 'right' },
    { sel: { testid: 'stock-note' }, n: 4, pad: 4 },
    { sel: { testid: 'stock-confirm' }, n: 5 },
  ], { x: 0, y: 0, width: 390, height: 640 });

  // --- 10. expiry list (Rokovi)
  await tid('mode-expiry').click(); await wait(1800);
  await shot(page, O + '10-rokovi.png', [
    { sel: { testid: 'mode-expiry' }, n: 1, pad: 4 },
    await union(page, [{ text: 'Mlečna čokolada 100 g', nth: 0 }, { text: 'Otpiši', exact: true, nth: 0 }]).then((b) => ({ sel: b, n: 2, pad: 8 })),
    { sel: { text: '4 dana', exact: true }, n: 3, badge: 'right', pad: 6 },
    { sel: { text: '6 dana', exact: true }, n: 4, badge: 'right', pad: 6 },
  ], { x: 0, y: 0, width: 390, height: 640 });

  // --- 11. history
  await page.getByText('Istorija', { exact: true }).last().click(); await wait(2000);
  await shot(page, O + '11-istorija.png', [
    { sel: { testid: 'status-shipped', nth: 0 }, n: 1, badge: 'right' },
  ], { x: 0, y: 0, width: 390, height: 640 });

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
