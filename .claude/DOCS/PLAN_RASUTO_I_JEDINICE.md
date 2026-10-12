# Plan: rasuta roba (tank) i jedinice mere

Cilj: zaliha može da se vodi u litrima, kilogramima i drugim jedinicama, a flasirani artikal (npr. ulje 0,5 l) pri otpremi smanjuje zalihu rasute robe (tanka). Predvideti i gotove flaše na lageru, i artikle koji se prodaju po težini.

## Odlučeno
- Za trenutnog klijenta se flasira **po porudžbini**: tank je jedina istina, gotove flaše se ne vode na stanju. Ali model mora da dozvoli i gotove flaše (faza R3).
- Artikli koji se prodaju po težini ili zapremini nisu potrebni odmah, ali se predviđaju (faza R4).
- `pieces_per_package` ostaje kao pakovanje komada (šteker od 12 flaša); ne menja se.
- Količina se čuva kao **ceo broj u najmanjoj jedinici** (bez decimalnih grešaka); prikaz i unos mogu u većoj jedinici.

## Jedinice (`UNITS` u backendu, isti spisak u portalu i mobilnoj)

| Vrsta | Osnovna (čuva se) | Ostale (faktor prema osnovnoj) |
|---|---|---|
| `count` | komad | - |
| `mass` | g | kg = 1000, t = 1.000.000 |
| `volume` | ml | l = 1000, hl = 100.000 |
| `length` | mm | cm = 10, m = 1000 |

- Pretvaranje samo unutar iste vrste. Litri u kilograme (gustina) se ne radi.
- API prima količinu u **osnovnoj jedinici (ceo broj)**; pretvaranje iz prikazne jedinice radi klijent (portal/mobilna) pomoću `UNITS`. Server odbija nepoznatu vrstu i negativne ili necele vrednosti.
- Unos „0,5 l“ postaje 500 ml. Kad unos nije celobrojan u osnovnoj jedinici, odbija se.

## Model

### Rasuta stavka (`bulk_items`)
- `id`, `client_id`, `name`, `dimension` (`mass`/`volume`/`length`), `display_unit` (npr. `l`), `stock_qty` (ceo broj u osnovnoj jedinici; `null` = ne vodi se), `track_expiry`, `active`, `created_at`.
- Dostupno samo uz modul **Magacin stanja** (`stock`); rokovi uz modul `expiry`.
- Prijem, popis (pojedinačni i `batch`) i otpis rade isto kao za artikle; svako kretanje je zapis u `stock_movements` sa `bulk_item_id`.

### Artikal vezan za rasutu stavku
- `products.bulk_item_id` i `products.content_qty` (koliko osnovnih jedinica rasute stavke ima jedan komad, npr. 500 za 0,5 l). Oba zajedno ili nijedan.
- `products.stock_source`: `bulk` (zaliha se računa iz tanka, podrazumevano kad je veza postavljena) ili `own` (gotove flaše na lageru, faza R3). Bez veze = `own` kao do sada.
- Za `bulk`: `stock_qty` se **ne čuva** nego računa: `floor(tank / content_qty)`; `reserved_qty` se računa u komadima kao do sada, a `available_qty` = `floor((tank − rezervisano × content_qty) / content_qty)`.
- Otprema artikla (`shipped`) pravi kretanje na **tanku** (`−picked_qty × content_qty`, tip `shipment`, uz `product_id` radi pregleda); povratak iz `shipped` vraća isto (`reversal`). Negativno stanje je dozvoljeno kao i sada.
- Artikal bez veze radi tačno kao do sada.

### Rokovi trajanja (R3)
- `stock_batches` dobija vlasnika: `product_id` ili `bulk_item_id` (jedinstveno po vlasniku i datumu). FEFO i otpis rade nad tankom. Artikal vezan za tank ne ume sam da prati rok.

### Gotove flaše (R3)
- Artikal sa vezom i `stock_source = own` vodi svoje komade. Operacija **flasiranje** `POST /stock/fill` (`product_id`, `qty` komada): tank −`qty × content_qty`, artikal +`qty` (kretanja `fill`). Otprema tada skida sa sopstvene zalihe artikla, a ne sa tanka.
- Prelaz `bulk` ↔ `own` je dozvoljen samo kad su obe strane usklađene (vidi „Otvoreno“).

### Prodaja po težini/zapremini (R4)
- `products.unit` (vrsta, osnovna jedinica, `display_unit`) i `products.price_unit` (cena je „po kg“). Podrazumevano `count`/komad kao sada.
- `ordered_qty` i `picked_qty` ostaju celi brojevi, ali u **osnovnoj jedinici artikla** (12,5 kg = 12500 g). `OrderItem` snimi `unit`, `unit_factor` (osnovnih jedinica u jedinici cene) i cenu; `calc.py` (i `frontend/src/calc.ts`) računa `cena × količina / faktor`. Za komadne artikle je faktor 1, pa se ništa ne menja.
- Račun, otpremnica, mobilni unos količine i izveštaji prikazuju količinu u prikaznoj jedinici.
- Zaliha težinskog artikla je u istoj jedinici (ili vezana za tank), pa isti mehanizam važi.

## Faze

### R1 — Jedinice i rasuto (backend)
- `UNITS`, validacija količina, `bulk_items` CRUD (`require_stock_writer` za stanje, `require_manager` za definiciju), prijem/popis/otpis/popis u paketu za rasuto, istorija kretanja.
- Veza artikla (`bulk_item_id`, `content_qty`), izvedeni `stock_qty`/`reserved_qty`/`available_qty`, otprema i povratak, `GET /products` i `by-barcode` vraćaju izvedene vrednosti.
- Izmena `update_product` (veza se menja samo od menadžera); `product.stock_qty` se ne piše za `bulk` artikle.
- Testovi: sabiranje i oduzimanje, floor pri računanju komada, rezervacije, otprema i povratak, negativno stanje, tuđi klijent 404, modul `stock` isključen, nepoznata jedinica, necela količina.

### R2 — Portal, mobilna i uvoz
- Portal: stranica Zalihe dobija tab „Rasuto“ (lista, prijem, popis u izabranoj jedinici); u formi artikla izbor rasute stavke i sadržaja po komadu; prikaz „X l / ≈ Y komada“.
- Mobilna: magacin (prijem/popis) za rasuto sa izborom jedinice; katalog i dalje u komadima.
- Excel uvoz artikala: kolone `Rasuta stavka` i `Sadržaj po komadu (jedinica)`; uvoz rasutih stavki (naziv, vrsta, početno stanje).
- OTA je dovoljan ako se ne dira `BarcodeScanner` (nativni modul se ne menja).

### R3 — Rok na tanku i gotove flaše
- Serije po vlasniku (`bulk_item_id`), FEFO za tank, upozorenja o roku za rasuto; operacija flasiranje i `stock_source = own`.

### R4 — Težinski artikli
- Jedinica artikla i cena po jedinici, snimak u `OrderItem`, `calc.py`/`calc.ts`, račun/otpremnica, mobilni unos količine sa decimalama u prikaznoj jedinici, uvoz i izveštaji.

R1 i R2 pokrivaju trenutnog klijenta (ulje u tankovima); R3 i R4 se rade kad zatrebaju, ali model iz R1 ih ne blokira.

## Otvoreno (predlog u zagradi)
- Rok trajanja ulja: da li se vodi po tanku (serija u tanku) ili po flaši? (R3, po tanku.)
- Kad artikal ima gotove flaše (`own`) i vezu: da li otprema prvo skida gotove flaše, pa ostatak iz tanka? (Ne: jedan izvor po artiklu, da stanje ne bude dvosmisleno.)
- Zaokruživanje pri izdavanju iz tanka: celi komadi po `content_qty`; gubici (prosipanje, mernih razlika) se evidentiraju kao popis ili otpis tanka.
- Barkod rasute stavke: nije potreban (skenira se artikal).
