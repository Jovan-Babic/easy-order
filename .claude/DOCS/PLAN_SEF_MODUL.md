# Plan: SEF modul (slanje izlaznih faktura na Sistem elektronskih faktura)

Datum: 2026-11-06 · Status: plan (ništa nije implementirano) · Osnova: `PLAN_SEF_I_ERP.md` (odeljci 9 i 10) i zvanična API specifikacija SEF-a od 31.07.2026.

Cilj: mala firma koja koristi Easy Order, a nema ERP, **izdaje fakturu sa porudžbine i šalje je na SEF**, vidi status i može da je otkaže/stornira. SEF modul je nezavisan od ERP-a.

## 1. Obim

**Ulazi u prvu verziju (MVP)**
- Izlazne fakture u dinarima, samo PDV kategorija **S** (stope 20 % i 10 %).
- Izdavanje sa porudžbine (jedna porudžbina = jedna faktura), pregled/validacija pre slanja, slanje, praćenje statusa, otkazivanje (dok je nacrt/nova) i storno (posle slanja), PDF sa SEF-a.
- Provera da li je kupac na SEF-u pre slanja.
- Podešavanje API ključa klijenta (demo i produkcija), provera veze.
- Upozorenja za neposlate i odbijene fakture pred rok PDV-a.
- Izvoz izdatih faktura (Excel) za računovođu.

**Ne ulazi (kasnije, po potrebi klijenta)**
- Avansne fakture, knjižna odobrenja/zaduženja kao posebni tokovi, strana valuta, PDV izuzeća i obrnuto obračunavanje (kategorije osim `S`), budžetski korisnici (JBKJS/CIR), više porudžbina u jednoj fakturi.
- Ulazne fakture, PDV evidencija (EPP/EEO), e-otpremnice (zaseban modul).

## 2. Odluke koje treba doneti pre početka (sa preporukom)

| # | Pitanje | Preporuka |
|---|---|---|
| D1 | Zavisi li SEF modul od modula Magacin? | **Ne.** Mali proizvođač nema magacionera. `MODULE_REQUIRES` ostaje bez `sef`. |
| D2 | Ko i kada izdaje fakturu? | **Admin**, dugmetom „Izdaj fakturu“ na porudžbini u statusu `shipped` (klijent sa magacinom) ili `new/in_progress` (bez magacina). Automatsko izdavanje pri otpremi tek u kasnijoj fazi. |
| D3 | Zaokruživanje | `calc.py` danas **ne zaokružuje po stavci** (sabira neokrugle iznose, zaokružuje ukupno), a SEF traži iznose po stavci i PDV po kategoriji. Preporuka: nova funkcija `invoice_amounts(order)` u `calc.py` (stavka = zaokružena na 2 decimale, osnovica po kategoriji = zbir zaokruženih stavki, PDV = `round(osnovica × stopa)`), **plus** ista pravila za prikaz ukupnog iznosa porudžbine posle otpreme, da faktura i porudžbina imaju iste cente. To je izmena iznosa na ekranu (razlika par para); odobriti pre implementacije. Sinhronizovati `frontend/src/calc.ts`. |
| D4 | Numeracija | Koristiti postojeći brojač (`PREFIX/0001`) i ručni režim. Broj se dodeljuje **tek kad prođe validacija** (`executeValidation=true`), neposredno pre pravog slanja. Tako odbijene probne validacije ne troše brojeve. |
| D5 | Datum izdavanja | **Danas** u trenutku slanja (SEF ima greške o razlici od današnjeg datuma, **[proveriti na demo SEF-u]**). Datum prometa: `shipped_at`, a bez magacina datum koji admin izabere (ne posle datuma izdavanja). |
| D6 | Kupac van SEF-a | Ako provera kaže da kupac nije registrovan, **ne šaljemo** i javljamo jasnu poruku; faktura se ne gubi (ostaje nacrt u našem sistemu uz PDF za ručno slanje). |
| D7 | Rok plaćanja | Podešavanje klijenta („rok plaćanja u danima“, podrazumevano 15) + izmena po fakturi. |

## 3. Podaci i model

**Nova polja (postojeće kolekcije)**
- `clients`: strukturirana adresa (`street`, `city`, `postal_code`, `country` = RS), `vat_payer` (da/ne), `sef` objekat: `{enabled, env: demo|production, api_key_enc, key_set_at, last_check_at, last_check_ok, payment_terms_days}`. **API ključ se čuva šifrovan** (Fernet, ključ iz env `INTEGRATION_SECRET`), nikad se ne vraća kroz API (samo „postavljen“ i vreme), ne ulazi u logove.
- `customers`: `registration_number` (matični broj), strukturirana adresa (`street`, `city`, `postal_code`, `country`), zadržati postojeći `address` kao slobodan tekst radi prikaza. Uvoz iz Excela (`Naziv, Adresa, Email, Telefon, PIB`) dobija nove kolone.
- `units`: `ubl_code` (UN/ECE: kom→`H87`, kg→`KGM`, g→`GRM`, l→`LTR`, ml→`MLT`, m→`MTR`, …). Početno popunjavanje + provera prema `GET /api/publicApi/get-unit-measures`. Jedinica bez koda blokira izdavanje sa jasnom porukom.
- `orders`: `einvoice_id`, `sef_status` (denormalizovano radi liste), `invoice_issued_at`.

**Nova kolekcija `einvoices`** (append-only istorija pokušaja, jedna **aktivna** po porudžbini):
`id`, `client_id`, `order_id`, `request_id` (jedinstven, šalje se SEF-u kao `requestId`), `number`, `kind` (invoice|storno), `issue_date`, `delivery_date`, `due_date`, `amounts` (zaokruženi iznosi koji su poslati), `ubl_xml`, `sef_invoice_id`, `status` (draft, validated, sending, sent, approved, rejected, cancelled, storno, error), `sef_status_raw`, `error_code`, `error_text`, `created_by`, `created_at`, `sent_at`, `updated_at`. Indeksi: `(client_id, order_id)` jedinstven za aktivnu fakturu, `request_id` jedinstven, `(client_id, status)`.

## 4. Backend

Novi fajl `backend/sef.py` (server.py ne raste dalje):
1. **Šifrovanje ključa** (`encrypt_key/decrypt_key`).
2. **Mapiranje** porudžbine u UBL: prodavac/kupac, stavke (jedinica, količina u jedinici fakturisanja = `picked_qty / unit_factor`, cena, rabati kao `AllowanceCharge`), kategorije `S` 20/10, `TaxTotal`, `LegalMonetaryTotal`, datumi (`IssueDate`, `DueDate`, `ActualDeliveryDate`, `InvoicePeriod/DescriptionCode`), `PaymentMeans` + račun, `CustomizationID urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022`. Fakturišu se `picked_qty` (otpremljeno) ako ih ima, inače naručene količine.
3. **SEF klijent** (httpx, timeout, zaglavlje `ApiKey`, bez logovanja ključa): `validate`, `upload` (sa `requestId`), `status`, `cancel`, `storno`, `pdf`, `check_company`, `unit_measures`, `changes(date)`.
4. **Greške:** mapiranje SEF `ErrorCodes` na naše poruke (srpski/engleski) za najčešće (nema datuma prometa, kupac nije na SEF-u, zbirovi, jedinica, limit slanja); ostalo prikazati sirovo uz šifru.

**Endpointi** (modul `sef` + `require_manager`, 404 za tuđ tenant, audit):
- `GET/PUT /integrations/sef` (admin svoje firme; superadmin sa `client_id`): stanje bez ključa, upis ključa, okruženje, rok plaćanja.
- `POST /integrations/sef/test` → proverava ključ (npr. `getEfakturaVersion`), pamti rezultat.
- `POST /orders/{id}/einvoice/preview` → gradi UBL + validira (`executeValidation`), vraća iznose/greške, **ne troši broj**.
- `POST /orders/{id}/einvoice` → dodeljuje broj, šalje, pamti `SalesInvoiceId`.
- `GET /orders/{id}/einvoice` (osvežava status), `POST .../cancel`, `POST .../storno` (razlog obavezan), `GET .../pdf`.
- `GET /einvoices` (lista sa filterima status/period) i `GET /einvoices/export` (Excel).
- Cron (postojeći dnevni, plus ručno „Osveži“): `POST sales-invoice/changes?date=` i statusi neposlatih/„sending“ faktura; ponovni pokušaj `sending` sa istim `requestId` (noćna pauza SEF-a).
- Dnevnik (`_audit`): `sef.key_set`, `sef.send`, `sef.cancel`, `sef.storno`.

**Pravila koja moramo izmeniti**
- Vraćanje `shipped` porudžbine u `new` (admin override) je **blokirano** dok postoji aktivna faktura u statusu Sent/Approved (prvo storno).
- Brisanje porudžbine sa fakturom je blokirano (već važi 409 za ne-nove).
- Izmena stavki posle izdavanja nije dozvoljena (već važi posle `new`).

## 5. Portal (admin)

- Podešavanja → **Integracije → SEF**: okruženje, polje za ključ (samo upis, maska), „Proveri vezu“, rok plaćanja, uputstvo kako se ključ pravi na SEF-u.
- **Porudžbine**: kolona/značka „SEF“ (nema, nacrt, poslata, prihvaćena, odbijena, storno, greška), dugme „Izdaj fakturu“ → modal sa **pregledom** (kupac, stavke, iznosi po stopama, datumi, upozorenja), zatim „Pošalji na SEF“. Na detalju: status, broj, PDF, „Otkaži“/„Storno“, istorija pokušaja i greške.
- **Fakture** (nova stranica): lista, filteri, upozorenje „X faktura nije poslato / odbijeno“ posebno vidljivo od 1. do 10. u mesecu (rok iz specifikacije PDV evidencije), izvoz Excel.
- Meni: stavka „Fakture“ posle „Narudžbine“ (samo sa modulom `sef`). Prevodi sr/en, uputstvo za admina i `CLAUDE.md`.
- Kupci: polja matični broj + adresa; upozorenje kod kupca bez podataka potrebnih za fakturu.

Aplikacija (mobilna): u prvoj verziji samo prikaz broja i statusa fakture u istoriji (opciono, OTA); izdavanje je u portalu.

## 6. Faze i PR-ovi

| PR | Sadržaj | Prihvatni kriterijum | Procena |
|---|---|---|---|
| **S0. Odluke i demo pristup** | D1–D7 potvrđene; demo API ključ; dozvoljen mrežni pristup `demoefaktura.mfin.gov.rs` za razvoj; pilot klijenti izabrani | spisak odluka potvrđen; ručno poslata probna faktura na demo SEF | 2–3 dana |
| **S1. Podaci** | matični broj, strukturirane adrese (kupci, firma), `units.ubl_code`, uvoz kupaca sa novim kolonama, migracija/popuna, `vat_payer` | kupac i firma imaju sve što UBL traži; stari kupci imaju jasan način dopune | 4–5 dana |
| **S2. Iznosi i UBL** | `invoice_amounts` u `calc.py` (+ `calc.ts`), `sef.py` mapiranje u UBL, testovi iznosa | zlatni XML testovi, svojstveni testovi (zbir stavki = osnovica, PDV po kategoriji, tolerancija 0) za 100+ nasumičnih porudžbina (rabati, grami/ml, 10 % i 20 %) | 5–7 dana |
| **S3. SEF klijent i izdavanje** | modul `sef`, ključ (šifrovan), preview/validacija, slanje sa `requestId`, brojevi (D4), status, `einvoices`, blokade (override) | prolaz na **demo SEF-u**: validna faktura prihvaćena, pogrešna odbijena sa čitljivom porukom; dupli poziv ne pravi drugu fakturu | 7–10 dana |
| **S4. Otkazivanje, storno, status** | cancel/storno, PDF, cron/„Osveži“, ponovni pokušaj, upozorenja pred rok PDV-a | storno i otkazivanje na demo SEF-u; noćna pauza simulirana | 4–5 dana |
| **S5. Portal i uputstvo** | Integracije, modal sa pregledom, kolona SEF, stranica Fakture, izvoz Excel, uputstvo i slike | admin ceo tok prođe bez pomoći; uputstvo ažurirano | 5–7 dana |
| **S6. Pilot** | produkcioni ključ jednog klijenta, prvih 10–20 faktura uz računovođu, ispravke | računovođa potvrđuje iznose i PDV; nijedna faktura odbijena zbog naše greške | 1–2 nedelje |

Ukupno **oko 5–7 nedelja** uključujući pilot (bez pilota 4–5). S1 i S2 mogu da se rade paralelno posle S0.

## 7. Test strategija

- **Jedinični testovi:** mapiranje u UBL (zlatni XML), `invoice_amounts` (svojstveni testovi sa slučajnim ulazima), šifrovanje ključa (ključ se ne pojavljuje u odgovoru ni logu).
- **Integracioni testovi u CI bez interneta:** lažni SEF server (httpx `MockTransport`): uspeh, odbijanje sa `ErrorCodes`, prekid mreže pa ponovni poziv sa istim `requestId`, noćna pauza (503), status prelazi Sent→Approved/Rejected, storno/cancel dozvoljeni samo u pravim statusima.
- **Demo SEF (ručno, pre svakog izdanja):** lista provere: validna faktura, svaka PDV stopa, rabat po stavci, jedinica težine (gramovi), faktura sa 50+ stavki, kupac van SEF-a, odbijanje, storno, PDF.
- **Regresija:** postojeći testovi za porudžbine i iznose moraju da prođu (izmena zaokruživanja iz D3).
- **Bezbednost:** tuđi tenant 404, ključ nikad u odgovorima, samo admin/superadmin, audit upisi.

## 8. Rizici i provere na demo SEF-u

1. **Zaokruživanje (D3):** ako se centi ne slažu, SEF odbija. Rešenje je u S2; potrebna potvrda računovođe.
2. **Pravilo o datumu izdavanja** i ograničenje slanja po SEF paketu (`InvoicesSendingLimitReached`).
3. **Obavezna polja kupca** i ponašanje kada kupac odbije fakturu (status Rejected → storno ili nova faktura).
4. **Promena specifikacije** (CustomizationID se već menjao): verzija specifikacije u kodu + test na demo pri svakoj izmeni.
5. **Odgovornost:** ispravnost fakture je na klijentu; prvih faktura svakog klijenta mora da pregleda računovođa.
6. **Rupe u numeraciji:** ublažene redosledom (validacija pa broj); proveriti sa računovođom pravilo za otkazane fakture.
7. **Serverless:** nema stalnog radnika; sve preko cron-a i ručnog „Osveži“.

## 9. Šta mi treba od tebe

1. Odluke D1–D7 (posebno **D3**, izmena zaokruživanja na ekranu).
2. **Demo SEF nalog i API ključ** (SEF demo portal → Podešavanja → API menadžment), i dozvola ovom okruženju za `demoefaktura.mfin.gov.rs`.
3. Jedan ili dva **pilot klijenta** (da li su u sistemu PDV-a, imaju li SEF nalog) i računovođa za pregled.
4. Primer jedne njihove stvarne fakture (da vidimo uobičajene rabate, stope i jedinice).
