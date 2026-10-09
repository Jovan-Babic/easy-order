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

# Model naplate: uvođenje + paket + nalozi

Zamenjuje raniji predlog (godišnji paket + obračun naloga po najvećem broju aktivnih). Obrazloženje i poređenje sa konkurencijom: `PREDLOG_NAPLATE.pdf`. Sve se unosi **ručno**, bez automatike; cene definiše superadmin u portalu (primer cena u predlogu je samo početna tačka).

## Odluke

- **Uvođenje (jednokratno):** po klijentu, superadmin upisuje iznos, opis (Standard / Napredna / po dogovoru) i rok; vodi se kao zaduženje (`payments.kind = "setup"`), plaća se unapred. Nije vezano za paket.
- **Mesečni paket:** postojeći `plans` (naziv, moduli, `prices`), proširen uključenim nalozima. Mesečna cena je `prices["1"]`; godišnja uplata unapred (`prices["12"]`, predlog 10 × mesečna) koristi postojeće „Uplata i produženje“.
- **Nalozi:** `plans.included_seats` (`admin` / `warehouse` / `operator`, broj uključenih) i `plans.seat_prices` (RSD mesečno po dodatnom nalogu). Nema merenja korišćenja: dodatni nalozi su **ugovoreni broj** koji superadmin ručno upisuje.
- **Limit** = uključeni + dodatni nalozi po ulozi. Pravljenje, aktiviranje ili promena uloge naloga preko limita → 403 „Dostignut broj naloga za ovu ulogu“. Limit važi i za superadmina; povećava se izmenom ugovorenih dodatnih naloga. Ručno promenjena (viša) vrednost ne briše postojeće naloge.
- **Mesečni iznos klijenta** = cena paketa + zbir (dodatni nalozi × cena naloga) − popust (`discount_percent`, po klijentu, ručno). Volume popust (predlog 10% preko 10 dodatnih naloga) je običan popust koji superadmin upisuje, ne pravilo u kodu.
- Smanjenje broja naloga važi od sledećeg obnavljanja; povećanje odmah (pravilo ugovora, ne kod).
- Magacin nalog bez modula Magacin ostaje nemoguć (već važi). Paket bez magacin modula ignoriše uključene/cenu za magacin.
- Plan bez `included_seats` (stari paketi) = bez limita. Klijent bez paketa = bez limita.
- Neplaćeno ne zaključava automatski (kao do sada); ulazi u „Treba pažnju“.

## Faza G1 — Paketi i limiti (backend)
- `Plan` / `PlanInput`: `included_seats`, `seat_prices` (validacija: ključevi samo tri uloge, ceo broj ≥ 0 / iznos ≥ 0, prazno = bez limita / bez cene).
- `clients.subscription.extra_seats` (po ulozi), `discount_percent` (0–100); upisuje se pri dodeli paketa i u tabu Pretplata (`PUT /subscriptions/{client_id}/seats`), zapis u `subscription_events` i `_audit`.
- `_seat_limit(client, role)`, `_check_seat_limit` pozvan iz pravljenja korisnika (`POST /users`, `POST /clients` za prvog admina), aktivacije i promene uloge. Broje se aktivni nalozi klijenta; superadmin nije deo klijenta.
- `GET /clients/{id}/seats` i `GET /clients/me/seats` (admin): po ulozi `used` / `included` / `extra` / `limit`, mesečni iznos (paket + nalozi − popust) sa razlaganjem.
- Testovi: limit po ulozi, dodatni nalozi podižu limit, aktivacija i promena uloge preko limita, stari paket bez limita, popust, tuđi klijent 404.

## Faza G2 — Zaduženja i uvođenje
- `payments.kind` (`subscription` | `setup` | `seats` | `other`, podrazumevano `subscription`) i `breakdown` (paket, nalozi po ulozi, popust) na zapisu zaduženja.
- `POST /payments` prihvata `kind = "setup"` (iznos, opis, rok); `POST /clients/{id}/charge-month` pravi zaduženje „paket + dodatni nalozi“ za izabrani mesec (pregled pa potvrda; jedinstveno po klijentu i mesecu bez poništenih).
- Dashboard: „uvođenje nenaplaćeno“ i „mesečno zaduženje nije napravljeno“ u „Treba pažnju“.
- Testovi: setup zaduženje i uplata, mesečno zaduženje sa razlaganjem, duplikat 409, tuđi klijent.

## Faza G3 — Portal
- Dijalog paketa: polja uključenih naloga i cena po ulozi (magacin samo uz modul Magacin).
- Tab Pretplata na klijentu: dodatni nalozi, popust, mesečni iznos sa razlaganjem; tab Uplate: dugmad „Uvođenje“ i „Zaduži mesec“.
- Tab Korisnici: „iskorišćeno / limit“ po ulozi; pravljenje naloga preko limita ima jasnu poruku.
- Admin klijenta: pregled „Nalozi i paket“ (iskorišćeno / limit, mesečni iznos) bez internih beleški.
- i18n (sr, en); mobilna aplikacija samo prikazuje grešku limita.

## Faza G4 — Dokumentacija
- `CLAUDE.md`, ovaj plan i `PREDLOG_NAPLATE.pdf` (verzija za tim) prate odlučene cene kad se usvoje.

## Kasnije
IPS QR kod, automatsko pravljenje mesečnih zaduženja (cron), cena po zahtevu za velike klijente, automatska naplata.
