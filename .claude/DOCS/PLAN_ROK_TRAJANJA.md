# Plan: praćenje roka trajanja (serije / lotovi)

Status: samo plan, ništa nije implementirano. Datum: 2026-10-06.

## 1. Izvodljivost

Izvodljivo, ali nije mali dodatak. Današnje stanje je jedan broj po artiklu (`products.stock_qty`, komadi) plus `stock_movements` istorija. Rok trajanja je osobina **serije** (isti artikal može imati više rokova u magacinu), pa jedan broj više nije dovoljan. Treba uvesti serije (batches) sa rokom i količinom.

Šta već imamo i koristimo:
- prijem robe (`POST /stock/receipts`) i popis (`/stock/adjustments/batch`) sa skeniranjem barkoda na mobilnom,
- umanjenje stanja pri otpremi (`_move_stock_for_order`, po `picked_qty`) i vraćanje pri override-u,
- append-only `stock_movements`,
- Excel uvoz artikala, portal strana `/stock`.

Šta ne postoji: serije, datum isteka, redosled izdavanja, upozorenja.

## 2. Model podataka

Nova kolekcija `stock_batches`:
`id, client_id, product_id, expiry_date (YYYY-MM-DD), qty (komadi, >= 0), lot_code (opciono, tekst), received_at, created_by`.

Izmene postojećeg:
- `products.track_expiry` (bool, podrazumevano false). Samo artikli sa ovom opcijom koriste serije; ostali rade kao danas.
- `products.stock_qty` ostaje i dalje ukupno stanje (zbir serija za artikle sa rokom). Zato rezervacije, `available_qty`, upozorenja u katalogu i izveštaji rade bez izmena.
- `stock_movements` dobija `batch_id` i `expiry_date` (opciono), da istorija pokazuje iz koje serije je šta ušlo/izašlo.
- `OrderItem.picked_batches: [{batch_id, expiry_date, qty}]` – snimak serija iz kojih je stavka pakovana (za otpremnicu i eventualni rekl.).

Pravilo: za `track_expiry` artikal suma `qty` svih serija mora biti jednaka `stock_qty`; svaka izmena ide kroz jednu funkciju koja menja oba (kao `_record_movement` danas).

## 3. Tokovi

1. **Prijem**: za artikal sa rokom, uz količinu obavezan datum isteka (kamera skenira barkod, pa se unese/izabere datum). Isti artikal + isti datum = ista serija (količina se dodaje).
2. **Popis**: za artikal sa rokom broji se po serijama (datum + količina); razlika ide kao `adjustment` po seriji.
3. **Pakovanje (otprema)**: sistem predlaže **FEFO** (prvo ističe, prvo izlazi). Magacioner pri `picked_qty` vidi iz koje serije da uzme; može da ručno promeni seriju. Pri `shipped` se količina skida iz izabranih serija. Ako nije birao, FEFO se primeni automatski.
4. **Vraćanje** (admin override iz `shipped`): vraća se u iste serije iz `picked_batches`.
5. **Upozorenja**: lista „ističe u narednih N dana" i „isteklo" (portal `/stock` + mobilni magacin), N podešavanje po klijentu (npr. 30).
6. **Prodaja robe kojoj ističe rok**: komercijalni agent u katalogu vidi najbliži rok (informativno). Istekle serije se ne računaju u `available_qty`.
7. **Excel uvoz**: nove kolone „Rok trajanja" + „Količina" za početno stanje (kreira seriju), plus kolona „Prati rok" za artikle.

## 4. Faze

- **Faza A – backend**: `stock_batches`, `track_expiry`, prijem/popis/otprema po serijama, FEFO, testovi (CI već postoji), migracija: za artikle koji pređu na praćenje roka postojeće stanje postaje serija „bez roka/početno" dok se ne izbroji.
- **Faza B – portal**: `/stock` prikaz po serijama, upozorenja, podešavanje „prati rok" na artiklu, uvoz.
- **Faza C – mobilna**: unos datuma pri prijemu i popisu, izbor serije pri pakovanju, lista rokova.
- **Faza D (opciono)**: otpremnica/račun sa serijom i rokom, izveštaj o otpisu (isteklo).

Mobilna: sve gore je JS/TS (forme, liste, birač datuma samim React Native komponentama) → **OTA**, bez novog APK-a. Novi APK samo ako bismo uveli nativni modul (npr. nativni date picker `@react-native-community/datetimepicker`, ili OCR skeniranje datuma sa ambalaže kamerom). Preporuka: krenuti sa običnim unosom (brojčana tastatura DD.MM.GGGG / izbor meseca), što je OTA.

Napomena: backend se menja pa mora ići pre OTA-e; stara verzija aplikacije mora ostati kompatibilna (nova polja opciona, artikli bez `track_expiry` rade isto).

## 5. Rizici

- Dodatni klikovi pri prijemu i pakovanju – magacioner mora brzo da radi; FEFO automatika i pamćenje poslednjeg datuma ublažavaju.
- Stanje „negativno" je danas dozvoljeno; sa serijama treba odlučiti kako (vidi pitanja).
- Migracija postojećeg stanja (nema rokova) – potreban jednokratni popis za artikle koji dobijaju praćenje.

## 6. Odluke koje treba da donesete

1. Da li se rok prati za **sve** artikle ili samo označene (`track_expiry`)? Preporuka: označene.
2. Da li je potrebna **lot/šarža oznaka** sa ambalaže ili samo datum? Preporuka: samo datum (lot opciono polje).
3. Pakovanje: **FEFO automatski** uz mogućnost ručne izmene, ili magacioner uvek bira? Preporuka: automatski + izmena.
4. Šta kad serije nemaju dovoljno (negativno stanje)? Preporuka: skini iz najranije serije, višak ide u „bez roka" stavku i vidi se upozorenje.
5. Da li se **istekla roba blokira** za prodaju (ne računa se u raspoloživo) ili samo upozorava? Preporuka: ne računa se u raspoloživo.
6. Prag upozorenja (npr. 30 dana) – jedan za klijenta ili po artiklu?
7. Da li serija/rok treba da se pojavi na **otpremnici/računu** (Faza D)?
8. Unos datuma: ručno (OTA) ili čitanje sa ambalaže kamerom (zahteva novi APK, nesigurno)? Preporuka: ručno.
9. ~~Admin bez Magacin taba na mobilnom~~ – rešeno u PR #9, ne treba ništa.

## 7. Dopuna: čitanje datuma kamerom (OCR) i grupisanje u serije

### Kako bi radilo
Magacioner skenira barkod, zatim slika datum na ambalaži (expo-camera `takePictureAsync`, već u aplikaciji). Slika ide na naš backend (novi endpoint, npr. `POST /stock/read-expiry`), koji je šalje modelu za čitanje slike (vision) i vraća predložen datum. Aplikacija prikaže datum u polju za ispravku; magacioner potvrdi ili ručno ispravi. Greška OCR-a nikad ne ulazi u stanje bez potvrde.

### Dve tehničke varijante
| | A) Slika → backend → vision model | B) ML Kit na uređaju |
|---|---|---|
| Nativni modul | ne (expo-camera već postoji) | da (novi APK) |
| Isporuka mobilne | OTA | novi APK (Release Android) |
| Internet | potreban | nije potreban |
| Tačnost na štampanim datumima (inkjet, krivina, sjaj) | dobra, razume formate ("BB", "EXP", "12/2027") | slabija, vraća sirov tekst koji treba sami parsirati |
| Trošak | cena po slici (mali, ali stalan), potreban API ključ na backendu | besplatno |

Preporuka: **A**. Lakše je, ide OTA-om, a tekst iz slike tumači model, ne naš regex.

### Koliko komplikuje
- Backend: +1 endpoint, +1 tajna (API ključ), ograničenje veličine slike (Vercel limit 4.5 MB; slika se smanjuje na uređaju na ~1200 px), rate limit po korisniku. Mala do srednja komplikacija.
- Mobilna: +1 ekran/modal za sliku i ispravku datuma. Srednja komplikacija.
- Pravila čitanja: mesec/godina bez dana ("12/2027") → poslednji dan meseca; dvocifrena godina; više datuma na pakovanju (proizvodnja i rok) → traži se samo "rok/BB/EXP"; datum u prošlosti ili preko ~10 godina → upozorenje.
- Ručni unos ostaje uvek kao rezervni put (nema interneta, loša slika). Ukupno je OCR oko 20-30% dodatnog posla preko osnovnog plana, a rizik je uglavnom u tačnosti na stvarnoj ambalaži (zato obavezna potvrda).

### "Svi prepoznati rokovi u jednu seriju"
Tumačim na dva načina, recite koji ste mislili:

1. **Jedan prijem = jedna lista, a serije se prave automatski**: sve što se skenira u jednom prijemu ide u isti dokument prijema, a sistem sam spaja iste artikle sa istim datumom u jednu seriju (10 komada istog artikla sa istim rokom = 1 serija, količina 10). Dodaje se dugme "isti rok kao prethodni". Ovo preporučujem; zadržava FEFO.
2. **Samo jedan rok po artiklu** (najraniji), bez serija: mnogo jednostavnije, ali ako stigne nova isporuka sa kasnijim rokom, ne zna se šta je od koje; FEFO ne radi pravilno. Prihvatljivo samo ako roba retko stoji duže od jedne isporuke.

Dodatna odluka 10: varijanta A ili B (preporuka A, OTA)? Odluka 11: serije automatski spojene po datumu (1) ili jedan rok po artiklu (2)? Odluka 8 iz liste iznad menja se u: OCR kamerom uz obaveznu potvrdu, ručni unos kao rezerva.

Redosled faza: kamera ulazi tek u Fazi C (mobilna); Faze A i B ne zavise od nje, pa ceo sistem prvo radi sa ručnim unosom, a OCR se dodaje kao poboljšanje bez izmene modela podataka.

## 8. Odluka: prvo ručni unos (bez kamere)

Prva verzija: magacioner skenira barkod, aplikacija nađe artikal, unosi se **broj komada i datum isteka** za tu seriju (isti artikal + isti datum = ista serija). Sve je JS/TS, **OTA**. Kamera (odeljak 7) se dodaje kasnije bez izmene modela.

## 9. Obaveštenja o isteku (magacin i admin)

Pragovi: 30, 15, 10 i 5 dana pre isteka, plus "isteklo". Podešavaju se po klijentu (podrazumevano 30/15/10/5).

### Kanali
1. **U aplikaciji (osnova, OTA)**: endpoint `GET /stock/expiring` računa pri čitanju koje serije upadaju u prag (bez čuvanja stanja obaveštenja). Mobilni Magacin dobija značku (broj) i listu "Ističe uskoro", grupisano po pragu i obojeno (30 žuto, 15/10 narandžasto, 5 i isteklo crveno). Portal `/stock` isto, plus traka na vrhu za admina. Vide magacin, admin i superadmin.
2. **Email (preporuka kao dodatak)**: dnevni rezime za admine (i magacionere koji imaju email) kad serija pređe novi prag. SMTP već postoji. Šalje se jednom po seriji i pragu (kolekcija `expiry_alerts`: batch_id + prag), da se isto ne ponavlja svaki dan. Pokreće ga dnevni Vercel cron koji zove zaštićen endpoint.
3. **Push na telefon**: zahteva `expo-notifications` (nativni modul → **novi APK**) i čuvanje tokena uređaja. Preporuka: ne u prvoj verziji; značka u aplikaciji + email pokrivaju potrebu.

### Pravila
- Serija sa količinom 0 ne ulazi u obaveštenja.
- Serija koja je već ispod praga pri uvođenju dobija samo najniži važeći prag (ne šalje se 4 emaila odjednom).
- Ako se rok serije ispravi, obaveštenja za tu seriju se računaju iznova.
- Isteklo se ne računa u raspoloživo (odluka 4); admin može da otpiše seriju (`adjustment` sa napomenom "Otpis - istekao rok") jednim dugmetom.

### Dodatak fazama
- **Faza A (backend)**: + `GET /stock/expiring`, pragovi u podešavanjima klijenta, `expiry_alerts`, dnevni cron + email.
- **Faza B (portal)**: + traka/lista upozorenja, podešavanje pragova (superadmin/admin), dugme za otpis.
- **Faza C (mobilna)**: + značka i lista u Magacinu (OTA).

### Dodatne odluke
12. Pragovi 30/15/10/5 fiksni za sve ili podesivi po klijentu? (preporuka: podesivi, ove vrednosti kao podrazumevane)
13. Samo u aplikaciji, ili i email rezime? (preporuka: oba)
14. Push na telefon (novi APK) sada ili kasnije? (preporuka: kasnije)
15. ~~Admin nema Magacin tab na mobilnom (TODO #1)~~ – rešeno u PR #9 (CI zelen, čeka merge). Rad na roku trajanja se gradi na main-u posle merge-a PR #9; nije potrebno posebno pokrivati.

## 10. Konačne odluke o obaveštenjima (JBabic, 2026-10-06)

- Pragovi: **30, 15 i 5 dana** pre isteka, plus "isteklo". Podesivi po klijentu, ove vrednosti su podrazumevane (zamenjuju 30/15/10/5 iz odeljka 9).
- Kanal: **samo u aplikaciji** (značka + lista na mobilnom Magacinu i portalu `/stock`). Email rezime i push se ne rade sada; push (novi APK) kasnije. `expiry_alerts` kolekcija i dnevni cron otpadaju iz Faze A, jer se sve računa pri čitanju.
- Ko vidi: samo **admin i magacin** klijenta. **Superadmin ne dobija** obaveštenja (nije vezan za klijentovo skladište). **Operator ne vidi** nikakve informacije o roku (ni značku, ni listu, ni rok u katalogu). Odeljak 3 tačka 6 (rok u katalogu za komercijalistu) se **briše**.
- Backend: `GET /stock/expiring` dostupan samo ulogama admin i warehouse (zahteva `client_id` iz naloga); superadmin i operator dobijaju 403. Podaci o seriji/roku se ne vraćaju operatoru ni u `GET /products`.
- Admin Magacin tab na mobilnom: rešeno u PR #9, nema posla u ovom planu.

Preostalo za odluku (iz ranijih odeljaka): 1 (sve ili označeni artikli), 3 (FEFO), 4 (negativno stanje), 5 (istekla roba van raspoloživog), 7 (serija na otpremnici).

## 11. Odluka 1 (JBabic, 2026-10-06)

Rok se prati samo za **označene artikle**. Oznaka `track_expiry` se uključuje u izmeni artikla (portal: checkbox na formi artikla; mobilni `admin.tsx`: Switch), kao i `active`. Isključuje se kada artikal nema serije sa količinom > 0 (ili uz upozorenje i prebacivanje stanja u "bez roka"). Excel uvoz dobija kolonu "Prati rok" (da/ne). Uključivanje oznake na artiklu sa postojećim stanjem pravi seriju "bez roka" sa tim stanjem, dok se ne izbroji po rokovima.

## 12. Odluke 3, 4/5, 7 (JBabic, 2026-10-06)

Prihvaćene preporuke: automatski FEFO pri pakovanju uz ručnu izmenu; istekla roba se ne računa u raspoloživo. **Serija/rok na otpremnici i računu: ne sada** (Faza D otpada; `picked_batches` se ipak čuva, pa se ispis može dodati kasnije).
Sve odluke su donete; plan je spreman za implementaciju posle merge-a PR #9 (faze A, B, C).
