# Plan: povezivanje sa SEF-om, e-otpremnicama i ERP sistemima

Datum: 2026-11-06 · Status: istraživanje i predlog (ništa nije implementirano)

> **Napomena o izvorima.** Zvanični PDF-ovi (efaktura.gov.rs, eotpremnica.efaktura.gov.rs) nisu mogli da se otvore iz ovog okruženja (host nije dozvoljen), pa činjenice dolaze iz rezultata pretrage i stranica trećih strana (dobavljači softvera, portali sa propisima). Tačke označene **[proveriti]** moraju da se potvrde u zvaničnoj tehničkoj dokumentaciji pre implementacije. Za razvoj nam trebaju pristup demo okruženju SEF-a i čitanje zvaničnih specifikacija.

## 1. Šta postoji (kratko)

**SEF (Sistem elektronskih faktura)**, Ministarstvo finansija
- Faktura je **UBL 2.1 XML** po srpskom profilu EN 16931 (SRBDT; CustomizationID `urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022`). Nije Peppol.
- Dva okruženja: **demo** (`demoefaktura.mfin.gov.rs`) i **produkcija** (`efaktura.mfin.gov.rs`); API ključ se generiše posebno za svako.
- **API ključ** pravi administrator firme na SEF portalu (Podešavanja → API menadžment → Generiši ključ) i mora da uključi status API-ja. Šalje se kao zaglavlje `ApiKey` uz svaki zahtev; nema posebne razmene tokena. Ključ je tajna firme (po firmi, ne po softveru).
- API pokriva izlazne fakture (slanje UBL-a, status, otkazivanje, storno, preuzimanje XML-a), ulazne fakture i evidenciju PDV-a. Primer putanje: `POST .../sales-invoice/ubl/upload` (fajl se šalje kao multipart). Potpis i pečat radi SEF na serveru.
- Evidencija PDV-a se vodi preko SEF-a (rok oko 12. u narednom mesecu **[proveriti]**). Kazne za neispunjenje: 50.000–2.000.000 din (pravna lica, preduzetnici i informacioni posrednik).

**e-Otpremnice (eOtpremnica)**, isti portal-porodica (`eotpremnica.efaktura.gov.rs`)
- Zakon o elektronskim otpremnicama (Sl. glasnik 94/2024, 109/2025, 80/2026). **Faza 1: od 1.1.2026.** javni sektor i akcizna roba. **Faza 2: od 1.10.2027.** privatni sektor (izvori se u detaljima razilaze, a širi se i netačna tvrdnja o 1.10.2026) **[proveriti]**. Tolerancija grešaka je produžavana (do početka 2027. prema jednom izvoru).
- Postoji zvanično **API tehničko uputstvo** (verzija maj 2025). Dokumenti: e-otpremnica = UBL **Despatch Advice**, e-prijemnica = **Receipt Advice**, izmena podataka pošiljke = **Application Response**. Autentikacija: zaglavlje `Api-key` (poseban API ključ za e-otpremnice).
- Otpremnica se izdaje **pre nego što roba napusti skladište** (otpremac).

**ERP/računovodstveni softver u Srbiji** (Pantheon, Minimax, Metakod, Winfakt, Odoo…)
- Većina ima **ugrađeno slanje na SEF**. Pantheon ima API (porudžbine, partneri, artikli, dokumenti; spoljno povezivanje traži Connector licencu; cena iz izvora ~179 € jednokratno ili ~8,9 €/mes. **[proveriti]**). Minimax ima REST API sa OAuth2 (pristup preko podrške proizvođača).
- Bez direktne veze, računovođa uvozi UBL XML ručno.

## 2. Ključno pitanje: ko je „vlasnik“ fakture?

Naš sistem danas pravi **narudžbenicu** (komercijalista) i **otpremnicu/numeraciju** pri otpremi (magacin), ali ne vodi knjigovodstvo. Zato postoje dva realna modela, i **pre implementacije treba pitati prve klijente** šta koriste:

| Model | Kome odgovara | Šta mi radimo |
|---|---|---|
| **A. ERP izdaje fakturu** (većina firmi koje imaju Pantheon/Minimax…) | firme sa ERP-om i računovođom | pošaljemo otpremljenu porudžbinu u ERP (izvoz ili API), ERP pravi fakturu i šalje na SEF |
| **B. Mi izdajemo fakturu** | male veleprodaje bez ERP-a | pravimo UBL, šaljemo na SEF direktno, računovođi dajemo XML/PDF/Excel |

Ako firma radi po modelu A, direktno slanje na SEF iz našeg sistema bi **udvostručilo fakturu** (ERP bi je izdao ponovo). Zato je izbor modela po klijentu, ne globalan.

## 3. Opcije, od najlakše

**Opcija 1: izvoz za ERP (najlakše, 3–5 dana, bez pravnog rizika).**
Admin izvozi otpremljene porudžbine za period (Excel/CSV + opciono UBL XML) sa potrebnim poljima: broj fakture, datum otpreme, kupac (PIB), stavke (šifra/naziv, količina po `picked_qty`, cena, rabati, PDV). ERP (Pantheon, Minimax…) to uvozi. Radi za sve ERP-ove i za model A i za računovođu u modelu B. Ne zavisi od SEF-a.

**Opcija 2: direktno slanje na SEF (model B, 3–5 nedelja).** Detaljno u odeljku 4.

**Opcija 3: konektor po ERP-u (model A, 2–4 nedelje po proizvođaču, samo na zahtev).**
Slanje porudžbina/faktura kroz API ERP-a (Pantheon API, Minimax REST). Svaki ERP ima svoje šifre artikala i partnera, mapiranje i licencu, pa se radi **samo za ERP koji prvi klijent zaista koristi**, nakon Opcije 1.

**Opcija 4: e-otpremnice (zasebna faza, odeljak 5).**

**Preporučeni redosled:** 1 → (2 ili 3 zavisno od klijenta) → 4. Preskočiti opciju 2 ako nijedan klijent nema model B.

## 4. Opcija 2 u našem sistemu: SEF za izlazne fakture

**Arhitektura (uklapa se u postojeće module):**
- Novi **modul `sef`** (`Module.SEF`, zavisi od `warehouse`): superadmin ga uključuje po klijentu/paketu, kao `focus`/`targets`.
- Podešavanja po klijentu (admin ih unosi, `Integracije`): okruženje (demo/produkcija), **API ključ (šifrovan u bazi**, ključ za šifrovanje u env, nikad u odgovoru/logu), dugme „Proveri vezu“, uključi automatsko slanje pri otpremi.
- Kolekcija **`einvoices`** (append-only): `order_id`, `client_id`, broj fakture, tip (faktura/storno), `ubl_xml`, `sef_invoice_id`, `status`, greške, vremena. Jedna aktivna faktura po porudžbini (jedinstveni indeks).
- Backend modul (`sef.py`): **UBL builder** (Python) koji koristi `calc.py` kao jedini izvor za iznose (SEF proverava zbirove i zaokruživanje) + SEF klijent (upload, status, otkazivanje/storno).
- Tok: porudžbina `shipped` → broj fakture (već postoji) → „Pošalji na SEF“ (prvo ručno sa pregledom, kasnije automatski) → status se vidi u listi porudžbina (kolona/značka) i na portalu admina. Greška se prikazuje čitljivo, uz „Pošalji ponovo“.
- Status od SEF-a: jer je backend serverless (Vercel), **nema stalnog procesa**: osvežavanje statusa pri otvaranju porudžbine + postojeći dnevni cron (+ webhook ako ga SEF podržava **[proveriti]**).

**Podaci koje danas nemamo, a UBL traži:**
- Prodavac (`clients`): strukturirana adresa (ulica, grad, poštanski broj, država), PIB, matični broj (`registration_number` postoji), da li je u sistemu PDV-a, tekući račun (postoji `bank_account`).
- Kupac (`customers`): danas samo slobodan tekst `address` + `pib`. Treba **ulica/grad/poštanski broj/država**, matični broj i (za javni sektor) JBKJS. Migracija postojećih kupaca: ručna dopuna ili pokušaj parsiranja.
- **Jedinice mere:** naše šifre (`kom`, `g`, `kg`, `l`…) preslikati u UN/ECE kodove (`H87`, `GRM`, `KGM`, `LTR`…).
- **PDV kategorije:** naša `vat_rate` (broj) → kategorija SEF-a (S/Z/E/AE/O…). Potrebna potvrda računovođe za izuzetke (0 %, oslobođeno).
- **Rabati:** naš „dobavljački + dodatni rabat“ → `AllowanceCharge` po stavci tako da se zbirovi slažu sa `calc.py`.
- Datum prometa (datum otpreme), rok plaćanja, način plaćanja (račun, poziv na broj).

**Poslovna pravila koja moramo da izmenimo:**
- Danas admin može da vrati `shipped` porudžbinu u `new` (zaliha se vraća, broj fakture ostaje). Posle **prihvaćene fakture na SEF-u** to više ne sme tiho: ili blokirati, ili automatski napraviti **storno** (kreirati novu fakturu pri ponovnoj otpremi).
- Numeracija mora biti **bez rupa i jedinstvena** (zakonska obaveza). Prvo popraviti poznatu slabost iz izveštaja: broj se uzima pre uslovnog upisa (već je ublaženo vraćanjem broja, ali pre produkcije proveriti pod opterećenjem).
- Ručna numeracija (`invoice_numbering: manual`) ostaje, ali se broj pri slanju mora poklapati sa onim u UBL-u.

**Bezbednost:** API ključ klijenta je tajna: šifrovan (npr. Fernet), nikad se ne vraća kroz API (samo „postavljen/nije“), ne ulazi u logove, upisuje se u dnevnik (`integration.sef.key_set`), admin može da ga zameni; uvek test na **demo okruženju** pre produkcije.

## 5. e-Otpremnice (faza 4)

- Prirodno mesto: magacin. Kada magacioner **preuzme/otpremi** porudžbinu, pravi se Despatch Advice pre polaska robe.
- Dodatni podaci koje nemamo: **prevoznik i vozilo** (tablice, vozač), adresa istovara (kupac ima samo jednu adresu; potrebno je više adresa isporuke), podaci o robi (jedinice, serije/rokovi, akcizna roba), e-prijemnica od kupca (Receipt Advice) i izmene pošiljke (Application Response).
- Modul `eotpremnica`, isti obrazac kao `sef` (zaseban API ključ za e-otpremnice, kolekcija `edespatches`).
- **Prioritet zavisi od klijenata:** ako neko isporučuje javnom sektoru ili akciznu robu, obavezno je **već sada**; za ostale od 1.10.2027. Mi imamo vremena, ali magacinski podaci (vozilo, adrese isporuke) mogu da se počnu skupljati ranije.

## 6. Plan rada

| Faza | Sadržaj | Procena |
|---|---|---|
| 0. Priprema | Razgovor sa 2–3 klijenta (ERP? ko izdaje fakturu? javni sektor? akcizna roba?), SEF demo nalog i API ključ, čitanje zvaničnih specifikacija, dozvola mrežnog pristupa SEF/eOtpremnica hostovima za razvoj | 1 nedelja |
| 1. Izvoz za ERP | Excel/CSV (+UBL) izvoz otpremljenih porudžbina, uputstvo za admina | 3–5 dana |
| 2. Strukturirani podaci | adresa/matični broj/JBKJS za kupce i prodavca, mapiranje jedinica i PDV | 1 nedelja |
| 3. SEF (model B) | modul `sef`, UBL builder, slanje/status/storno, portal i uputstvo, testovi na demo | 3–4 nedelje |
| 4. e-Otpremnice | modul `eotpremnica`, podaci o vozilu/isporuci, e-prijemnica | 3–4 nedelje |
| 5. ERP konektor | samo za ERP koji klijent stvarno koristi | 2–4 nedelje po ERP-u |

Svaka faza ide kao poseban PR; u svakoj: testovi protiv demo SEF-a (ne produkcije), proverena faktura sa računovođom, dopuna uputstva za admina i `CLAUDE.md`.

## 7. Rizici i otvorena pitanja

1. **Model A vs B** (odeljak 2): bez odgovora klijenta ne znamo da li direktno slanje uopšte treba.
2. **Zakonska odgovornost** za ispravnost fakture je na klijentu; mi smo alat. Poreske kategorije i izuzeci moraju da odobri računovođa.
3. **Tačnost zbirova:** SEF odbija fakturu čiji se iznosi ne slažu u centu; zaokruživanje mora biti identično `calc.py`.
4. **Specifikacije se menjaju** (CustomizationID je već menjan 2021→2022; zakon o otpremnicama menjan 2026). Potrebna je verzija pod kontrolom i testovi na demo okruženju pri svakoj promeni.
5. **Serverless ograničenja:** nema stalnih radnika; ponavljanje slanja i osvežavanje statusa idu preko cron-a i ručnog „osveži“.
6. **Otvoreno [proveriti]:** tačne putanje i parametri (npr. `requestId` za izbegavanje duplog slanja), postojanje webhook-a, pravila storna i avansnih faktura, obavezna polja kupca, tačni datumi faza e-otpremnice, cena Pantheon Connector licence.
7. **Pristup:** za razvoj ovaj sandbox mora da dobije dozvolu za SEF i eOtpremnica hostove (npr. `demoefaktura.mfin.gov.rs`, `eotpremnica.efaktura.gov.rs`, `efaktura.gov.rs`).

## 8. Preporuka

1. Odmah: **Faza 0** (razgovor sa klijentima) i **Faza 1** (izvoz za ERP). Daje stvarnu vrednost svima, bez zakonskog rizika i bez zavisnosti od SEF-a.
2. Zatim, prema odgovorima: **model B (SEF)** za klijente bez ERP-a ili **konektor** za njihov ERP.
3. **e-Otpremnice** posle SEF-a, osim ako klijent isporučuje javnom sektoru ili akciznu robu, kada idu odmah.

## 9. Dodatak: šta pokrivaju dokumenti koje je klijent dostavio (2026-11-06)

Dva PDF-a sa zvaničnog sajta (API_EPP verzija 30.04.2026. i API_EEO_PDV verzija 11.08.2024.) **nisu specifikacija za slanje faktura**. Oba opisuju **evidenciju PDV-a** u SEF-u:
- **EPP, elektronsko evidentiranje prethodnog poreza:** ulazni PDV (nabavke od obveznika, fiskalni i drugi računi, uvoz).
- **EEO PDV, evidentiranje obračuna PDV:** pojedinačne i zbirne evidencije obračunatog PDV-a (promet po stopama 20 % i 10 %, avans, storno, poreski dužnik, posebni postupci).

**Šta iz njih saznajemo i važi za naš plan**
- Isti obrazac pristupa kao kod faktura: JSON preko HTTPS, API ključ u zaglavlju (`apiKey`), poseban demo host (`demoppppdv.mfin.gov.rs`) i produkcioni, Swagger stranica. EPP traži i PIB uz ključ (401 ako se ne poklapaju), što potvrđuje da je ključ vezan za PIB firme.
- Sistemska polja se pune **automatski iz e-faktura** do 10. odnosno 12. u mesecu posle poreskog perioda. Posle toga korisnik mora da unese vrednosti ručno. **Zaključak:** fakture moramo da šaljemo na vreme (najkasnije do 10. u narednom mesecu). SEF modul treba da pokazuje neposlate i odbijene fakture, posebno pred kraj meseca.
- Specifikacije se menjaju često (EPP verzija iz 2026. menja način preuzimanja vrednosti za periode posle 1.7.2025.). Još jedan razlog za testove na demo okruženju pri svakoj promeni.

**Šta NE treba da radimo.** Evidenciju i obračun PDV-a (EPP/EEO) vodi računovođa ili ERP, na nivou poreske prijave. Nama su ti podaci sa SEF-a potrebni samo posredno: kad šaljemo ispravne izlazne fakture, SEF sam puni obračunati PDV. Slanje EPP/EEO iz našeg sistema nije deo plana.

**Šta nam još nedostaje (ne može se uraditi bez toga):** zvanična specifikacija za **izlazne fakture** (putanje `sales-invoice/...`, upload UBL-a, statusi, otkazivanje i storno) i SRBDT specifikacija UBL-a. Na sajtu efaktura.gov.rs su, prema pretrazi, to: „Specifikacija prilagođene primene standarda EN 16931-1 (SRBDT)“ (`/extfile/sr/1804/spec-srbdt-ext-en16931-2023_03_31.pdf`), „Interno tehničko uputstvo“ (`/extfile/sr/7593/...`) i prezentacija „Rad sa SEF-om preko API servisa“ (`/extfile/sr/1470/...`), a za otpremnice tehničko uputstvo na eotpremnica.efaktura.gov.rs. Najbolje je izvesti **Swagger JSON** sa demo SEF-a, koji je sama tačna specifikacija API-ja.
