# Plan obilaska radnji (modul „Obilasci")

Datum: 2026-11-09 · Status: predlog za odobrenje (ništa nije implementirano)

## 1. Cilj i obim

Komercijalista na nedeljnom i mesečnom nivou zna **koga treba da obiđe (ili pozove)**, da radnje koje su blizu budu u istom danu, a admin vidi šta je planirano i šta je stvarno obavljeno. Cilj je manje vožnje i manje zaboravljenih kupaca.

**Ulazi**
- Učestalost obilaska po kupcu, zone, spisak „na redu" (kome je rok istekao).
- Plan komercijaliste za nedelju ili mesec (isti podaci, drugačiji pregled), označavanje „obiđeno" / „preskočeno" uz belešku.
- Rad i za **fizički obilazak i za telefonski poziv** (kanal po kupcu, isti tok).
- Pregled za admina: planirano naspram obavljenog po komercijalisti.
- Opciono: lokacija telefona u trenutku „obiđeno" (dokaz i istovremeno prikupljanje koordinata radnji).

**Ne ulazi (sada)**
- Grupisanje i rute za **dostavu** (zaseban posao magacina, kasnije na istim podacima).
- Automatska optimizacija rute sa spoljnim servisom za mape (faza 3, samo ako se pokaže potreba).
- Praćenje kretanja komercijaliste (nema pozadinskog praćenja, lokacija se čita samo u trenutku potvrde obilaska).

**Paket:** poseban modul `visits`, dodatna stavka kao SEF (nije u podrazumevanim modulima, cena u Cenovniku, uključuje ga superadmin klijentu).

## 2. Odluke koje treba potvrditi (sa preporukom)

| # | Pitanje | Preporuka |
|---|---|---|
| D1 | Čiji je kupac? Danas svi kupci pripadaju svim komercijalistima. | **Ostaje tako.** Ne uvodimo vlasništvo nad kupcem. Umesto toga plan je po komercijalisti: kupac je „zauzet" za period kad uđe u tuđ plan (soft claim, vidi 4). |
| D2 | Učestalost po kupcu | `visit_every_days` (prečice 7 / 14 / 30, ili ručno). Prazno = kupac nije u rotaciji. |
| D3 | Kanal | `visit_channel`: `visit` (fizički obilazak, podrazumevano) ili `call` (telefon). Isti ekran, isti statusi, drugačije dugme („Obiđeno" / „Pozvano"). |
| D4 | Dokaz obilaska | **Opciono po klijentu** (podešavanje „traži lokaciju", podrazumevano isključeno). Čita se jednom pri potvrdi, bez praćenja. Zahteva novi APK (nativni modul `expo-location`), vidi rizike. |
| D5 | Zone | `zones` (naziv), kupac ima jednu zonu. Admin ih pravi ručno; predložena početna podela po gradu i poštanskom broju (podaci iz S1). |
| D6 | Dostava | Van obima. Zone i koordinate koje ovde nastanu mogu kasnije da posluže za grupisanje dostave. |

## 3. Šta već postoji

- Kupci sa strukturiranom adresom (`street`, `city`, `postal_code`), pa se zone mogu predložiti iz podataka.
- Istorija porudžbina po kupcu (poslednja porudžbina = jedan od dva pokazatelja „davno nismo obišli").
- Moduli, Cenovnik, mobilna aplikacija sa ulogom komercijaliste, ciljevi i učinak (`targets`), uvoz kupaca iz Excela.
- **Nema:** dodele kupca komercijalisti, učestalosti, zona, koordinata, evidencije poseta.

## 4. Model podataka

**Postojeće kolekcije**
- `customers`: `visit_every_days` (int ili prazno), `visit_channel` (`visit`|`call`), `zone_id`, `location` (`{lat, lng, accuracy, set_at, set_by}`, faza 2). Sva polja `None` = zadrži (stare aplikacije ne smeju da ih obrišu, isto pravilo kao kod adrese).
- `clients`: `visit_settings` (`require_location` bool, `plan_days` radni dani u nedelji, podrazumevano pon–pet).

**Nove kolekcije**
- `zones`: `id`, `client_id`, `name`, `active`.
- `visits` (jedan zapis = jedna planirana ili obavljena poseta):
  `id`, `client_id`, `customer_id`, `customer_name` (snapshot), `user_id` (komercijalista), `user_name`, `planned_date` (YYYY-MM-DD) ili prazno za neplaniranu posetu, `channel`, `status` (`planned` | `done` | `skipped`), `done_at`, `note`, `order_id` (ako je iz posete nastala porudžbina), `location` (opciono, pri potvrdi), `distance_m` (od sačuvane lokacije radnje, ako postoji), `created_by`, `created_at`.
  Indeksi: `(client_id, user_id, planned_date)`, `(client_id, customer_id, planned_date)`.
- **Izračunato, ne čuva se:** poslednja poseta kupca (poslednji `done`), poslednja porudžbina, „kasni X dana" (`rok = poslednja poseta + visit_every_days`).

**Pravilo „zauzeto" (soft claim):** dok je kupac u nečijem planu za period (status `planned`), u predlozima ostalih komercijalista se označi „u planu: Marko, utorak". Dozvoljeno je ipak ga dodati (upozorenje), jer su kupci zajednički.

## 5. Backend

Modul `visits` (nije u `DEFAULT_MODULES`), svi endpointi iza `require_module(Module.VISITS, ...)`, tenancy kao i svuda (tuđ tenant 404).

- `GET/POST/PUT/DELETE /zones` (admin). Brisanje zone koju kupci koriste: 409.
- `PUT /customers/{id}` prima nova polja (učestalost, kanal, zona); Excel uvoz dobija kolone `Zona`, `Učestalost obilaska (dana)`, `Kanal (obilazak/poziv)`.
- `GET /visits/due` (komercijalista i admin): kupci „na redu", sortirani po kašnjenju, sa zonom, poslednjom posetom, poslednjom porudžbinom, oznakom „u planu kod ...". Filteri: zona, kanal, period.
- `GET /visits/plan?from=&to=&user_id=` (komercijalista samo svoj, admin bilo čiji): plan za nedelju ili mesec, grupisan po datumu i zoni.
- `POST /visits/plan` (komercijalista za sebe, admin za bilo koga): dodaje kupce u plan (`customer_ids`, `planned_date`); `POST /visits/plan/suggest` vraća predlog nedelje (kupci na redu, grupisani po zoni, raspoređeni po radnim danima, najviše N po danu); korisnik potvrđuje ili menja, ništa se ne upisuje bez potvrde.
- `POST /visits/{id}/done` (`note`, `location` opciono, `order_id` opciono), `POST /visits/{id}/skip` (`note` obavezna), `POST /visits` (neplanirana poseta „obiđi sada"), `PUT /visits/{id}` (prebacivanje datuma), `DELETE /visits/{id}` (samo planirana).
- `GET /visits/report` (admin): po komercijalisti i periodu: planirano, obavljeno, preskočeno, procenat, kupci koji kasne.
- Faza 2: `POST /customers/{id}/location` (postavlja koordinate radnje iz prve potvrde ili ručno), pravilo „lokacija pri potvrdi" iz `visit_settings`.
- Audit (`_audit`) za izmene zona i podešavanja; plan i posete su radni podaci, ne ide u dnevnik.
- Komercijalista vidi samo svoje posete (tuđe 404), admin sve u svom klijentu, magacin ništa.

## 6. Aplikacija (komercijalista) i portal (admin)

**Mobilna aplikacija** (novi tab „Obilazak" za komercijaliste sa modulom)
- „Danas": lista planiranih poseta za dan, grupisana po zoni, sa kašnjenjem, poslednjom porudžbinom, adresom, dugmetom „Pozovi" / „Navigacija" (otvara mape sa adresom, bez našeg API ključa), „Obiđeno", „Preskoči", „Nova porudžbina" (otvara katalog za tog kupca, porudžbina se veže za posetu).
- „Nedelja" i „Mesec": isti podaci kao kalendar; dodavanje kupaca iz liste „na redu", predlog nedelje jednim klikom.
- Neplanirana poseta: „Obiđeno sada" za bilo kog kupca.
- Lokacija (faza 2, kad je uključena): pri „Obiđeno" jednom se čita pozicija, uz jasno obaveštenje korisniku.

**Portal** (admin, nova stavka „Obilasci", u prozoru Kupci polja za učestalost, kanal i zonu)
- Zone, spisak „na redu" po zonama, plan po komercijalisti (nedelja/mesec), izveštaj planirano naspram obavljeno.
- Podešavanja modula (traži lokaciju, radni dani).

## 7. Faze

| Faza | Sadržaj | Prihvatni kriterijum | Procena |
|---|---|---|---|
| **V0. Odluke** | D1–D6 potvrđene; pilot klijent i komercijalista; 10–20 kupaca sa učestalošću | spisak odluka potvrđen | 1 dan |
| **V1. Plan i evidencija** | modul `visits`, zone, polja kupca, uvoz, `visits` kolekcija, „na redu", plan nedelje i meseca, označavanje, predlog nedelje, izveštaj, mobilni tab „Obilazak", portal stranica, Cenovnik, uputstva | komercijalista za nedelju dobije plan, obeleži posete, admin vidi izveštaj; testovi tenancy, uloga, „zauzeto" | 8–10 dana |
| **V2. Lokacija** | `expo-location` (novi APK), „traži lokaciju", koordinate radnje iz prve potvrde, odstupanje od lokacije, sortiranje po blizini, „Navigacija" sa više tačaka | potvrda zabeleži poziciju; radnja dobija koordinate; admin vidi odstupanja | 4–5 dana |
| **V3. Rute (po potrebi)** | redosled obilaska unutar dana (najbliži sused na koordinatama), eventualno spoljni servis, metrika „poseta" u ciljevima | skraćena ukupna dužina dana na pilotu | 5–8 dana, tek posle pilota |

## 8. Rizici i otvorena pitanja

1. **Kvalitet adresa.** Zone i grupisanje su onoliko dobri koliko su podaci o kupcima popunjeni. S1 je to poboljšao, ali stari kupci mogu nemati grad ili poštanski broj.
2. **Rad bez signala.** Aplikacija danas nema red za slanje van mreže. Označavanje „obiđeno" u zoni slabog signala treba da se pamti i pošalje kasnije. Za V1 dovoljan je ponovni pokušaj uz jasnu poruku, a pravi red za slanje je kandidat za V2.
3. **Lokacija i privatnost.** Lokacija zaposlenog je lični podatak: samo u trenutku potvrde, uz obaveštenje, uključuje se po klijentu, ne čuva se istorija kretanja. Poslodavac (klijent) mora da obavesti zaposlene.
4. **Novi APK za V2.** `expo-location` je nativni modul, pa V2 ne može OTA; V1 je samo JS i ide preko OTA.
5. **Duplirane posete.** Kupci su zajednički, pa dva komercijaliste mogu planirati istog kupca. Rešava se upozorenjem „u planu kod ...", ne zabranom.
6. **Preširok obim.** Najveći rizik je da se V1 pretvori u planer ruta. Zato je V3 odvojen i uslovljen pilotom.
7. **Cena modula** upisuje se u Cenovnik pri uključivanju (kao SEF), bez izmene koda.

## 9. Testovi i dokumentacija

- Integracioni testovi: tenancy i uloge (komercijalista vidi samo svoje, magacin 403), „na redu" (kašnjenje, učestalost, neaktivni kupci), „zauzeto", plan/predlog (zone i radni dani), označavanje i neplanirana poseta, izveštaj, brisanje zone u upotrebi, uvoz kupaca sa novim kolonama.
- Uputstva: `komercijalista.md` (tab Obilazak) i `admin.md` (zone, plan, izveštaj), nova slika snimljena iz test okruženja, `publish_guides.py`.
- CLAUDE.md: paragraf „Visits module".
