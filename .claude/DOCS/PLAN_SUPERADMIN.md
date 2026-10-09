# Plan: portal za vlasnika sistema (superadmin)

Cilj: superadmin je vlasnik sistema, ne korisnik poslovnih podataka klijenata. Vidi samo ono što mu treba da vodi posao: klijente, pakete, pretplate, uplate i dugovanja, korisnike, zdravlje sistema. Nadovezuje se na `PLAN_MODULI.md` i `PLAN_PRETPLATE.md`.

## Odluke

- Meni superadmina: **Dashboard, Klijenti, Pretplate (+ Paketi), Uplate, Korisnici, Aplikacija** (+ kasnije Dnevnik i Obaveštenja). Artikli, Kupci, Porudžbine, Magacin, Stanje i Izveštaji nestaju iz menija. Backend superadminu i dalje dozvoljava te rute (samo se skriva meni, prava se ne diraju).
- Klijenti i Korisnici: **oba načina** — stranica klijenta ima tabove (Pregled, Korisnici, Pretplata, Uplate, Beleške), a globalni spisak Korisnika ostaje, sa kolonom Klijent i filterom.
- Dashboard superadmina: kartice umesto grafikona. Dashboard admina klijenta ostaje kakav jeste.
- Cene: po paketu, **različita cena po periodu** (1 / 3 / 6 / 12 meseci), valuta za sada samo **RSD**.
- Dug: uplata može da bude **očekivana** (dug) ili **primljena**; rok je `due_date`.
- Uplate i dugovi se vode ručno; kasnije automatska naplata piše iste zapise sa drugim izvorom.
- Preusmeravanje na korisnika (impersonate) ide poslednje, kao poseban korak zbog bezbednosti.

## Faza A — Meni i Dashboard (mala) — ✅ urađeno

- Sidebar: stavke po ulozi; superadmin dobija gornji meni. Uplate se pojavljuju tek kad stigne faza C.
- `GET /superadmin/overview` (samo superadmin): klijenti (ukupno / aktivni / deaktivirani / zaključani), korisnici (ukupno i po ulozi), pretplate (aktivne / ističu za 30 dana / grejs / zaključane / bez pretplate), lista „Treba pažnju“ (grejs, zaključani, zakazano brisanje u narednih 14 dana).
- Dashboard: za superadmina nove kartice + lista; za admina postojeći grafikoni.
- Testovi: brojevi na kartama za poznat skup klijenata.

## Faza B — Klijenti i Korisnici (srednja) — ✅ urađeno

- Stranica klijenta (`clients/[clientId]`) dobija tabove: **Pregled** (današnji sadržaj), **Korisnici** (samo njegovi), **Pretplata** (stanje + akcije dodeli / produži / otkaži / istorija, iste kao u Pretplatama). Tabovi Uplate, Beleške i Aktivnost se dodaju u kasnijim fazama.
- `GET /users` za superadmina vraća i naziv klijenta; stranica Korisnici dobija kolonu Klijent (link na klijenta) i filter po klijentu.
- Spisak klijenata: kolone paket, status pretplate, broj korisnika.

## Faza C — Cene, uplate i dugovi (velika) — ✅ urađeno

- **Cene:** `plans.prices` = mapa meseci → iznos (npr. `{"1": 1500, "12": 15000}`), `currency` = `RSD`. Polje je opciono; paket bez cene radi kao do sada.
- **Uplate** (`payments`): `client_id`, `amount`, `currency`, `status` (`expected` = dug, `received` = primljeno, `canceled`), `due_date` (za dug), `paid_at` (za primljeno), `method` (uplata na račun / kartica / gotovina / ostalo), `note` (slobodan tekst; poziv na broj se ne vodi), `plan_name`, `period_months`, `created_by`, `source` (`manual`).
- **Akcije u portalu:**
  - „Evidentiraj uplatu i produži“: u jednom koraku beleži primljenu uplatu i produžava pretplatu za izabrani broj meseci; iznos se predpopuni iz cene paketa za taj period i može ručno da se promeni (popust / akcija se ne vodi posebno — razlog ide u napomenu).
  - „Zaduži“: pravi očekivanu uplatu sa rokom; kasnije se „Evidentiraj“ pretvara u primljenu.
  - Otkazivanje pogrešnog zapisa (ne briše se, ide u `canceled`).
- **Pregled:** stranica Uplate (filter po klijentu / mesecu / statusu, zbir za izabrani period, kasne uplate istaknute, izvoz CSV) + tab Uplate na stranici klijenta.
- **Dashboard:** kartice prihod ovog meseca / ove godine, ukupno dugovanje, broj kasnih uplata; kasni dugovi ulaze u listu „Treba pažnju“.
- Svaka akcija piše i u istoriju pretplate (`subscription_events`).
- Testovi: iznosi i zbirovi, dug → primljeno, produženje uz uplatu, otkazana uplata se ne računa, samo superadmin.

## Faza D — Uvid i kontrola (srednja) — ✅ urađeno

- **Beleške po klijentu** (`client_notes`, samo se dodaje: tekst, autor, vreme) — tab Beleške.
- Implementacija: `users.last_login_at` / `last_seen_at` (najviše jedan upis na sat), `GET /clients/{id}/activity`, `GET /superadmin/system` (cron upisuje `system_runs`), `GET /audit` (`_audit()`; `_log_subscription_event` ga poziva za sve akcije pretplate/uplata), `announcements` CRUD + isporuka kroz `/auth/me` (`announcements`). Dnevnik beleži samo akcije superadmina (ne i akcije admina klijenta).
- **Poslednja aktivnost:** `users.last_login_at` (pri prijavi) i `last_seen_at` (osvežava se najviše jednom na sat); po klijentu: poslednja prijava, poslednja porudžbina, porudžbine u 30 dana — kolona u spisku klijenata i tab Aktivnost; filter „neaktivni 30+ dana“.
- **Stanje sistema** (`GET /superadmin/system`): kad je poslednji put radio dnevni posao i šta je uradio (cron upisuje `system_runs`), da li je SMTP podešen, Cloudinary, `AUTO_PURGE_ENABLED`, verzija aplikacije. Kartica na dashboardu; upozorenje ako cron nije radio duže od 2 dana.
- **Dnevnik akcija superadmina** (`audit_log`): ko, kad, šta, nad kim (klijent, paket, pretplata, uplata, korisnik, impersonate). Stranica Dnevnik, samo pregled.
- **Obaveštenja klijentima** (`announcements`): poruka sr/en, nivo (info / upozorenje), od–do, svi klijenti ili izabrani. Stiže u `/auth/me`; baner u portalu i mobilnoj (isti način kao baner o pretplati). Stranica Obaveštenja.

## Faza E — Preusmeravanje na korisnika (srednja, osetljiva)

- `POST /superadmin/impersonate/{user_id}` (samo superadmin; cilj admin ili magacin — komercijalisti rade samo u mobilnoj, pa se u portalu ne mogu otvoriti): vraća token sa `imp` (id superadmina), `mode`, rokom **30 min**; važi i za zaključanog klijenta.
- **Režimi:** `view` (podrazumevano; sve što menja podatke vraća 403) i `edit` (traži potvrdu i razlog). U oba režima su zabranjeni: promena lozinke i emaila, upravljanje korisnicima, ponovno preusmeravanje, preusmeravanje na superadmina.
- **Portal:** modal nije izvodljiv (sesija je kolačić iste domene), pa se ulazi u istoj kartici: tvoj token se čuva u posebnom httpOnly kolačiću, a stalna traka „Radite kao X (klijent) — režim — Izlaz“ vraća sesiju. Dugme „Uđi kao“ na korisniku i na tabu Korisnici klijenta.
- **Dnevnik:** početak i kraj preusmeravanja (ko, kao ko, režim, razlog) u `audit_log`.
- Testovi: ne radi za ne-superadmina, `view` blokira izmene, istek, ne ide na superadmina, upis u dnevnik, radi za zaključanog klijenta.
- Mobilna se ne menja.

## Redosled

A → B → C → D → E. Svaka faza je zaokružena i može da se pusti zasebno. A i B ne traže nove podatke u bazi; C uvodi `payments` i `plans.prices`; D uvodi `client_notes`, `audit_log`, `announcements`, `system_runs`; E koristi `audit_log` iz D (zato je poslednja).

## Odlučeno

- Poziv na broj / broj računa se ne evidentira; uplata je samo evidentirana (datum, iznos, način, napomena).
- Kasne uplate: samo isticanje i lista „Treba pažnju“, bez emaila.
- Popust za određeni period (akcija) se ne vodi kao zaseban podatak; iznos se menja ručno uz napomenu.
- Valuta EUR kasnije: polje `currency` već postoji, pa je to proširenje, ne migracija.

---

# Izmena modela naplate: godišnji paket + nalozi po korišćenju

Zamenjuje deo faze C (cena po 1/3/6/12 meseci). Odluke:

- **Godišnji paket** (unapred): jedna cena po paketu (RSD), moduli kao do sada. Plaća se jednom godišnje preko „Uplata i produženje“ (podrazumevano 12 meseci).
- **Nalozi** (po korišćenju, **unazad**): cena po tipu naloga u paketu (admin, magacin, komercijalista). Klijent otvara koliko naloga treba; broj se ne upisuje unapred.
- **Obračun na kraju meseca:** plaća se **najveći broj istovremeno aktivnih naloga po ulozi u tom mesecu**. Nalog otvoren pa obrisan u istom mesecu se naplaćuje; deaktivacija smanjuje račun od sledećeg meseca. Deaktivirani i obrisani nalozi se ne broje u trenutku.
- **Prvi mesec je u ceni paketa:** naplata naloga počinje od meseca posle početka paketa (`seats_billed_from`, može da se promeni po klijentu).
- **Zaduženje** nastaje od 1. u mesecu za prethodni mesec (jednim klikom, prvo pregled), rok plaćanja je **broj dana po klijentu** (`due_days`, podrazumevano 5). Popust po klijentu u procentima (`discount_percent`).
- **Prvi admin** klijenta se broji kao i ostali nalozi.
- **Opcioni limit** naloga po ulozi kod klijenta (podrazumevano bez ograničenja); magacin nalog nije moguć bez modula Magacin (već važi).
- **Neplaćeno** ne zaključava automatski; ulazi u „Treba pažnju“.
- **Admin klijenta** dobija tab **Zaduženja**: korišćenje u tekućem mesecu, procena sledećeg zaduženja i rok, otvoreni računi i istorija, **podaci za uplatu** (tekst koji upisuje superadmin). IPS QR kod kasnije.
- Promena paketa ostaje samo kod superadmina. Automatsko pravljenje zaduženja (cron) kasnije, ako zatreba.

## Faza F1 — Cene naloga, limiti i praćenje korišćenja
- `plans.seat_prices` (`admin` / `warehouse` / `operator`, RSD); u dijalogu paketa jedno polje za godišnju cenu (podaci ostaju u `prices["12"]`) i tri polja za naloge; magacin cena samo ako paket ima modul Magacin.
- `clients.subscription`: `due_days`, `discount_percent`, `seats_billed_from` (mesec `YYYY-MM`), `seat_limits` (po ulozi, prazno = bez ograničenja); podešavaju se pri dodeli paketa i u tabu Pretplata.
- `account_usage` (klijent, mesec → najveći broj aktivnih po ulozi): ažurira se pri pravljenju, aktiviranju i promeni uloge naloga; osnova meseca je broj aktivnih na početku (iz prethodnog obračuna ili trenutnog stanja).
- Limit: pravljenje/aktiviranje naloga preko limita → 403 „Dostignut broj naloga za ovu ulogu“.
- Stranica klijenta (tab Korisnici): „aktivnih / limit“ po ulozi i najveći broj u tekućem mesecu.

## Faza F2 — Obračun naloga
- Zaduženje dobija `kind` (`plan` | `seats` | `other`), `period` (`YYYY-MM`) i `breakdown` (po ulozi: broj, cena, iznos; popust); jedinstveno po (klijent, `seats`, mesec) bez poništenih.
- `GET /billing/seats?month=YYYY-MM`: pregled za sve klijente (broj po ulozi, iznos, već zaduženo / ne obračunava se: razlog). `POST /billing/seats`: pravi zaduženja za izabrane klijente ili sve. Mesec koji nije završen se ne obračunava. Iznos 0 se preskače. Zaključani klijenti se obračunavaju za mesece u kojima su koristili sistem.
- Stranica Uplate: dugme „Obračun naloga“ (izbor meseca, pregled, potvrda) i dugme „Zaduži naloge“ na stranici klijenta; razlaganje iznosa se vidi u zapisu.

## Faza F3 — Tab „Zaduženja“ za admina klijenta
- `GET /billing/me` (samo uloga admin, samo svoj klijent): korišćenje ovog meseca (najveći broj po ulozi), procena iznosa (sa popustom), datum zaduženja i rok plaćanja, otvoreni računi i istorija (bez internih beleški i poništenih zapisa), podaci za uplatu.
- Portal: stavka „Zaduženja“ u meniju admina. Pri pravljenju naloga poruka „Ovaj nalog povećava mesečni račun za X RSD“ uz potvrdu.

## Faza F4 — Podešavanja i podsetnici
- `app_settings`: podaci za uplatu (sr/en tekst) i podrazumevani rok plaćanja; stranica ili tab „Podešavanja“ kod superadmina.
- Dashboard i „Treba pažnju“: „nije obračunato za prošli mesec“ od 1. u mesecu.

## Kasnije
IPS QR kod, automatsko pravljenje zaduženja (cron, `AUTO_CHARGE_ENABLED`), automatska naplata.
