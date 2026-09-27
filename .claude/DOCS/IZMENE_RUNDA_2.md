# Izmene — runda 2 (septembar 2026.)

Nastavak na `IZMENE_BEZBEDNOST.md`. Ovde je sve što je urađeno u drugoj rundi posle review-a, sa razlozima.

---

## ⚠️ Pre deploy-a i izdavanja (redosled je bitan)

1. **Novi APK izdati pre prvog invite-a za operatore.** Pozvani korisnik mora prvo da promeni privremenu lozinku, a samo nova verzija aplikacije (1.2.0) ima taj ekran. Na staroj verziji (1.1.1) takav korisnik dobija grešku na svakom ekranu. Privremeno rešenje dok se ne izda 1.2.0 je da korisnik uradi „Zaboravljena lozinka", jer reset takođe skida obavezu promene.
2. **Backend (Vercel) env:**
   - `SMTP_*` mora biti podešen da bi invite mejlovi stizali. Bez toga kreiranje naloga i dalje radi, ali se privremena lozinka prikazuje u admin-web-u da je admin sam prosledi.
   - `ADMIN_WEB_URL` (opciono) je link ka portalu u mejlu za admine. Ako nije postavljen, izvodi se iz `RESET_WEB_URL` (sve pre `/reset-password`).
   - `PUBLIC_BACKEND_URL` (opciono) je osnova za link ka APK-u u mejlu. Na Vercelu se automatski uzima produkcioni domen.
3. **Prvi start posle deploy-a** prevodi sve emailove u bazi u mala slova i pravi `unique` indeks. Ako dva naloga imaju isti email koji se razlikuje samo po velikim i malim slovima, indeks se neće napraviti i u Vercel logu se pojavljuje `Could not create unique index on users.email`. Tada treba ručno obrisati ili preimenovati duplikat.
4. **Postojeći korisnici** se ne odjavljuju i ne moraju da menjaju lozinku. Obaveza promene važi samo za nove naloge.

### Izdavanje APK-a 1.2.0
1. `frontend/app.json` je već podignut na `1.2.0`.
2. `eas build -p android --profile apk`
3. U `backend/public/app/` obrisati `easy-order-v1.1.1.apk` i ubaciti `easy-order-v1.2.0.apk`. Uvek treba da postoji samo jedan APK.
4. U `app-update.json` postaviti `version: "1.2.0"`, `download_url: "/app/easy-order-v1.2.0.apk"` i nov `build_date`.
5. Deploy backend. Admin-web ne treba redeploy za novu verziju.

---

## 1. Nalozi se prave preko email pozivnice

**Ranije:** superadmin, odnosno admin, sam je upisivao lozinku novom korisniku i morao je da je prosledi nekim drugim kanalom.

**Sada:**
- `POST /api/clients` (prvi admin firme) i `POST /api/users` više ne primaju lozinku. Server generiše **privremenu lozinku** od 12 karaktera, bez znakova koji se lako pomešaju (0/O, 1/l/I).
- Na email korisnika stiže mejl (SR i EN) sa emailom za prijavu, privremenom lozinkom, linkom za preuzimanje APK-a (iz `app-update.json`) i, za admine, linkom ka portalu.
- Korisnik ima `must_change_password: true`. Dok ne postavi svoju lozinku, backend odbija sve osim `/auth/me`, `/auth/change-password` i `/auth/logout` (403 „Password change required").
- Nova ruta `POST /api/auth/change-password` (`current_password`, `new_password`) vraća **nov token**.
- Ako mejl nije poslat (SMTP nije podešen ili je slanje palo), odgovor sadrži `temporary_password`, a admin-web ga **jednom** prikaže kreatoru.

**Zašto ovako:**
- Kreator ne zna lozinku korisnika i ne mora da je izmišlja ni prosleđuje. Obavezna promena pri prvoj prijavi znači da lozinka iz mejla važi samo do prve prijave.
- Promena je obavezna **na serveru**, ne samo u UI-ju, jer se API može zvati direktno.
- 403, a ne 401, jer je sesija ispravna. Aplikacija treba da prikaže ekran za promenu lozinke, a ne da odjavi korisnika.
- Neuspelo slanje mejla ne sme da obori kreiranje naloga. Zato postoji rezerva sa prikazom lozinke kreatoru, koja se vraća samo kad mejl nije otišao.
- Kad admin korisniku postavi novu lozinku (izmena korisnika), ona se takođe tretira kao privremena i korisnik mora da je zameni.

**Gde:** `server.py` (`_invite_user`, `_send_invite_email`, `change_password`, `get_authenticated_user`/`get_current_user`); admin-web stranice `/change-password`, Users, Clients, `(dashboard)/layout.tsx`; mobilni `app/change-password.tsx` i `RouteGuard` u `_layout.tsx`.

---

## 2. Pravila za lozinku

- Najmanje 8 karaktera, bar jedno slovo i bar jedan broj (`ensure_strong_password`).
- Važi za promenu lozinke, reset i lozinku koju admin postavi korisniku.
- Ista provera postoji u mobilnoj aplikaciji i admin-web-u (ekrani za promenu i reset), da korisnik dobije jasnu poruku pre slanja.

**Zašto ovako:** pravilo je umereno (bez obaveznih specijalnih znakova), jer korisnici lozinku kucaju na telefonu.

---

## 3. Stari tokeni prestaju da važe (`token_version`)

- Svaki korisnik ima `token_version`, a JWT nosi `tv`. Kad se razlikuju, zahtev dobija 401 „Session expired".
- Verzija se podiže pri: promeni lozinke, resetu lozinke, lozinki koju postavi admin i promeni uloge.

**Zašto ovako:** JWT važi 12h. Bez ovoga bi posle promene lozinke (na primer zbog ukradenog telefona) stari token i dalje radio. Promena uloge takođe traži novi token, jer se uloga nalazi u tokenu (admin-web je čita u `proxy.ts`).

**Posledice:**
- Postojeći tokeni nemaju `tv` i tumače se kao 0, pa niko nije odjavljen deploy-om.
- Admin više ne menja **svoju** lozinku u formi na Users stranici. Za to postoji „Promeni lozinku" u meniju, koja ga ostavlja prijavljenog jer backend vraća nov token. Izmena kroz Users formu bi ga odjavila.

---

## 4. Email: mala slova i jedinstven

- Svi emailovi se čuvaju malim slovima (`normalize_email`), a pri startu se postojeći jednom migriraju.
- `users.email` ima `unique` indeks. Pretraga je obična jednakost umesto regexa.

**Zašto ovako:** regex pretraga ne koristi indeks, a bez `unique` indeksa dva istovremena zahteva mogu da naprave isti email.

---

## 5. Limit pokušaja (čuva se u Mongo bazi)

- **Prijava:** 5 neuspešnih pokušaja po emailu u 15 minuta vodi do 429 „Too many failed login attempts". Uspešna prijava briše brojač.
- **Zaboravljena lozinka:** najviše 3 mejla po emailu na sat. Posle toga odgovor ostaje isti generički, ali se mejl ne šalje.
- Kolekcija `auth_attempts` ima TTL indeks, pa se sama čisti posle 24h.
- Vrednosti se menjaju preko env: `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`, `FORGOT_PASSWORD_MAX_PER_HOUR`.

**Zašto ovako:**
- Brojač je u Mongo bazi, a ne u memoriji, jer Vercel pokreće više instanci koje se gase. Brojač u memoriji bi se stalno resetovao.
- Brojanje je **po emailu, a ne po IP adresi**, jer admin-web šalje prijave sa svog servera, pa bi svi korisnici portala delili istu IP adresu.
- Poznata mana: neko ko zna tuđi email može namerno da zaključa taj nalog na 15 minuta. Pri ovom obimu je to prihvatljivo.

---

## 6. Slike proizvoda (Cloudinary, besplatan plan)

- Dozvoljeni su samo JPEG, PNG, WEBP i HEIC (415 za ostalo), do **4 MB** (413 za veće). Provera ide pre bilo kakvog poziva ka Cloudinary-ju.
- Cloudinary čuva **smanjenu verziju**: najviše 1000×1000 px, WEBP, `quality auto:good`, što je obično ispod 200 KB.
- Kad se slika proizvoda zameni ili se proizvod obriše, **stara slika se briše sa Cloudinary-ja**. Brišu se samo slike iz foldera `easy-order/products`, spoljni URL-ovi nikad.
- Upload više ne blokira server (`asyncio.to_thread`), a greške Cloudinary-ja se ne vraćaju klijentu (ostaju u logu).
- Admin-web i mobilna aplikacija proveravaju veličinu pre slanja i prikazuju razlog odbijanja.

**Zašto ovako:**
- Tražio si najviše 10 MB, a može i manje. Vercel ionako odbija zahteve veće od 4.5 MB, pa je 4 MB najveća vrednost koja zaista radi.
- Smanjivanje pri uploadu je ono što stvarno štedi prostor, jer se original nikad ne čuva.
- Brisanje starih slika je bezbedno: porudžbine čuvaju URL slike u kopiji stavke, ali nijedan ekran (faktura, istorija, admin-web) ne prikazuje slike stavki porudžbine.
- Poznata mana: ako se slika otpremi pa se forma zatvori bez čuvanja, ta slika ostaje na Cloudinary-ju.

---

## 7. Porudžbine: status, autor, iznosi

- Nova polja: `status` (za sada samo `new`), `created_by_user_id`, `created_by_name`. Stare porudžbine imaju `status = new` i prazan autor.
- Odgovori (`GET/POST /orders`) sadrže `totals` (`subtotal`, `vat`, `grand`) i `line_net` po stavci, izračunate u `calc.py`.
- Admin-web više nema svoju kopiju formule. Koristi `totals`/`line_net` i prikazuje ukupan iznos i kolonu „Kreirao".
- Lista za superadmina vuče imena firmi jednim upitom umesto jednim po porudžbini (N+1).
- Statistika filtrira po datumu u Mongo upitu umesto da učita sve porudžbine.

**Zašto ovako:**
- `created_by` i `status` su potrebni za RBAC fazu za magacin. Dodati su odmah da nove porudžbine ne ostanu bez autora.
- Formula za novac sada postoji na dva mesta umesto na tri: `calc.py` i mobilni `calc.ts`. Mobilni `calc.ts` ostaje jer se koristi za pregled porudžbine pre slanja, kad server još nije ništa izračunao.

---

## 8. Seed, testovi i CI

- **Seed:** u produkciji se pravi samo superadmin. Demo firma, demo admin, kupci i proizvodi (koje stariji testovi očekuju) prave se **samo uz `SEED_DEMO_DATA=true`**, i nikad u produkciji.
- **Zašto flag, a ne „sve osim produkcije":** lokalni `backend/.env` pokazuje na Atlas bazu. Lokalno pokretanje backenda bi inače upisalo demo admina sa javnom lozinkom u pravu bazu.
- **Testovi:** podrazumevano gađaju `http://localhost:8000` (ranije stari `emergentagent.com`). Novi `tests/helpers.py` sadrži `activate_invited_user`. Novi fajl `test_accounts_and_limits.py` pokriva invite, obaveznu promenu lozinke, pravila za lozinku, `token_version`, emailove, limite, upload i nova polja porudžbine.
- **Ispravljena dva stara testa:** reset lozinke sada koristi svog korisnika, jer bi reset demo admina poništio zajedničku sesiju. Test za `discounts` očekuje `[0]` umesto `[]`, što je ponašanje backenda i od ranije.
- **Rezultat lokalno** (Mongo mock u memoriji): **89/89 testova prolazi**, bez preskočenih.
- **CI:** `.github/workflows/backend-tests.yml` na svaki push koji menja `backend/` podigne `mongo:7` i pusti sve testove. Rezultat se vidi kao ✓ ili ✗ na commitu. Vercel **ne čeka** CI, ono samo izveštava.

---

## 9. Repo i deploy

- **Stari APK:** `easy-order.apk` je obrisan iz `backend/public/app/`. Ostaje pravilo: uvek samo jedan APK. Git istorija i dalje sadrži stare APK-ove, o tome ćemo posebno.
- **`requirements.txt`:** svedeno na 11 paketa koje backend zaista koristi. Izbačeni su pandas, numpy, boto3, jq, typer, python-jose, passlib, requests-oauthlib, tzdata i dev alati. Testovi imaju `requirements-dev.txt`. Provereno je da se backend pokreće u čistom okruženju samo sa `requirements.txt`.
- **`proxy.ts`:** `admin-web/middleware.ts` je preimenovan u `proxy.ts`, što je naziv u Next 16. Ponašanje je isto.
- **`CLAUDE.md`:** prepisan prema stvarnom stanju (Mongo, auth, tri projekta, invite tok, izdavanje APK-a).

---

## 10. Mobilna aplikacija (verzija 1.2.0)

- Ekran za obaveznu promenu lozinke, usmeravanje u `RouteGuard`, a novi token se čuva posle promene.
- **Slanje porudžbine:** šalje samo `product_id`, količinu i popuste. Ako slanje ne uspe, prikazuje se poruka sa razlogom sa servera, uneti nacrt ostaje, a kod greške 400 se katalog ponovo učita. Ranije je greška prolazila tiho.
- **Prijava:** razlikuje pogrešnu lozinku, previše pokušaja (429), deaktiviran nalog (403) i nedostupan server.
- **Uklonjen `LogBox.ignoreAllLogs`,** koji je sakrivao greške.
- **Katalog koristi `FlatList`:** renderuju se samo vidljive kartice, pa aplikacija radi i sa velikim katalogom.
- **`EXPO_PUBLIC_COUNTRY_CODES`** se sada zaista učitava. Expo ubacuje samo doslovni oblik `process.env.EXPO_PUBLIC_*`.
- **Uklonjena dozvola za mikrofon** (`RECORD_AUDIO`), uz blokadu jer je image-picker plugin dodaje sam.
- **Provera veličine slike** pre upload-a.

**Nije testirano na uređaju.** Provereno je samo TypeScript-om i lint-om. Pre izdavanja treba proći: prijavu, porudžbinu, fakturu, admin tab, upload slike i prijavu novog (pozvanog) operatora.

---

## 11. Popust dobavljača: ručni unos (admin-web i mobilni admin)

- Pored čipova `0, 5, 15, 25, 30` postoji polje „ili unesite: ___ %" za bilo koju vrednost od 0 do 100, uključujući decimale (`7,5` ili `7.5`). Čipovi su samo prečice i upisuju vrednost u to polje.
- Neispravna vrednost (veća od 100 ili nečitljiva) se ne čuva i prikazuje se poruka.
- **Ispravljen bug u mobilnom adminu:** popust koji nije bio jedan od čipova (na primer 10%) se pri otvaranju ili čuvanju proizvoda **tiho pretvarao u 0**. Sada se čuva postojeća vrednost.
- Na webu je uklonjen „dodatni čip" iz prethodne izmene, jer polje za unos sada uvek prikazuje trenutnu vrednost.

**Ko šta može (provereno u kodu):**
- Popust postavlja samo admin/superadmin: rute za proizvode imaju `require_manager`, a Admin tab je operatoru sakriven.
- Operator pri prodaji vidi popust dobavljača samo za čitanje, a dodatni popust bira iz liste koju je admin zadao (`additional_discounts`). Server odbija sve van te liste.

---

## Otvoreno / za kasnije
- Privremena lozinka nema rok trajanja. Važi dok je korisnik ne promeni.
- Firma ne može ponovo da se aktivira kroz API.
- Slike otpremljene u formu koja nije sačuvana ostaju na Cloudinary-ju.
- Stari APK-ovi u git istoriji (posebna diskusija).
