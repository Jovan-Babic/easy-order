# Plan: roba u fokusu i ciljevi komercijalista

Dva nova modula (`focus`, `targets`), uključuju se po klijentu kao ostali moduli (`PLAN_MODULI.md`). Sve je JS-only (backend, portal, mobilna aplikacija bez nativnih izmena) - za aplikaciju je dovoljan OTA update.

## 1. Roba u fokusu (modul `focus`)

Admin bira artikle koje komercijalisti treba više da nude.

- Kolekcija `focus_items`: `id`, `client_id`, `product_id`, `reason` (`stock` višak na lageru / `expiry` ističe rok / `promo` akcija / `other`), `note` (kratka napomena za komercijaliste), `recommended_discount` (opciono; mora biti jedan od DODATNIH rabata artikla - komercijalista u aplikaciji bira dodatni rabat, dobavljački je fiksan), `active_to` (opciono, YYYY-MM-DD; posle tog dana artikal ispada), `created_by_*`, `created_at`. Jedan artikal je u fokusu najviše jednom.
- `GET /focus` (admin): lista sa podacima artikla (zaliha, najbliži rok) + `suggestions` (artikli sa velikim viškom: lager u odnosu na prodaju poslednjih 30 dana; artikli sa serijom kojoj ističe rok po pragovima klijenta). `POST /focus`, `PUT /focus/{id}`, `DELETE /focus/{id}` (`require_manager` + modul).
- `GET /products` dodaje polje `focus` (`reason`, `note`, `recommended_discount`, `expiry_date`, `expiry_qty`) samo komercijalistima/ostalima kad je modul uključen i artikal je aktivan u fokusu. Komercijalista inače ne vidi podatke o roku; **izuzetak je samo artikal u fokusu** sa razlogom `expiry` (najbliži datum i količina koja ističe).
- Fokus ne menja pravila porudžbine: preporučeni rabat je samo predlog (dugme "Primeni" u aplikaciji bira ga u listi dodatnih rabata), server i dalje prima samo rabate iz `product.additional_discounts`.
- Izveštaj: `GET /focus/report` - šta je od fokusa prodato u periodu (količina, vrednost, po komercijalisti).
- Portal: stranica `/focus` (admin, modul `focus`) - lista, dodavanje pretragom, panel "Predlozi".
- Mobilna: oznaka i napomena na kartici artikla u katalogu, čip "Fokus (n)" za filter, meka napomena pri potvrdi porudžbine kad nijedan artikal iz fokusa nije dodat.

## 2. Ciljevi komercijalista (modul `targets`)

- Kolekcija `targets`: `client_id`, `user_id`, `period_type` (`month`/`quarter`/`year`), `period` (`2026-03`, `2026-Q1`, `2026`), `metric`, `value`. Jedinstveno po (user, period_type, period, metric).
- Metrike: `revenue` (neto RSD), `orders` (broj porudžbina), `customers` (broj različitih kupaca), `focus_revenue` (neto RSD robe u fokusu). Ključ je tekst, nove metrike se dodaju bez promene strukture.
- Ostvarenje se računa iz `orders` pri upitu: bez `canceled`/`rejected`, otpremljene po `picked_qty` (isto kao statistika), komercijalista = `created_by_user_id`, period po `created_at`. Roba u fokusu: stavke čiji je artikal bio u fokusu u trenutku porudžbine (`OrderItem.focus` snimak na stavci).
- Admin (portal `/targets`): tabela komercijalista x metrika za mesec / kvartal / godinu, poređenje sa istim periodom prošle godine, predlog "prošlogodišnje + X%", kopiranje prošlog perioda. Pregled ostvarenja.
- Komercijalista (mobilna, tab "Moj učinak"): samo mesečni ciljevi i svoj napredak (bez poretka među kolegama): ostvareno / cilj, preostali dani, potreban dnevni tempo, projekcija, prethodna 3 meseca.
- API: `GET/PUT /targets` (manager), `GET /targets/progress` (manager, svi), `GET /targets/me` (komercijalista).

## Status
- Fokus: gotovo (backend `/focus*`, portal `/focus`, mobilna oznaka/filter/napomena pri potvrdi, testovi `tests/test_focus.py`).
- Ciljevi: gotovo (backend `/targets*`, portal `/targets`, mobilni tab "Moj učinak", testovi `tests/test_targets.py`).
- Veza (`focus_revenue` metrika) je već u ciljevima; izveštaj o fokusu (`GET /focus/report`, sekcija na stranici `/focus`) je urađen.

## Redosled
1. Fokus: backend, testovi, portal, mobilna.
2. Ciljevi: backend, testovi, portal, mobilna.
3. Veza: `focus_revenue` metrika i izveštaj o fokusu.
