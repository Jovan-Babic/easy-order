# Plan: moduli po klijentu

Cilj: klijent (kompanija) dobija samo ono što mu paket dozvoljava. Paketi i naplata još nisu definisani, pa je ovo **mehanizam**: superadmin uključuje module po klijentu, a kasnije paket/naplata samo popune istu listu.

## Moduli

Osnova je uvek uključena: katalog, kupci, porudžbine (komercijalista pravi, menja dok je `new`, otkazuje), faktura iz mobilne, Excel uvoz artikala i kupaca, uloge admin i komercijalista.

| Modul (`Module`) | Šta otključava | Traži |
|---|---|---|
| `warehouse` (Magacin) | uloga magacin, statusi `in_progress`/`shipped`/`rejected`, pakovanje (`picked_qty`), otpremnica, broj fakture pri slanju, **barkod i skener** (polja `barcode`/`package_barcode`, brzo dodavanje artikla), portal `/warehouse` | — |
| `stock` (Zalihe) | `stock_qty`, prijem, popis, kretanja, „na stanju/raspoloživo“ u katalogu, skidanje sa stanja pri slanju, portal `/stock` | `warehouse` |
| `expiry` (Rokovi) | `track_expiry`, serije, FEFO, upozorenja o isteku, otpis | `stock` |
| `reports` (Izveštaji) | `/reports/orders`, portal `/reports` | — |

Bez modula Magacin porudžbina ostaje `new` ili `canceled` (komercijalista otkazuje). Statusi iza toga i broj fakture pripadaju Magacinu.

## Kako radi

- `clients.modules`: lista uključenih modula. **Klijent bez polja (stariji) ima sve module**, pa postojeći klijenti ništa ne gube. Novi klijent dobija sve ako superadmin ne izabere drugačije.
- Menja ga samo superadmin: `POST /clients` i `PUT /clients/{id}` (`modules`, `None` = ostavi). Zavisnosti se proveravaju (`MODULE_REQUIRES`), npr. Rokovi bez Zaliha = 400. U formi klijenta (portal) uključivanje modula uključuje i ono što traži, a isključivanje i ono što ga koristi.
- Čita se na **svaki zahtev** (zajedno sa proverom da je klijent aktivan), pa promena važi odmah, bez ponovne prijave.
- Backend: `require_module(Module.X, *uloge)` vraća 403 `Module not enabled: x`. Superadmin nije vezan za klijenta i prolazi.
- `/auth/me` i login vraćaju `modules`. Portal (`useHasModule`, `ModuleGate`, Sidebar) i mobilna (`hasModule`) sakrivaju tabove, polja i dugmad.
- Polja modula koji nije uključen se **ignorišu, ne odbijaju** (barkod, `track_expiry`, kolone Excel uvoza), a postojeće vrednosti ostaju netaknute. Uvoz vraća `ignored_columns`, a šablon za preuzimanje sadrži samo dozvoljene kolone.
- `GET /products` ne vraća stanje, rezervacije ni barkodove klijentu bez tih modula.
- Skidanje sa stanja pri slanju se radi samo uz modul Zalihe.

## Šta kad se modul isključi

Podaci se **ne brišu**: modul se zaključa (API 403, UI sakriven), pa povratak na viši paket vraća sve. Neplaćanje ili greška u naplati ne sme da obriše podatke klijenta.
Jedino što treba pratiti zbog veličine baze je `stock_movements` (append-only). Predlog: posle perioda mirovanja (npr. 90 dana) superadmin ručno izveze pa arhivira — nije implementirano.

## Šta nije urađeno (namerno)

- Naplata (LemonSqueezy ili drugo). Paketi, rok važenja i zaključavanje su u `PLAN_PRETPLATE.md`.
- Ograničenja (broj korisnika, porudžbina mesečno): `limits` uz `modules`, kad se dogovore.
- Brisanje/arhiviranje podataka isključenog modula.
- Odluka: broj fakture se dodeljuje pri slanju, tj. u Magacinu. U Osnovi se faktura pravi na telefonu bez broja iz sistema.
