# Bezbednosne izmene — septembar 2026.

Ovaj dokument beleži šta je promenjeno posle review-a projekta i **zašto** je urađeno baš tako.
Izmene su u `backend/server.py` i `admin-web/lib/session.ts`. Testovi su u `backend/tests/test_security_fixes.py`.

---

## ⚠️ Pre deploy-a (obavezno)

1. **Backend (Vercel):** postaviti `JWT_SECRET`. Bez njega backend **neće da se pokrene** u production i preview okruženju. To je namerno, vidi tačku 3.
2. **admin-web (Vercel):** postaviti **isti** `JWT_SECRET` kao na backendu. Bez njega admin-web u produkciji odbija sve sesije i niko ne može da se prijavi.
3. **Backend:** postaviti `SUPERADMIN_PASSWORD` ako se baza pravi od nule. Bez njega se superadmin u produkciji neće kreirati, vidi tačku 3.
4. Ako je `JWT_SECRET` do sada bio nepostavljen, promena vrednosti poništava sve postojeće tokene. Svi korisnici će morati ponovo da se prijave.

Generisanje jake tajne:
```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 1. Porudžbina se pravi na serveru, iz podataka u bazi

**Problem.** `POST /api/orders` je u bazu upisivao stavke tačno onako kako ih pošalje klijent: naziv, cenu, PDV i popuste. Nije proveravao ni da proizvod i kupac pripadaju toj firmi. Svako ko ima nalog mogao je direktnim API pozivom da napravi porudžbinu sa cenom 0, popustom od 100% ili sa proizvodom druge firme.

**Izmena.**
- Novi ulazni model `OrderItemInput` sadrži samo ono o čemu klijent sme da odluči: `product_id`, `ordered_qty`, `discount`, `additional_discount`.
- Server učitava proizvode i kupca iz baze **samo unutar `client_id` tog korisnika**. Naziv, cena, PDV, pakovanje i slika kopiraju se iz sačuvanog proizvoda. Naziv kupca se uzima iz baze.
- Popust dobavljača mora biti podrazumevani (`product.discount`) ili jedan od onih u `product.discounts`. Ako nije poslat, koristi se podrazumevani.
- Dodatni popust mora biti jedan od onih u `product.additional_discounts`. Vrednost 0 je uvek dozvoljena.
- Odbija se (400): prazna porudžbina, količina ≤ 0, nepoznat ili tuđ proizvod, tuđ kupac, popust koji nije na listi.

**Zašto ovako.**
- Pravilo „orders snapshot" (videti CLAUDE.md) ostaje isto: porudžbina i dalje čuva kopiju proizvoda. Promenilo se samo **ko** pravi tu kopiju: server umesto klijenta.
- Za popuste je izabrana **lista dozvoljenih vrednosti**, a ne „uvek podrazumevani popust". Testovi iz iteracije 4 pokazuju da prodavac može da bira popust iz liste koju je admin odredio. Admin i dalje kontroliše opseg, a klijent ne može da pošalje proizvoljnu vrednost.
- Cena poslata od klijenta se **tiho ignoriše** i ne odbija se. Mobilna aplikacija može imati zastareo katalog (admin promenio cenu u međuvremenu). Važi cena iz baze, a ekran fakture se učitava sa servera, pa prodavac vidi stvarne iznose.
- **Kompatibilnost:** stare verzije aplikacije i dalje šalju sva polja (`name`, `price_no_vat`...). Pydantic višak ignoriše, pa već instaliran APK radi bez izmena.

---

## 2. Provera uloga: šta operator sme

**Problem.** Rute za kupce, proizvode i brisanje porudžbina proveravale su samo da je korisnik prijavljen. Mobilna aplikacija je operatoru sakrila Admin tab, ali je API operatoru i dalje dozvoljavao da briše i menja katalog i kupce.

**Izmena.** Dodat je `require_manager = require_roles(SUPERADMIN, ADMIN)` na:
- `POST/PUT/DELETE /api/customers`
- `POST/PUT/DELETE /api/products`
- `DELETE /api/orders/{id}`
- `POST /api/upload-image`

Operator i dalje sme da čita proizvode i kupce, da kreira porudžbine i da vidi porudžbine svoje firme.

**Zašto ovako.** Sakrivanje dugmeta u UI-ju nije zaštita, jer se API može pozvati direktno. Podela odgovara `RBAC_PLAN.md`: kupce i proizvode dodaje admin, a operator kreira porudžbine. Upload slika je zatvoren jer koristi Cloudinary nalog (trošak i skladište), a slike se koriste samo u formi za proizvode.

---

## 2b. Admin ne sme da upravlja drugim adminima

**Problem.** Admin je mogao drugom adminu iste firme da promeni lozinku (i tako preuzme nalog), da ga deaktivira ili obriše.

**Izmena** u `PUT /api/users/{id}` i `DELETE /api/users/{id}`:
- admin menja ili briše samo **operatore** svoje firme;
- admin sme da menja **sebe** (ime, telefon, lozinku), ali ne i svoju ulogu ni status `active`. Odbija se samo **stvarna promena**: forma u admin-web-u uvek šalje `active`, pa ponovno slanje iste vrednosti prolazi (inače admin ne bi mogao da promeni ni svoje ime);
- superadmin nije ograničen.

**Zašto ovako.** Samo superadmin kreira admine (`POST /clients`, `POST /users`), pa je logično da samo on njima i upravlja. Zabrana promene sopstvene uloge sprečava da se admin slučajno spusti na operatora i ostane bez pristupa portalu.

**Poznata posledica (UI nije menjan).** Stranica `admin-web/app/(dashboard)/users` adminu i dalje prikazuje dugmad „Izmeni" i „Obriši" za druge admine svoje firme:
- **Izmeni** → forma se otvori, a pri čuvanju se u formi prikaže greška „Admins can only manage operators". Ništa se ne menja.
- **Obriši** → potvrdni dijalog se zatvori i lista se osveži, ali `remove()` ne proverava odgovor, pa se greška **ne prikaže** i korisnik samo ostane u listi.

Za superadmina se ništa ne menja. Kad admin menja **sebe**, i polje „Status" i dalje može da se promeni u formi, ali backend odbija promenu (403).

Kasnije popraviti: za admina prikazivati dugmad samo za redove sa `role === "operator"` (i za sebe samo „Izmeni", bez polja za status), a u `remove()` prikazati grešku kad `res.ok` nije true.

---

## 3. Bez podrazumevanih tajni u produkciji

**Problem.** `JWT_SECRET` je imao rezervnu vrednost `dev-insecure-secret-change-me` i u backendu i u admin-web-u, a superadmin lozinka `ChangeMe123!`. Obe vrednosti su javne jer su u repou. Ako env promenljiva nedostaje na deploy-u, bilo ko može sam da potpiše token sa ulogom `superadmin`.

**Izmena.**
- `backend/server.py`: nova promenljiva `IS_PRODUCTION`. Tačna je kad je `APP_ENV=production` ili `VERCEL_ENV` ima vrednost `production`/`preview`.
  - Nema `JWT_SECRET` u produkciji → `RuntimeError` pri pokretanju.
  - Nema `JWT_SECRET` lokalno → dev tajna uz upozorenje u logu (lokalni rad se ne menja).
  - Superadmin ne postoji, a `SUPERADMIN_PASSWORD` nije postavljen u produkciji → superadmin se **ne kreira** (greška u logu).
- `admin-web/lib/session.ts`: tajna se čita pri prvoj proveri tokena, ne pri učitavanju modula. U produkciji bez `JWT_SECRET` svaka sesija se odbija.

**Zašto ovako.**
- Backend **odbija da se pokrene** jer je to jedini siguran ishod. Pokrenut server sa javnom tajnom je gori od servera koji ne radi, a greška u Vercel logu je odmah jasna.
- `preview` se računa kao produkcija jer su preview URL-ovi takođe javni.
- Kod superadmina se kreiranje **preskače umesto da server padne**. Deploy koji već ima superadmina ne sme da padne samo zato što promenljiva nije postavljena, jer se ona koristi samo pri prvom seed-u.
- U admin-web-u se tajna čita pri prvoj upotrebi jer `next build` učitava module, a u build okruženju tajna ne mora da postoji. Pri grešci se **sesija odbija** (niko ne ulazi) umesto da se prihvati javna tajna.

---

## 4. Bug: popust proizvoda nije mogao da se vrati na 0

**Problem.** `update_product` je koristio `incoming.get("discount") or existing.get("discount")`. Pošto je `0` „falsy" vrednost, poslata nula je padala na stari popust. Popust nije mogao da se ukloni.

**Izmena.**
- `ProductInput.discount` je sada `Optional[float] = None` (ranije podrazumevano `0`).
- Pri izmeni se koristi `is None`: poslata vrednost (uključujući 0) se primenjuje, a polje koje nije poslato zadržava sačuvanu vrednost.
- Isto pravilo sada važi i za `discounts` i `additional_discounts`. Ranije su se, ako nisu poslati, resetovali na `[discount]` odnosno `[0]`.

**Zašto ovako.** Uz podrazumevanu nulu nije moglo da se razlikuje „nije poslato" od „poslata je 0". `None` to razdvaja. Kreiranje proizvoda se ne menja: `None` i dalje znači 0.

---

## 5. Deaktivirana firma blokira svoje korisnike

**Problem.** `DELETE /api/clients/{id}` samo postavlja `active=False` na firmu, a prijava i provera tokena to nisu gledali. Korisnici „obrisane" firme su i dalje normalno radili.

**Izmena.** Dodat je helper `client_is_active(client_id)`. Proverava se:
- pri **prijavi** → 403 „Client account is disabled", i to tek **posle** provere lozinke;
- na **svakom zahtevu** (`get_current_user`) → 401;
- pri **zahtevu za reset lozinke** → mejl se ne šalje, a odgovor ostaje isti generički.

**Zašto ovako.**
- Provera na svakom zahtevu, a ne samo pri prijavi, jer JWT važi 12h. Bez nje bi već izdati tokeni radili do isteka. Cena je jedan mali upit po zahtevu, što je prihvatljivo pri ovom obimu.
- 401 na zahtevima jer mobilna aplikacija na 401 automatski odjavljuje korisnika i vraća ga na login.
- Firma se proverava posle lozinke da odgovor 403 ne bi otkrio da email postoji.
- Superadmin nema `client_id` i provera ga ne pogađa.

**Napomena.** API trenutno nema način da se firma ponovo aktivira (`PUT /clients` ne prima `active`). To bi trebalo dodati kad zatreba.

---

## Testovi

Novi fajl `backend/tests/test_security_fixes.py` (21 test) ne zavisi od seed podataka: sam pravi dve firme, admine, operatora, proizvod i kupca preko superadmina.

Pokretanje (server mora da radi, **ne na produkcionoj bazi**, jer testovi pišu prave podatke):
```powershell
$env:EXPO_PUBLIC_BACKEND_URL = "http://localhost:8000"
cd backend
pytest tests/test_security_fixes.py tests/test_auth_and_tenancy.py -v
```

Provereno pri izmeni (lokalno, uz Mongo mock u memoriji):
- nova verzija: `test_security_fixes.py` + `test_auth_and_tenancy.py` + `test_easy_order.py::TestOrderSnapshot` → **49 prošlo, 1 preskočen** (roundtrip reseta lozinke traži `PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE=true`);
- stara verzija `server.py`: 18 od 21 novog testa **pada**, što potvrđuje da testovi hvataju ove probleme;
- backend bez `JWT_SECRET` uz `VERCEL_ENV=production` → `RuntimeError`; `tsc --noEmit` u admin-web-u prolazi.

Izmena postojećeg testa: `test_easy_order.py::TestOrderSnapshot` sada pravi proizvod sa `discount: 5`. Ranije je slao popust 5 za proizvod koji ga nije dozvoljavao, a to server sada ispravno odbija.

**Otvoreno:** `seed_data()` ne pravi demo admina (`demo-admin@easyorder.dev`) ni demo proizvode, a `conftest.py` i stariji testovi ih očekuju. Na praznoj bazi ti testovi i dalje padaju. To nije deo ove runde.

---

## Šta namerno NIJE urađeno (sledeći koraci)

- Mobilni `submitOrder` nema `catch`. Ako server odbije porudžbinu (na primer admin je u međuvremenu uklonio popust), korisnik ne dobija poruku.
- Nema ograničenja broja pokušaja na `/auth/login` i `/auth/forgot-password`, i nema provere snage lozinke kod kreiranja i izmene korisnika.
- Email nije `unique` u bazi.
- Porudžbina nema `created_by_user_id` ni `status` (potrebno za RBAC fazu za magacin).
