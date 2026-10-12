# Plan: jedinice mere artikala

Zamenjuje raniji plan sa rasutim stavkama (tankovima). Cilj: artikal ima jedinicu mere (komad, kg, l, m, ...); zaliha, porudžbine i račun se vode u njoj, bez novih tabela za zalihu. Jedinice definiše vlasnik sistema u bazi, pa nova jedinica ne traži izmenu koda ni novu verziju aplikacije.

## Odlučeno
- Jedinica se bira pri pravljenju artikla; postojeći artikli su `kom` (nedostajuće polje = `kom`).
- Zaliha, poručena i pokupljena količina, serije (rok) i kretanja ostaju kakvi jesu, ali u osnovnoj jedinici artikla. Količina se čuva kao **ceo broj u osnovnoj jedinici** (g, ml, mm, kom), a prikaz i unos su u izabranoj jedinici (kg, l, m).
- Cena je po izabranoj jedinici: sir 1.000 din/kg, kupac uzme 3,5 kg → 3.500 din. U `calc.py` i `frontend/src/calc.ts`: `cena × količina / faktor` (za komad faktor 1, pa se ništa ne menja).
- Jedinica se ne menja posle prve zalihe ili porudžbine (izuzetak: promena u jedinicu iste vrste, jer se čuva u istoj osnovnoj, npr. m ↔ cm).
- Pakovanje i barkod kutije (`pieces_per_package`, `package_barcode`) važe samo za artikle u `kom`. Flaša od 2 l je artikal u komadima, a „6×2 l“ i „karton od 24 piva“ su njegova pakovanja; ništa se ne gubi.
- Veza „tank → flaša“ (flasirano ulje smanjuje zalihu artikla ulje rasuto) je **kasnija faza** (J3), bez novih tabela.

## Jedinice (`units`, u bazi, globalne)
Jedan zapis po jedinici (ne po paru), da se ne dupliraju parovi:

| Polje | Primer | Napomena |
|---|---|---|
| `code` | `kg` | jedinstven, ne menja se |
| `name_sr`, `name_en` | kilogram | naziv za prikaz |
| `symbol` | kg | skraćenica na računu i u listama |
| `group` | `mass` | `count` / `mass` / `volume` / `length` (ili novo) |
| `base_code` | `g` | osnovna jedinica grupe (u njoj se čuva količina) |
| `factor` | 1000 | koliko osnovnih jedinica ima jedna ova (`kg` = 1000 `g`) |
| `active` | true | neaktivna se više ne bira za nove artikle |

- Osnovna jedinica grupe ima `base_code = code` i `factor = 1`.
- Primeri: `mm` (osnovna, 1), `cm` (`base` mm, 10), `m` (`base` mm, 1000); `g` (1), `kg` (1000), `t` (1.000.000); `ml` (1), `l` (1000), `hl` (100.000); `kom` (1).
- Tvoj primer („čuva mm, prikaz m, faktor 1000“) je zapis `m` sa `base_code = mm` i `factor = 1000`; osnovna jedinica je uvek ista za celu grupu, pa su m i cm usklađeni i artikli se mogu prebacivati između njih.
- Podrazumevane jedinice se dodaju pri pokretanju (samo ako ne postoje). `code`, `base_code` i `factor` se ne menjaju kad se jedinica koristi (nova jedinica umesto izmene); `name_*`, `symbol` i `active` mogu.
- Dozvoljeni unos u prikaznoj jedinici je onaj koji daje ceo broj osnovnih (3,5 kg → 3500 g; 0,0005 kg se odbija).
- Upravlja superadmin (portal stranica „Jedinice mere“); `GET /units` čitaju svi prijavljeni (mobilna i portal ga učitaju pri pokretanju, uz podrazumevani spisak ako zahtev ne uspe).

## Faze

### J1 — Backend (urađeno)
- `units` (indeks po `code`), seed podrazumevanih, `GET /units`, `POST /units`, `PUT /units/{code}` (superadmin; ograničenja izmene kao gore), audit.
- `Product.unit` (kod; `ProductInput.unit` None = zadrži / `kom` pri pravljenju); `ProductOut` vraća `unit` objekat (`code`, `symbol`, `base_symbol`, `factor`). Promena jedinice 409 ako artikal ima zalihu, kretanja ili porudžbine, osim u istu grupu; `pieces_per_package`/`package_barcode` > 0 samo za `kom` (400).
- `OrderItem` snimi `unit_code`, `unit_symbol`, `unit_factor`; stari dokumenti = `kom`/1. `calc.py`: `price × qty / factor`; `effective_qty` ostaje isti. Unos količine ostaje ceo broj (osnovna jedinica).
- Skeniranje (`scan_qty`) i kutije samo za `kom`. Rezervacije, FEFO, serije, kretanja i uvoz rade nepromenjeno jer su celi brojevi u osnovnoj jedinici artikla.
- Testovi: seed i izmena jedinice, cena × količina (3,5 kg × 1000), zaključavanje jedinice, pakovanje samo za komad, snimak na porudžbini ne menja se kad se jedinica izmeni, stari artikli bez polja = `kom`, tuđi klijent, uvoz sa jedinicom.

### J2 — Portal, mobilna, uvoz
- Zajednički `units` helper (portal `lib/units.ts`, mobilna `src/utils/units.ts`): `toBase(value, unit)` i `fromBase(qty, unit)` sa proverom celog broja i formatiranjem (decimale do potrebnih mesta).
- Portal: stranica „Jedinice mere“ (superadmin), select jedinice u formi artikla (zaključan kad je u upotrebi), prikaz količine i cene sa jedinicom u listama, na zalihi, narudžbini, računu i otpremnici.
- Mobilna: unos količine u prikaznoj jedinici (decimale za kg/l/m), prikaz jedinice u katalogu, korpi, računu i magacinu; `calc.ts` sa faktorom; unos u `StockScanPanel` ostaje u komadima za `kom` (skener se ne menja, pa je OTA dovoljan).
- Excel uvoz artikala: kolona „Jedinica mere“ (kod ili naziv; prazno = zadrži / `kom`) i primer fajl.

### J3 — Veza tank → flaša (po potrebi)
- `products.source_product_id` + `content_qty` (u osnovnoj jedinici izvora): otprema flaše skida `picked × content_qty` sa izvornog artikla (serije po FEFO, flaša nosi rok izvorne serije), stanje flaše se računa iz izvora (`floor`), rezervacije množene sadržajem. Isti odgovori kao ranije: rok po tanku, flaša nasleđuje rok serije, gotove flaše (`own`) i operacija „flasiranje“ kao opcija.

## Otvoreno
- Da li jedinice mogu da se prave i po klijentu, ili samo globalno (predlog: samo globalno, jedan spisak).
- Prikaz cene na računu: „1.000,00 din/kg“ (simbol jedinice iz snimka porudžbine).
