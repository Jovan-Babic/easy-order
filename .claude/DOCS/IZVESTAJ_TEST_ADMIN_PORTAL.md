# Izveštaj: test portala za ulogu „admin“ (administrator firme)

Datum: 2026-11-03 · Osnova: `main` + izmene iz PR-a #26 (popravke magacin role) · Tester: Claude

## 1. Šta je testirano i kako

Sve nad **probnim backendom u memoriji** (mongomock, izmišljeni podaci „Veleprodaja Morava“, drugi tenant „Tenant B“ za izolaciju) i lokalnim `next dev` portalom. Prava baza nije dotaknuta. Samo analiza - ništa u kodu nije menjano.

| Sloj | Metod |
|---|---|
| Backend API kao admin | ~120 poziva: 23 superadmin-only rute, 14 pristupa tuđem tenantu, filteri `client_id`, eskalacija privilegija, mass assignment, validacija ulaza (~25 slučajeva), uvoz Excela (formule, 20k redova, zip bomba, neispravan fajl), otpremanje slike, tok statusa (override), brisanja, lozinke |
| Portal UI kao admin | Playwright: prijava, meni, 15 stranica (greške u konzoli, HTTP greške ≥ 400, horizontalni overflow), XSS imena kupca/artikla/korisnika/telefona na svim listama, telefon (obaveštenje „samo računar“) |
| Pregled koda | `create_user`, `update_user`, `delete_user`, kupci, artikli (`ProductInput`), `upload-image`, status porudžbine |

## 2. Sažetak

**Nema kritičnih nalaza.** Autorizacija, izolacija tenanta i zaštita od XSS-a su u redu. Glavni problem je **skoro potpuno odsustvo validacije podataka** koje admin unosi (artikli, kupci, korisnici), što omogućava nelogične porudžbine (potvrđeno: porudžbina sa negativnom cenom prošla, ukupno −240 din). Drugi važan nalaz je da admin može da postavi **sopstvenu lozinku bez stare**.

| # | Nalaz | Ozbiljnost | Potvrđeno |
|---|---|---|---|
| A1 | Nema validacije artikala, kupaca i korisnika (negativna cena, PDV −5/500, popust −10/150/200, prazno ime, stringovi od 1 MB, 100.000 popusta, loš email/PIB kupca, `javascript:` u slici) | Srednja–visoka | Da |
| A2 | `PUT /users/{moj id}` menja sopstvenu lozinku bez stare lozinke (zaobilazi `change-password`) | Srednja | Da |
| A3 | Admin postavlja lozinku drugim korisnicima i zna je do prve promene (suprotno pravilu „samo pozivnica“) | Niska–srednja | Da |
| A4 | Radnje admina nisu u audit logu (korisnici, reset lozinke, override statusa, brisanja) | Niska–srednja | Kod |
| A5 | Brisanje kupca/artikla/korisnika je trajno, bez upozorenja i bez veze sa istorijom | Niska | Da |
| A6 | Otpremanje slike veruje samo `Content-Type` zaglavlju; bez Cloudinary konfiguracije vraća 500 (treba 503) | Niska | Da |
| A7 | Pozitivno: `limit` na uvoz i zip bomba rade (400) | - | Da |

## 3. Nalazi u detalju

### A1 — Nema validacije unosa (srednja–visoka)
**Gde:** `ProductInput`, `CustomerInput`, `UserInput` u `backend/server.py` (polja su goli `float`/`str` bez ograničenja).
**Dokaz (admin, API):**

| Unos | Rezultat |
|---|---|
| artikal `price_no_vat: -5` | 200 prihvaćeno |
| `vat_rate: 500` / `-5` | 200 |
| `discount: 150` / `-10`, `discounts: [200]`, `additional_discounts: [-1]` | 200 |
| `name: ""` (artikal, kupac, korisnik) | 200 |
| ime od 1 MB (artikal, korisnik), adresa 1 MB (kupac), telefon 1 MB (korisnik) | 200 |
| 100.000 popusta na jednom artiklu | 200 |
| `pieces_per_package: -3`, `price_no_vat: 1e308` | 200 |
| kupac: PIB `abc<script>`, email `notanemail` | 200 |
| `image: "javascript:..."` | 200 (browser samo prijavi `ERR_UNKNOWN_URL_SCHEME`, ne izvršava) |
| korisnik: email `nope` | 422 (jedino ovo je validirano) |

**Posledica:** komercijalista može da napravi porudžbinu sa **negativnom cenom** - testirano: artikal sa cenom −100, 2 kom → `totals: {subtotal −200, vat −40, grand −240}`. Popust preko 100 % daje negativne stavke; ogromni stringovi nadimaju dokumente i usporavaju liste; PIB sa slovima završava na fakturi.
**Predlog:** Pydantic ograničenja: `price_no_vat ≥ 0`, `vat_rate` 0–100, popusti 0–100 (liste do ~20 stavki), `name` 1–200, adresa/telefon/email dužine i `EmailStr`, PIB 9 cifara (a prazan dozvoljen), `image` samo `https://` URL ili prazno, `pieces_per_package`/`boxes_per_transport` ≥ 0. Isto u portalu i mobilnoj aplikaciji radi poruka greške pre slanja. Postojeće loše podatke proveriti jednokratnom skriptom (u produkciji).

### A2 — Sopstvena lozinka bez stare (srednja)
`update_user` dozvoljava adminu da `PUT /users/{svoj id}` sa `password` → 200, token se poništava, ali nova lozinka je postavljena **bez znanja stare**. `change-password` traži staru lozinku upravo da ukradena/ostavljena sesija ne bi mogla da preuzme nalog. Ko ima sesiju admina (npr. nezaključan računar) može tako trajno da preuzme nalog.
**Predlog:** u `update_user` odbiti `password` kada je `user_id == current_user.id` (ili tražiti `current_password`), a portal formu za sopstvenu lozinku vezati samo za `/auth/change-password`.

### A3 — Admin zna lozinku koju postavi drugome (niska–srednja)
`PUT /users/{id}` sa `password` (admin → operater/magacioner) radi; korisnik mora da je promeni pri prvoj prijavi (`must_change_password: true`, potvrđeno), ali admin do tada može da se prijavi kao on. CLAUDE.md navodi „nijedan endpoint ne prihvata lozinku koju bira onaj ko pravi nalog“ - ovo je izuzetak. **Predlog:** umesto lozinke, „pošalji novu privremenu lozinku“ (generisanu na serveru, kao pri pozivnici) ili link za reset.

### A4 — Radnje admina nisu u audit logu (niska–srednja, iz koda)
`_audit()` se poziva samo kad je akter superadmin (`if current_user.role == Role.SUPERADMIN`). Kreiranje, deaktivacija, brisanje korisnika, reset lozinke, override statusa porudžbine i brisanje kupaca/artikala/porudžbina nemaju trag. U firmi sa više admina nema odgovora na „ko je ovo uradio“. **Predlog:** audit za admin akcije (ista kolekcija sa `client_id`), pregled na portalu za admina.

### A5 — Trajna brisanja (niska)
Obrisan je kupac koji ima porudžbine (200), artikal korišćen u porudžbinama (200) i operater sa porudžbinama (200). Istorija ostaje čitljiva zbog snapshot-a (`customer_name`, `created_by_name`), ali nestaju adresa/telefon kupca za staru otpremnicu, a artikal i kupac se ne mogu povratiti. Nema potvrde u API-ju (UI traži potvrdu, nije proveravano). **Predlog:** za kupce/artikle koji imaju istoriju ponuditi deaktivaciju umesto brisanja (artikli to već imaju: `active`).

### A6 — Otpremanje slike (niska)
Proverava se samo `Content-Type` iz zahteva (`IMAGE_ALLOWED_TYPES`), ne sadržaj; u praksi Cloudinary odbija/konvertuje ne-slike. Veličina je ograničena (4 MB). Bez konfigurisanog Cloudinary-a vraća 500 umesto 503. **Predlog:** proveriti magic bytes (JPEG/PNG/WEBP/HEIC) pre slanja; 503 za nepodešen servis.

## 4. Provereno i radi ispravno

- **Matrica prava:** admin dobija 403 na svih 23 superadmin-only ruta (`/clients`, `/plans`, `/payments`, `/subscriptions`, seats, `/audit`, `/settings`, `/announcements`, `/billing/drafts|clients`, `/units` upis, `/superadmin/*`, `/stats/clients/*`, blokiranje pretplate, izmena modula…).
- **Izolacija tenanta:** čitanje/izmena/brisanje porudžbina, kupaca, artikala, korisnika, prijem zalihe, fokus, ciljevi, serije tuđe firme → 404; filteri `?client_id=` ne otkrivaju tuđe podatke (kupci, artikli, porudžbine, fokus, kretanja zalihe, izveštaji, ciljevi, korisnici); `client_id` u telu kupca/artikla se ignoriše; porudžbina za tuđeg kupca → 400; uvoz sa `client_id` tuđe firme ostaje u svojoj.
- **Eskalacija:** admin ne može da napravi admina/superadmina, ne može da promeni ulogu operatera u admina (403), ne može sebi da promeni ulogu ni da se deaktivira (403), ne može da obriše sebe (400). Mass assignment (`client_id`, `token_version`, `password_hash`, `email`, `must_change_password` u `PUT /users`; `stock_qty`, `client_id` u `PUT /products`) se ignoriše.
- **Lozinke:** slaba lozinka preko admina → 400; `forgot-password` isti odgovor za postojeći i nepostojeći nalog (nema enumeracije).
- **Tok statusa:** admin override traži belešku, otpremanje traži označene stavke, broj fakture se dodeljuje i ostaje isti pri vraćanju; brisanje ne-nove porudžbine 409.
- **Uvoz Excela:** nevalidan/oštećen fajl 400, ne-xlsx 400, 20.000 redova 400 (limit), zip bomba 400, ćelija sa formulom (`=cmd|...`) nije upisana kao ime artikla (razlog odbijanja nisam dalje ispitivao).
- **Portal:** svih 15 stranica admina se učitava bez grešaka u konzoli i bez HTTP greški ≥ 400; nema horizontalnog overflow-a; meni kompletan (Kontrolna tabla, Korisnici, Nalozi i paket, Zaduženja, Proizvodi, Kupci, Magacin, Izveštaji, Roba u fokusu, Ciljevi, Stanje, Narudžbine, Uputstvo, Promeni lozinku); na telefonu admin dobija obaveštenje „portal samo na računaru“.
- **XSS:** ime kupca/artikla/korisnika/proizvođača/telefon sa `<img onerror>` i `<script>` prikazani kao tekst na stranicama Kupci, Proizvodi, Korisnici, Ciljevi, Stanje, Narudžbine; `window.__xss` ostaje nedefinisan.

## 5. Preporučeni redosled

1. **A1** (validacija) - najveći praktičan rizik; jedna izmena u modelima + provera u formama + jednokratna provera postojećih podataka.
2. **A2** (sopstvena lozinka) - mala izmena, jasan sigurnosni efekat. Uz **A3** u istom PR-u.
3. **A4** (audit admin radnji) i **A5** (deaktivacija umesto brisanja) - po potrebi, veći posao.
4. **A6** - sitna popravka.

## 6. Ograničenja testa

Nije testirano: stvarni SMTP (pozivnice), Cloudinary otpremanje, plaćanja/pretplata admina (`/billing` sa stvarnim podacima), mobilna aplikacija admina (`admin.tsx`), rad pri isključenim modulima, popunjeni limiti naloga (`seats`) i mrežne trke.
