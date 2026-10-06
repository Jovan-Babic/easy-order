# Plan: uloga Magacin i tok obrade porudžbine

Cilj: uvesti ulogu **magacin** (`warehouse`) i statusni tok porudžbine — komercijalista (operator) kreira porudžbinu, magacin je preuzima, pakuje (čekira stavke na telefonu), šalje (faktura/otpremnica na portalu). Tok se završava statusom „Poslato“.

---

## 1. Šta već postoji (ne raditi ponovo)

- Multi-tenant model: `client_id` na `customers`, `products`, `orders`, `users`; `_scope_query()`, `get_scoped_or_404()`, `resolve_write_client_id()`; tuđi tenant → 404.
- Uloge `superadmin`, `admin`, `operator` (`Role` u `backend/server.py`).
- Porudžbina već ima `status` (enum `OrderStatus`, za sada samo `new`), `created_by_user_id`, `created_by_name`, `created_at`. Stavke su snapshot proizvoda (`OrderItem`), količina je `ordered_qty`.
- Nalozi se prave pozivnicom (privremena lozinka + `must_change_password`), `tv` u JWT-u poništava stare tokene pri promeni uloge.
- Portal (`admin-web`) i mobilna aplikacija imaju ekran porudžbina; mobilna ima fakturu (`frontend/src/invoice.ts`).

---

## 2. Uloge

| Uloga | Ko je | Gde radi |
|---|---|---|
| `superadmin` | globalni administrator sistema | portal |
| `admin` | vlasnik jednog klijenta (veleprodaje) | portal + mobilna |
| `operator` | **komercijalista** — pravi porudžbine | mobilna |
| `warehouse` | **magacin** — obrađuje porudžbine | mobilna (pakovanje) + portal (slanje, štampa) |

Na UI-ju se prikazuje kao „Komercijalista“ / „Magacin“ (i18n), u kodu ostaju `operator` / `warehouse`. `admin`, `operator` i `warehouse` uvek pripadaju jednom `client_id`.

---

## 3. Matrica dozvola

| Akcija | superadmin | admin | operator | warehouse |
|---|---|---|---|---|
| Klijenti (tenant) CRUD | ✅ | — | — | — |
| Korisnici CRUD | ✅ sve uloge | ✅ samo `operator` i `warehouse` svog klijenta | — | — |
| Proizvodi / kupci — izmena | ✅ | ✅ | — | — |
| Proizvodi / kupci — pregled | ✅ | ✅ | ✅ | ✅ (adresa kupca, pakovanje) |
| Kreiranje porudžbine | ✅ | ✅ | ✅ | — |
| Pregled porudžbina | sve | sve svog klijenta | **samo svoje** (`created_by_user_id`) | sve svog klijenta |
| Promena statusa | ✅ (override) | ✅ (override) | samo `new → canceled` za svoju | po matrici prelaza (sekcija 4) |
| Čekiranje stavki (`picked_qty`) | ✅ | ✅ | — | ✅ |
| Brisanje porudžbine | samo u statusu `new` | samo u statusu `new` | — | — |
| Faktura / otpremnica (štampa) | ✅ | ✅ | ✅ svoje | ✅ |

Napomena: operator i dalje vidi sve kupce svog klijenta (bira kupca pri porudžbini); ograničenje „samo svoje“ važi za porudžbine.

---

## 4. Statusi i prelazi

| Status | sr | Značenje |
|---|---|---|
| `new` | Nova | komercijalista poslao, magacin još nije preuzeo |
| `in_progress` | U pripremi | magacin pakuje (čekira stavke) |
| `shipped` | Poslato | roba otišla iz magacina, faktura izdata — kraj toka |
| `rejected` | Odbijeno | magacin ne može da izvrši (obavezna napomena) |
| `canceled` | Otkazano | komercijalista/admin povukao pre obrade |

Završni statusi: `shipped`, `rejected`, `canceled`.

Status `completed` (isporuka potvrđena) namerno **ne uvodimo** — tražio bi ulogu dostavljača. Ako se kasnije uvede, dodaje se kao `shipped → completed` bez izmena postojećeg toka (Faza 6).

### Dozvoljeni prelazi

| Iz → U | Ko |
|---|---|
| `new → in_progress` | warehouse, admin (automatski kad magacioner čekira prvu stavku ili klikne „Preuzmi“) |
| `in_progress → new` | warehouse, admin (vraćanje u red, npr. greškom preuzeto) |
| `in_progress → shipped` | warehouse, admin — uslov: svaka stavka ima `picked_qty` i bar jedna je > 0; dodeljuje se broj fakture |
| `new / in_progress → rejected` | warehouse, admin — `note` obavezan |
| `new → canceled` | operator (samo svoja), admin |
| bilo šta → bilo šta | superadmin, admin kao override — `note` obavezan |

Svaki prelaz van tabele → 400; uloga koja nema pravo → 403.

### Istovremene izmene
Promena statusa je uslovni update: `update_one({"id": order_id, "status": <očekivani>}, ...)`. Ako je neko drugi u međuvremenu promenio status → **409** („Porudžbina je u međuvremenu izmenjena“), klijent osvežava prikaz.

---

## 5. Model podataka

### Order (dopune)
```
status: OrderStatus                  # new | in_progress | shipped | rejected | canceled
status_history: [StatusChange]       # ugrađeno u porudžbinu, ne posebna kolekcija
assigned_to_user_id / assigned_to_name: Optional   # magacioner koji je preuzeo (in_progress)
shipped_at: Optional[datetime]
invoice_seq: Optional[int]           # redni broj fakture u okviru klijenta
invoice_number: Optional[str]        # formatiran broj, npr. "0001/2026"
```

### Broj fakture
Format: **`{oznaka klijenta}/{redni broj}`** → npr. `ABC/0001`. Način dodele bira se po klijentu (sekcija 5a):

- **Automatski:** brojač po klijentu, dodeljuje se pri prelazu u `shipped` (ne pri kreiranju — odbijene/otkazane porudžbine ne prave rupe u nizu). Atomski: kolekcija `counters`, `find_one_and_update({"_id": f"invoice:{client_id}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=AFTER)`. Broj = `f"{invoice_prefix}/{seq:04d}"`.
- **Ručno:** pri slanju magacin/admin unosi broj fakture (npr. iz knjigovodstvenog programa). Obavezan za `shipped`, jedinstven u okviru klijenta (unique partial indeks `(client_id, invoice_number)`), duplikat → 409.
- Broj se ne menja i ne oslobađa ni ako admin kasnije override-uje status. Admin može ručno da ispravi broj samo uz napomenu u istoriji (Faza 6, ako zatreba).

### 5a. Client (tenant) — podešavanja fakture
Dopune modela `Client` / `ClientInput`:
```
invoice_prefix: Optional[str]           # oznaka klijenta, npr. "ABC" (velika slova/cifre, do 10 znakova)
invoice_numbering: "auto" | "manual"    # default "auto"
invoice_next_seq: int                   # samo za "auto": sledeći broj — za nastavak niza iz starog sistema
logo: Optional[str]                     # URL logoa (Cloudinary), ide na fakturu
registration_number: Optional[str]      # matični broj
bank_account: Optional[str]             # tekući račun
```
- Za `auto` je `invoice_prefix` obavezan (bez njega `shipped` → 400 „Podesite oznaku za fakture“).
- `invoice_next_seq` se ne čuva na klijentu nego se upisuje u `counters` pri izmeni (može samo da se poveća — ne sme da proizvede već iskorišćen broj).
- **Logo** je opcionalan — ako ga nema, faktura je neutralna (samo naziv klijenta). Upload po pravilu iz sekcije 12 (tek na „Sačuvaj“), u folder `easy-order/clients` (parametar `kind=product|client_logo`); stari logo se briše iz Cloudinary pri zameni/brisanju (proširiti `_delete_product_image` na oba foldera).
- Faktura koristi podatke klijenta: naziv, adresa, PIB, matični broj, tekući račun, email, telefon.

Ko uređuje: **samo superadmin**, na kreiranju i izmeni klijenta (`/clients` na portalu) — sva polja + logo. Admin za početak nema pristup ovim podešavanjima (stranica „Podešavanja“ za admina → Faza 6, ako zatreba). Admin i magacin podatke klijenta samo čitaju (za fakturu): `GET /clients/me`.

### StatusChange
```
from_status, to_status, changed_by_user_id, changed_by_name, changed_by_role, changed_at, note
```
Ugrađen niz jer se status i istorija menjaju u istom `update_one` (`$set` + `$push`) — nema potrebe za transakcijom, istorija je uvek uz porudžbinu. Kreiranje porudžbine upisuje prvi zapis (`None → new`).

### OrderItem (dopuna)
```
picked_qty: Optional[int] = None     # None = nije čekirano; 0..ordered_qty
```

### Migracija
Postojeće porudžbine: `status` već postoji (`new`), `status_history` default `[]`, `picked_qty` default `None` — ne treba skripta.

Indeks: `orders (client_id, status, created_at)` i `orders (client_id, created_by_user_id, created_at)`.

---

## 6. Delimična isporuka — **odlučeno: da, u prvoj verziji**

Primer: naručeno 10, magacin ima 7. Magacioner upiše `picked_qty = 7`, faktura ide na 7.

- dozvoljeno `0 ≤ picked_qty ≤ ordered_qty` (više od naručenog — ne)
- dok je porudžbina `new`/`in_progress`, iznosi se računaju po `ordered_qty`
- od `shipped` nadalje, faktura i `totals` se računaju po `picked_qty` (poslato stanje); stavke sa `picked_qty = 0` se ne štampaju na fakturi, ali ostaju u porudžbini
- `calc.py` i `frontend/src/calc.ts` dobijaju isto pravilo za „efektivnu količinu“ — moraju ostati usklađeni
- odgovor API-ja: `totals` (efektivni) + `ordered_totals` (po naručenom), da se vidi razlika; komercijalista u istoriji vidi „naručeno 10 / poslato 7“

---

## 7. Backend — konkretne izmene (`backend/server.py`)

1. `Role.WAREHOUSE = "warehouse"`.
2. **Provere uloga prebaciti na allow-list.** Danas `/users` endpointi odbijaju samo `role == OPERATOR` — magacin bi prošao. Koristiti `require_manager`. Provere „Admins can only manage operators“ zameniti skupom `ADMIN_MANAGEABLE_ROLES = {OPERATOR, WAREHOUSE}`.
3. `POST /users`: admin bira `operator | warehouse` (ostalo → 403); `client_id` i dalje uvek iz admina.
4. `POST /orders`: `require_roles(SUPERADMIN, ADMIN, OPERATOR)`.
5. `GET /orders`, `GET /orders/{id}`: operatoru dodati `created_by_user_id = current_user.id` u scope (tuđa → 404). Novi parametri: `status` (može više), `created_by_user_id` (admin/superadmin), `from_date`, `to_date`, `limit`/`skip`.
6. `POST /orders/{id}/status` `{status, note?}` — matrica iz sekcije 4, uslovni update, `$push` u `status_history`.
7. `PATCH /orders/{id}/items` `{items: [{product_id, picked_qty}]}` — warehouse/admin, samo u `new`/`in_progress`; ako je `new` → automatski `in_progress` + zapis u istoriju.
8. `DELETE /orders/{id}`: samo u statusu `new`, inače 409 („Otkažite porudžbinu“).
9. Pozivni email za `warehouse`: link za portal + link za APK (koristi oba).
10. Testovi (`backend/tests/`): matrica dozvola po ulozi, svi prelazi (dozvoljeni i zabranjeni), 409 pri konfliktu, operator ne vidi tuđe porudžbine, admin ne može da napravi admina.

---

## 8. Mobilna aplikacija (`frontend/`)

### Komercijalista (operator)
- Istorija: samo svoje porudžbine (backend već filtrira), **bedž statusa**, razlog odbijanja, dugme „Otkaži“ dok je `new`.

### Magacin (warehouse)
- Tabovi po ulozi u `app/(tabs)/_layout.tsx` (danas se Admin tab krije samo za `operator`): magacin vidi samo **„Magacin“** tab (+ istorija/podešavanja), bez kataloga i admin taba.
- Ekran „Magacin“: lista porudžbina (`new` i `in_progress`), filter po statusu, osvežavanje povlačenjem.
- Detalj porudžbine: kupac + adresa, stavke sa pakovanjem; po stavci čekiranje (pun iznos jednim tapom ili unos manje količine), dugmad „Preuzmi“, „Odbij“ (sa napomenom), „Pošalji“ kad je sve čekirano (ako klijent ima ručnu numeraciju, traži unos broja fakture).
- `src/api.ts`: tipovi `OrderStatus`, `StatusChange`, `picked_qty`; nove funkcije za status i stavke.
- i18n: nazivi statusa i uloga u `sr` i `en`.

---

## 9. Admin portal (`admin-web/`)

- **Pristup po ruti, ne samo sidebar.** `proxy.ts` danas odbija samo operatora — magacin bi dobio ceo portal. Uvesti mapu dozvoljenih ruta po ulozi (`warehouse` → samo `/orders`, `/warehouse`, `/app`, `/change-password`). `Sidebar` tip uloge proširiti.
- `/users`: admin bira ulogu „Komercijalista“ / „Magacin“.
- `/orders`: kolona status (bedž), filter po statusu i datumu, kolona „Kreirao“.
- **Modul Magacin** (`/warehouse`): red za obradu (kartice/kolone po statusu), detalj sa stavkama i `picked_qty`, akcije statusa, istorija promena.
- **Štampa:** faktura i otpremnica (pick lista bez cena) kao print-friendly stranica (`window.print()`), na osnovu `totals`/`line_net` iz backenda (portal nema svoj `calc`).
- Dashboard za magacin: broj porudžbina po statusu.

---

## 10. Faze

### Faza 0 — Popravka uploada slika (pre svega ostalog) — ✅ urađeno
Sekcija 12. Nezavisno od magacina. Implementirano: upload tek na „Sačuvaj“ (mobilna + portal), `DELETE /upload-image`, `backend/scripts/cleanup_orphan_images.py`, testovi. Skriptu pokrenuti ručno (prvo bez `--apply`) nad pravom bazom.

### Faza 1 — Uloga i dozvole — ✅ urađeno
Backend tačke 1–5 i 9, portal pristup po ruti + izbor uloge u `/users`, mobilna tabovi po ulozi, testovi dozvola.
*Rezultat:* admin može da napravi magacionera, magacin se uloguje i ne vidi ništa što ne treba; komercijalista vidi samo svoje porudžbine.

### Faza 2 — Statusi i istorija — ✅ urađeno
Backend tačke 6 i 8, `status_history`, indeksi, filteri liste; bedževi statusa na mobilnoj i portalu, otkazivanje za komercijalistu, testovi prelaza.

### Faza 3 — Pakovanje na telefonu — ✅ urađeno
`picked_qty`, `PATCH /orders/{id}/items`, ekran „Magacin“ u mobilnoj aplikaciji, odluka iz sekcije 6 (delimična isporuka) i usklađen `calc.py`/`calc.ts`.

### Faza 4 — Podešavanja fakture po klijentu — ✅ urađeno
`Client` polja iz sekcije 5a (oznaka, način numeracije, sledeći broj, logo, podaci za fakturu), upload logoa u `easy-order/clients`, forma klijenta na `/clients` (superadmin), `GET /clients/me` (čitanje za fakturu), kolekcija `counters`, unique indeks na broj fakture, testovi (automatski niz bez duplikata, ručni duplikat → 409).
Može paralelno sa fazama 2–3; mora pre faze 5.

### Faza 5 — Portal modul Magacin — ✅ urađeno
`/warehouse` red za obradu, detalj + istorija, slanje (automatski broj ili unos ručnog), štampa fakture (logo + podaci klijenta ako postoje) i otpremnice.

### Faza 6 — Dorade
- ✅ obaveštenje komercijalisti emailom pri `rejected`/`shipped` (`_send_order_status_email`; push kasnije)
- ✅ izmena porudžbine od strane komercijaliste dok je `new` (`PUT /orders/{id}`, 409 ako je magacin već preuzeo; mobilna: „Izmeni porudžbinu“ u istoriji)
- ~~dodela porudžbine konkretnom magacioneru~~ (preskočeno: magacioner se upisuje pri „Preuzmi“); ✅ izveštaji po statusima (`GET /reports/orders`, portal `/reports`)
- stanje robe u magacinu: vidi `PLAN_STANJE_MAGACINA.md`
- stranica „Podešavanja“ za admina (sam menja logo i podešavanja fakture)
- uloga **dostavljač** + status `completed` (potvrda isporuke) — samo ako se pokaže potreba

---

## 11. Odluke

| # | Pitanje | Odluka |
|---|---|---|
| 1 | Delimična isporuka | Da, od prve verzije; faktura i ukupno po poslatom stanju (`picked_qty`) |
| 2 | Broj fakture | `OZNAKA/0001`; po klijentu se bira automatski ili ručno; dodeljuje se pri `shipped` (sekcija 5, 5a) |
| 6 | Logo na fakturi | Opcionalan, postavlja se na klijentu |
| 7 | Ko uređuje podešavanja fakture | Samo superadmin (za početak) |
| 8 | Matični broj i tekući račun | Dodaju se na klijenta |
| 3 | Status `completed` | Ne uvodi se; tok staje na `shipped` |
| 4 | Admin filter „Kreirao“ | Da — `GET /orders?created_by_user_id=` (admin/superadmin; operatoru se ignoriše) |
| 5 | Komercijalista | = `operator` (samo naziv na UI-ju) |

---

## 12. Upload slika tek na „Sačuvaj“ (bug uočen u testiranju)

**Problem:** forma proizvoda (mobilna `app/(tabs)/admin.tsx`, portal `products/page.tsx`) šalje sliku na `/upload-image` odmah po izboru fajla. Ako korisnik zatvori formu bez čuvanja, ili izabere drugu sliku pa treću, slike ostaju na Cloudinary-ju a ni jedan proizvod ih ne koristi. Zato na Cloudinary-ju ima više slika nego proizvoda.

**Rešenje:**
- Forma pri izboru slike čuva samo **lokalni fajl** i prikazuje lokalni preview (mobilna: URI iz image pickera, portal: `URL.createObjectURL`).
- Na „Sačuvaj“: prvo upload (ako je izabrana nova slika), pa `POST/PUT /products` sa dobijenim URL-om.
- Ako čuvanje proizvoda ne uspe posle uspešnog uploada → klijent poziva brisanje te slike (novi `DELETE /upload-image?url=...`, manager, samo URL-ovi iz našeg foldera i samo ako ga ne koristi ni jedan proizvod).
- Zatvaranje forme / „Otkaži“ / izbor druge slike ne šalju ništa na server.
- Isto pravilo važi za logo klijenta (Faza 4).

**Čišćenje postojećih viškova:** jednokratna skripta `backend/scripts/cleanup_orphan_images.py` — lista sve slike iz `easy-order/products` (Cloudinary Admin API), oduzme one čiji URL postoji u `products.image`, i ostatak briše. Podrazumevano `--dry-run` (samo ispiše šta bi obrisala); slike starije od 1 dan, da ne obriše sliku koja se upravo čuva. Snapshot slike u porudžbinama se ne prikazuju (vidi `_delete_product_image`), pa ih ne treba čuvati.
