// Admin guide: the admin's own screens in the phone app (Admin tab: products and customers).
// Run on the same freshly seeded backend as capture_admin.js (after it), web build served on :8099.
const { open, shot, login, union } = require('./lib');
const seed = require('./seed.json');
const O = process.argv[2] || 'out/';
const P = (k) => seed.products[k];

(async () => {
  const { browser, page } = await open();
  const wait = (ms = 800) => page.waitForTimeout(ms);
  await login(page, seed.admin, seed.password); await wait(2000);

  // --- tabs of the admin (start screen = catalog)
  await shot(page, O + 'm01-tabovi.png', [
    await union(page, [{ text: 'Porudžbina', exact: true }, { text: 'Admin', exact: true }]).then((b) => ({ sel: { box: { ...b.box, y: b.box.y - 14, height: b.box.height + 28 } }, n: 1, pad: 2 })),
  ]);

  // --- Admin tab: list
  await page.getByText('Admin', { exact: true }).last().click(); await wait(1500);
  await shot(page, O + 'm02-admin-lista.png', [
    await union(page, [{ testid: 'segment-products' }, { testid: 'segment-customers' }]).then((b) => ({ sel: b, n: 1, pad: 6 })),
    { sel: { testid: `admin-item-${P('jogurt')}` }, n: 2, pad: 2 },
    { sel: { testid: `edit-${P('jogurt')}` }, n: 3, badge: 'right', pad: 6 },
    { sel: { testid: `delete-${P('jogurt')}` }, n: 4, badge: 'right', pad: 6 },
    { sel: { testid: 'fab-add' }, n: 5, pad: 4 },
  ]);

  // --- product form: a bottom sheet that scrolls, two screens of it (the lower part is the same as the portal form)
  await page.getByTestId(`edit-${P('jogurt')}`).click(); await wait(1500);
  const top = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(page, O + 'm03-proizvod-forma.png', [
    { sel: { testid: 'pick-image-button' }, n: 1, pad: 4 },
    { sel: { testid: 'form-name' }, n: 2, pad: 4, badge: 'right' },
    { sel: { box: { x: 16, y: 338, width: 358, height: 72 } }, n: 3, pad: 4, badge: 'right' }, // Cena bez PDV-a (the label's own box is not reliable here)
  ]);
  await top(page.getByText('Rabati (%)', { exact: true })); await wait(600);
  await shot(page, O + 'm04-proizvod-forma-2.png', [
    { sel: { text: 'Rabati (%)', exact: true }, n: 1, pad: 8, badge: 'right' },
    { sel: { text: 'Opcije dodatnog popusta (%)', exact: true }, n: 2, pad: 8, badge: 'right' },
    { sel: { text: 'Jedinica mere', exact: true }, n: 3, pad: 8, badge: 'right' },
  ]);
  await page.getByTestId('form-cancel-button').evaluate((el) => el.click()); await wait(800);

  // --- customers
  await page.getByTestId('segment-customers').click(); await wait(1000);
  await page.getByTestId('fab-add').click(); await wait(1000);
  await page.getByTestId('form-name').fill('Pekara Zlatni klas'); await wait(300);
  await shot(page, O + 'm06-kupac-forma.png', [
    { sel: { testid: 'form-name' }, n: 1, pad: 4 },
    { sel: { text: 'PIB', exact: true }, n: 2, pad: 4, badge: 'right' },
    { sel: { testid: 'form-phone' }, n: 3, pad: 4, badge: 'right' },
    { sel: { testid: 'form-save-button' }, n: 4, pad: 4 },
  ]);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
