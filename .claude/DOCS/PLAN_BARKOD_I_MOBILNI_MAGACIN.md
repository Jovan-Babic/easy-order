# Plan: barkod, mobilni prijem/popis i uvoz artikala

Nadovezuje se na `PLAN_STANJE_MAGACINA.md` (S1–S3 gotovo, PR #4). Stanje se do sada unosi samo u portalu; mobilna samo prikazuje „Na stanju / Slobodno“.

## Cilj

Magacioner sa telefona: skenira barkod proizvoda, unese količinu i radi **prijem** ili **popis**. Isti skener služi i za brzo pronalaženje proizvoda. Uvoz artikala (CSV/Excel) puni i barkodove.

## Status

✅ B1, B2 i B3 urađeni zajedno (odluka: barkod komada, transportno pakovanje je samo kutija; uvoz isključivo Excel `.xlsx`). B4 nije rađen.
Primer fajla za uvoz: `.claude/DOCS/primer-uvoz-artikala.xlsx` (8 artikala, jedan bez barkoda, cene kao broj i kao tekst sa zarezom).
Napomena: uvoz traži `openpyxl`; B3 traži `expo-camera` (nativno → novi APK preko „Release Android“).

## Odluke (bile otvorene, sada potvrđene)

1. **Skeniranje, ne slikanje:** `expo-camera` čita barkod uživo (EAN-13/EAN-8/Code128/QR). Količinu unosi čovek; ne prepoznaje se sa fotografije.
2. **Barkod je jedinstven po klijentu** (parcijalni unique indeks na `client_id` + `barcode`). Jedan proizvod, jedan glavni barkod (kasnije moguće lista za barkod pojedinačnog i transportnog pakovanja).
3. **Jedinica barkoda:** pretpostavka je komad. Ako treba i barkod transportnog pakovanja, dodaje se `transport_barcode` (faza B4) i skeniranje tada množi sa `boxes_per_transport`.
4. **Nepoznat barkod pri skeniranju:** nudi se „Poveži sa proizvodom“ (izbor proizvoda, snimi barkod) za admina i magacionera.
5. **Uvoz:** Excel `.xlsx` (odluka korisnika; lakše za korisnike od CSV). Kolone prepoznaje po nazivu (srpski ili engleski), šablon se preuzima iz portala.

## Faze

### B1 – Backend i portal: polje barkod (mali)
- `Product.barcode`, `ProductInput.barcode` (trim, samo cifre/slova, max 32), unique indeks po klijentu (parcijalni, samo kad postoji). Duplikat → 409.
- `GET /products/by-barcode/{code}` (scoped, 404 ako nema).
- Portal: polje „Barkod“ u formi proizvoda i kolona u tabeli; stranica „Stanje“ pretraga i po barkodu.
- Mobilna admin forma proizvoda: polje barkod (kucanje; skener dolazi u B3).
- Testovi: unikatnost, 404 tuđ klijent, pretraga.

### B2 – Uvoz artikala (srednji)
- `POST /products/import` (manager): prima CSV, kolone: `name, barcode, manufacturer, price_no_vat, vat_rate, pieces_per_package, boxes_per_transport, stock_qty`. Režim `dry_run=true` vraća pregled (novi / izmena / greška po redu) bez upisa; potvrda upisuje.
- Ključ za spajanje: `barcode`, a ako ga nema, tačno ime. Postojeći proizvod se ažurira samo poljima koja su u fajlu.
- Početno stanje iz kolone `stock_qty` ide kao kretanje `adjustment` (napomena „uvoz“), da istorija ostane potpuna.
- Limit veličine (Vercel 4,5 MB) i broja redova (npr. 2000).
- Portal: dugme „Uvoz“ na stranici proizvoda: izbor fajla → pregled → potvrda. Šablon za preuzimanje.
- Testovi: dry run, duplikati barkoda u fajlu, loš red ne obara ostale, scoping.

### B3 – Mobilna: skener + prijem + popis (srednji, traži novi APK)
- `expo-camera` (plugin + `CAMERA` dozvola u `app.json`) → **nativna izmena, potreban „Release Android“**, ne samo OTA.
- Komponenta `BarcodeScanner` (modal, `CameraView onBarcodeScanned`, debounce, vibracija, ručni unos kao rezerva kad kamera nije dozvoljena).
- Magacin tab dobija prekidač: **Pakovanje | Prijem | Popis**.
  - **Prijem:** skeniraj → proizvod i trenutno stanje → količina → doda se u listu → „Potvrdi prijem“ (`POST /stock/receipts` sa više stavki, jedna napomena).
  - **Popis:** skeniraj → prikaz knjižnog stanja → unos izbrojane količine → lista razlika → „Potvrdi popis“ (`POST /stock/adjustments` po stavci; napomena obavezna, jedna zajednička).
  - Nepoznat barkod → „Poveži sa proizvodom“ (B1 endpoint za izmenu barkoda).
- Katalog (komercijalista): skener kao brza pretraga proizvoda.
- i18n sr/en, bez hardkodovanih boja.
- Postojeći backend `/stock/*` ostaje isti; verovatno treba jedan `POST /stock/adjustments/batch` da popis ne šalje desetine zahteva (atomično, jedna napomena).

### B4 – Opciono
- ✅ Urađeno kao `package_barcode` (barkod kutije, množi sa `pieces_per_package`; `boxes_per_transport` se ne koristi): polje na proizvodu, `by-barcode` vraća `scan_unit`/`scan_qty`, skener u Prijemu/Popisu dodaje celu kutiju, Excel kolona „Barkod kutije“. Rok trajanja se i dalje obavezno unosi pri prijemu.
- Štampa barkod nalepnica iz portala.
- Offline red čekanja za popis u magacinu sa lošim signalom.

## Redosled i izdanje

B1 → B2 → B3. B1 i B2 su backend + portal (deploy na Vercel). B3 je jedini deo sa novim APK-om; pre toga treba da su podaci (barkodovi) uneti, inače skener nema šta da prepozna.

## Rizici

- **Podaci:** barkodovi za postojeće proizvode moraju da se unesu (uvoz iz B2 je za to).
- **Kamera:** slabo svetlo/oštećen barkod; zato ručni unos kao rezerva.
- **Dozvole i APK:** korisnici moraju da instaliraju novi APK da bi dobili skener.
- **Istovremeni popis:** dva magacionera istovremeno; popis je razlika do izbrojane količine, pa se druga izmena računa prema tada važećem stanju (u istoriji se vidi oba).

## Procena obima

B1 mali, B2 srednji, B3 srednji (najviše posla u UI i nativnom testiranju na uređaju), B4 po potrebi.

## Plan za dalje (backlog)

Urađeno u ovoj iteraciji:
- [x] Admin vidi tab Magacin u mobilnoj aplikaciji (klijent koji ima samo admin nalog može da radi prijem, popis i pakovanje; početni tab mu ostaje Porudžbina).
- [x] Pojednostavljen ekran za nepoznat barkod: prvo dva izbora ("Dodaj novi artikal" / "Poveži sa postojećim"), lista artikala se prikazuje tek kad se izabere povezivanje.

Otvoreno (nije zatraženo, samo zabeleženo):
- [ ] Admin stranica „Podešavanja“ u portalu.
- [ ] Uloga dostavljača / status `completed`.
- [ ] Skener: tap-to-focus i baterijska lampa (ako se ispostavi da uređaji slabo hvataju barkod).
