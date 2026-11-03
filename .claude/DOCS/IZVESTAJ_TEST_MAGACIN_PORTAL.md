# Izveštaj: test portala za ulogu „magacin“ (warehouse)

Datum: 2026-11-03 · Grana: `claude/uputstva-bez-lozinki` · Tester: Claude

## 1. Šta je testirano i kako

Sve je rađeno nad **probnim backendom u memoriji** (mongomock, demo podaci „Veleprodaja Morava“, drugi tenant „Tenant B“ za proveru izolacije) i lokalnim `next dev` portalom. Prava baza nije dotaknuta.

| Sloj | Metod |
|---|---|
| Backend API (kao magacioner) | ~100 poziva: matrica prava, pristup tuđem tenantu, validacija ulaza, tok statusa, pakovanje, zaliha, istovremeno otpremanje, tokeni i zaključavanje |
| Portal (Next.js proxy) | `curl` na `/api/*` sa kolačićem magacionera: lista dozvoljenih putanja, proxy ID-jevi, zaglavlja, kolačić |
| Portal UI | Playwright (Chromium): prijava, meni, direktni URL-ovi zabranjenih stranica, rad sa redom za pakovanje, tastatura, otpremnica, XSS imena, simulirane greške 500/401 |
| Pregled koda | `server.py` (porudžbine, status, pakovanje, zaliha), `admin-web/proxy.ts`, `lib/session.ts`, `lib/backend.ts`, `warehouse/page.tsx` |

Skripte su u scratchpad-u sesije (`.../scratchpad/audit/`); nisu u repou.

## 2. Sažetak

**Nema kritičnih nalaza** (nema probijanja autorizacije, nema pristupa tuđem tenantu, nema XSS-a). Najveći rizici su:

1. Portal **proxy ne enkoduje ID** u putanji → „path traversal“ koji zaobilazi listu dozvoljenih putanja portala (backend i dalje štiti, pa nema eskalacije, ali je to slabljenje odbrane u dubini).
2. Stranica Magacin **tiho prikazuje „nema porudžbina“** kad učitavanje padne ili sesija istekne.
3. **Unos količina tastaturom ne radi** (gubi se fokus i vrednost).
4. Porudžbina sa **duplim redom istog artikla ne može da se otpremi**.

| # | Nalaz | Ozbiljnost | Potvrđeno |
|---|---|---|---|
| F1 | Path traversal / query smuggling kroz portal proxy (34 rute) | Srednja (security, odbrana u dubini) | Da |
| F2 | Greška učitavanja / istek sesije = prazan red „nema porudžbina“ | Srednja (funkcionalni) | Da |
| F3 | Tab/tastatura u poljima „Spakovano“ gubi fokus i unos | Srednja (upotrebljivost) | Da |
| F4 | Dupli red istog artikla → porudžbina se ne može otpremiti | Srednja (bug) | Da |
| F5 | Nema sigurnosnih HTTP zaglavlja na portalu | Srednja (security) | Da |
| F6 | `note` pri promeni statusa nema ograničenje dužine (prihvaćeno 3 MB) | Niska–srednja | Da |
| F7 | Odjava ne poništava token (važi do 12 h) | Niska–srednja | Da |
| F8 | Brojač faktura se povećava pre uslovnog upisa statusa (moguće rupe u numeraciji) | Niska–srednja | Samo kod (nije reprodukovano) |
| F9 | Pakovanje prepisuje celu listu stavki (izgubljen upis kod 2 magacionera) | Niska | Samo kod |
| F10 | Nema „vlasništva“ nad preuzetom porudžbinom | Niska (verovatno po dizajnu) | Da |
| F11 | Magacioner dobija više podataka nego što treba (cene, bankovni račun firme…) | Niska / informativno | Da |
| F12 | Zaključavanje naloga posle 5 pogrešnih prijava može da se iskoristi za blokadu tuđeg naloga | Niska (poznat kompromis) | Da |
| F13 | `/api/auth/login` baca 500 na neispravan JSON | Niska | Kod |
| F14 | Red za pakovanje se ne osvežava sam (nema refresh-a/pollinga) | Niska–srednja (UX) | Kod |

## 3. Nalazi u detalju

### F1 — Proxy ne enkoduje ID u putanji (srednja)
**Gde:** `admin-web/app/api/**/route.ts` (34 fajla koriste `` `/orders/${id}` `` i slično; `encodeURIComponent` je u samo 3).
**Šta se desi:** `id` dolazi iz URL parametra (Next ga dekoduje), pa `%2F` i `%3F` stignu do backenda kao `/` i `?`.
**Dokaz** (prijavljen magacioner):
- `GET /api/orders/..%2Fclients%2Fme` → **200**, vraća `/clients/me` (portal inače blokira `/api/clients` za magacin).
- `GET /api/orders/..%2Fguide` → 200.
- `GET /api/orders/<id>%3Fx=1` → 200 (parametar „probija“ u upit ka backendu).
**Uticaj:** zaobilazi samo **listu dozvoljenih putanja portala**; backend i dalje proverava ulogu i tenant (`/users` preko trika daje 403 sa backenda), pa nema eskalacije privilegija. Ali je listu portala pogrešno oslanjati se na nju, a svaka buduća ruta bez dobre backend provere postaje ranjiva.
**Predlog:** u `lib/backend.ts` odbaciti/enkodovati segmente (npr. helper `seg(id)` = `encodeURIComponent`, i odbiti `..`), ili proveravati `id` regexom (`^[A-Za-z0-9-]+$`) u svim rutama.

### F2 — Tiho „nema porudžbina“ pri grešci (srednja)
**Gde:** `warehouse/page.tsx` → `load()`: `if (!ordersRes.ok) throw` → `catch { setOrders([]) }`.
**Dokaz (Playwright):** simuliran 500 i 401 na `/api/orders?...` → stranica pokazuje „NEW 0 / IN PROGRESS 0 / No orders to process“, bez poruke o grešci i bez preusmeravanja na prijavu.
**Uticaj:** magacioner zaključi da nema posla, dok porudžbine čekaju (istek sesije posle 12 h, pad servera, mrežni problem). Isto za listu kupaca (tiho prazna → nema adrese/telefona).
**Predlog:** prikazati grešku i dugme „Pokušaj ponovo“; na 401 preusmeriti na `/login`.

### F3 — Tastatura u poljima „Spakovano“ (srednja)
**Gde:** `warehouse/page.tsx`, polje `onBlur` → `setPicked` → `setBusy(true)` → sva polja `disabled`.
**Dokaz:** upis `3` u prvo polje + `Tab` + `2` → posle toga `document.activeElement` je `BODY`, vrednosti `['3','']`. Drugi unos je izgubljen.
**Uticaj:** pakovanje „kucanjem“ (najbrži način uz čitač) ne radi; mora se kliknuti na svako polje, a unos tiho nestaje.
**Predlog:** ne onemogućavati polja tokom snimanja (samo dugme), ili snimati na `Enter`/„Sve“ i zadržati fokus; ili slati sve stavke jednim zahtevom.

### F4 — Dupli red istog artikla (srednja)
**Gde:** `_resolve_order_lines` ne ukida duplikate `product_id`; `update_picked_items` koristi `by_id = {product_id: item}` (poslednji red pobeđuje); UI koristi `key={product_id}`.
**Dokaz:** komercijalista napravi porudžbinu sa dva reda istog artikla (2 + 3 kom). Magacin može da označi samo jedan red (`picked: [None, 2]`), otpremanje → 400 „Check every item (picked_qty) before shipping“. Porudžbina je zaglavljena (izlaz: odbijanje ili admin override).
**Predlog:** na kreiranju/izmeni porudžbine spojiti iste artikle (ili 400); u pakovanju adresirati stavku po indeksu/ID-ju reda.

### F5 — Nema sigurnosnih zaglavlja (srednja)
Odgovor portala ima samo `X-Powered-By: Next.js`. Nema `X-Frame-Options`/`frame-ancestors`, `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`. `next.config.mjs` ne postavlja `headers()`.
**Uticaj:** moguć clickjacking nad dugmadima (Otpremi/Odbij); nema dubinske zaštite od XSS-a.
**Predlog:** dodati `headers()` u `next.config.mjs` (DENY/`frame-ancestors 'none'`, nosniff, HSTS, referrer-policy, osnovni CSP) i `poweredByHeader: false`.

### F6 — `note` bez ograničenja (niska–srednja)
`StatusChangeInput.note` nema `max_length`. Odbijanje sa belešću od 3 MB je prošlo (200) i upisano je u `status_history` porudžbine, a ide i u mejl komercijalisti. Rizik: rast dokumenta (limit 16 MB u Mongu), spor učitavanje reda.
**Predlog:** `Field(max_length=300)` kao kod ostalih beleški.

### F7 — Odjava ne poništava token (niska–srednja)
`POST /auth/logout` vraća 200, ali isti token posle toga i dalje radi (12 h). Promena lozinke, deaktivacija i promena uloge **ispravno** poništavaju tokene (`tv`). Na deljenom računaru u magacinu, ukradeni/kopirani token živi do isteka.
**Predlog:** u logout-u povećati `token_version` korisnika (poništava sve sesije) ili uvesti listu opozvanih tokena.

### F8 — Brojač faktura pre uslovnog upisa (niska–srednja, iz koda)
`change_order_status`: `_assign_invoice_number` radi `$inc` na brojaču **pre** `update_one({"id","status": current})`. Ako uslovni upis ne uspe (409 — neko je istovremeno promenio status) ili pukne posle `$inc`, broj je „potrošen“ → rupa u numeraciji faktura. Slično, pomeranje zalihe (`_move_stock_for_order`) ide **posle** upisa statusa bez transakcije: pad između ta dva koraka daje otpremljenu porudžbinu bez skinute zalihe.
**Test:** 8 istovremenih zahteva za otpremanje dali su 1×200 i 7×400, zaliha je skinuta jednom (600→596), sledeći broj fakture je bez rupe (0002 → 0003). Prozor trke je uzak i nije mogao da se izazove na probnom (jednoprocesnom) backendu, pa ostaje kao nalaz iz koda.
**Predlog:** dodeliti broj tek posle uspešnog uslovnog upisa (ili ga upisati istim upisom), a skidanje zalihe učiniti retriable/oporavljivim (npr. flag `stock_moved`).

### F9 — Pakovanje prepisuje celu listu stavki (niska, iz koda)
`update_picked_items` čita porudžbinu, menja stavke u memoriji i upisuje ceo niz `items` uslovno samo na `status`. Dva magacionera koja istovremeno pakuju različite redove iste porudžbine mogu da prepišu jedan drugom upis (last-writer-wins).
**Predlog:** upis po stavci (`$set: {"items.$[i].picked_qty": ...}` sa `arrayFilters`) ili `version` polje.

### F10 — Nema vlasništva nad preuzetom porudžbinom (niska)
Drugi magacioner može da menja `picked_qty`, vrati u red (`in_progress → new`) ili odbije porudžbinu koju je preuzeo kolega (testirano sa drugim nalogom). Ako je to namerno (smene), u redu; ako ne — dodati upozorenje/proveru `assigned_to_user_id`.

### F11 — Višak podataka za magacin (informativno)
Magacioner dobija cene i iznose (`price_no_vat`, `totals`), PIB/email/telefon kupaca, a `GET /clients/me` mu daje i `bank_account`, `accounting_email`, `last_activity_at`, `orders_30d`. Deo toga treba otpremnici; ostatak nije potreban za posao. Ako firme ne žele da magacin vidi cene, treba posebna provera.

### F12 — Blokada tuđeg naloga (niska, poznat kompromis)
5 pogrešnih prijava po emailu → 429 na 15 min, **čak i za ispravnu lozinku**. Ko zna email magacionera može da mu blokira prijavu. Ublažavanje: ograničenje i po IP-u, ili ne blokirati ispravnu lozinku.

### F13 — Neispravan JSON na prijavi (niska)
`api/auth/login/route.ts` radi `await req.json()` bez `try/catch` → 500 umesto 400.

### F14 — Red se ne osvežava sam (niska–srednja, UX)
Nema pollinga ni dugmeta „Osveži“; nova porudžbina se vidi tek posle ručnog reload-a. Kod F2 problem se udvostručuje (stari prikaz ostaje nepromenjen).

## 4. Šta je proverenu i radi ispravno

- **Matrica prava:** magacioner dobija 403 na sve upise nad kupcima, artiklima, korisnicima, jedinicama, uvozu, otpremi slika, kreiranju/izmeni/brisanju porudžbina, i na sve nadzorne/naplatne/izveštajne rute (`/users`, `/clients`, `/plans`, `/payments`, `/audit`, `/settings`, `/reports`, `/stats`, `/focus`, `/targets`, `/billing/*`, …).
- **Izolacija tenanta:** porudžbine, artikli, kupci i zaliha drugog tenanta daju 404 (čitanje, status, pakovanje, prijem, popis, barkod, rokovi); liste ne cure; filteri `customer_id`/`created_by_user_id` ne probijaju granicu.
- **Validacija:** negativna/prevelika/decimalna količina odbijena; odbijanje traži belešku; otpremanje traži sve stavke označene; prijem 0/negativno/preko limita odbijen; beleška zalihe ograničena na 300; `limit` ≤ 500; loš datum → 400; magacin ne može da otkaže ni da vrati otpremljenu porudžbinu.
- **Istovremeno otpremanje:** samo jedan zahtev uspeva, zaliha se skida jednom, broj fakture je bez rupe.
- **Tokeni:** promena lozinke, deaktivacija i promena uloge odmah poništavaju tokene; slaba lozinka odbijena; 5 neuspešnih prijava → 429.
- **Portal:** direktni URL-ovi svih admin stranica vraćaju magacionera na `/warehouse`; meni sadrži samo Magacin, Zalihe, Porudžbine, Uputstvo, Promena lozinke; API rute van liste daju 403; bez kolačića 401/redirect; kolačić `HttpOnly`, `SameSite=Lax`, `Secure` u produkciji, 12 h.
- **XSS:** ime kupca/artikla/proizvođača sa `<img onerror>` i `<script>` u redu, detalju i otpremnici je prikazano kao tekst (React escape); `window.__xss` ostaje nedefinisan; u kodu nema `dangerouslySetInnerHTML`.

## 5. Preporučeni redosled popravki

1. **F1** (enkodovanje/validacija ID-jeva u proxy-ju) i **F5** (sigurnosna zaglavlja) — mali, bezbedni popravci sa sigurnosnim efektom.
2. **F2 + F14** (greška/refresh/401 na stranici Magacin) i **F3** (fokus pri unosu) — najviše utiču na svakodnevni rad magacionera.
3. **F4** (duplirani redovi) i **F6** (limit beleške) — jedna promena u backendu.
4. **F7**, **F8**, **F9** — robusnost i revizija; mogu zajedno u jedan PR.

## 6. Ograničenja testa

Probni backend je jednoprocesni i nad mongomock-om, pa trke (F8, F9) nisu mogle da se izazovu. Nije testirano: stvarni SMTP mejlovi, Cloudinary, mobilna aplikacija magacina (skener, `StockScanPanel`), rad sa modulima isključenim po klijentu i zaključani pretplatni status. Sve se vraća na stvarnom okruženju ako treba.
