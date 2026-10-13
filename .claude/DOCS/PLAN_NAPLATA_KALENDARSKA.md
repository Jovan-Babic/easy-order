# Plan: kalendarska naplata, saldo klijenta, nacrti zaduženja i emailovi

Zamenjuje ručno „Zaduži mesec“ i trenutni model u kome zaduženje vidi samo superadmin. Sve odluke ispod su dogovorene u razgovoru; plan se ne menja bez novog dogovora.

## Odluke

### Ciklus
- Kalendarski mesec, prepaid. **25.** sistem pravi **nacrte** zaduženja za sledeći period, rok plaćanja je **1.**, blokada posle **5.** (dani su u podešavanjima).
- Nacrte vidi samo superadmin dok ih ne odobri (pojedinačno ili sve). Tek odobreno zaduženje vidi klijent. Bez odobrenja nema zaduženja ni blokade.
- **Prvi delimičan mesec je besplatan** (zaduženje 0 din sa napomenom „Besplatan mesec“). Da li je i sledeći mesec besplatan, superadmin odlučuje pri odobravanju (iznos 0 + napomena).
- **Godišnji klijenti** ulaze u isti nacrt kad im ističe godišnja pretplata (godišnja cena paketa). Dodatni nalozi u godišnjem nacrtu su **12 × cena naloga** (bez popusta, osim ručnog). Nalog dodat usred godine: u prvom sledećem nacrtu stavka „Dodatni nalog do kraja godišnjeg perioda: N meseci × cena“ (celi meseci od sledećeg 1.); smanjenje bez povraćaja, važi od obnove.
- Promene paketa, naloga i popusta važe od sledećeg zaduženja.
- **Postojeći klijenti**: istek se poravna na kraj meseca (dani do kraja meseca besplatno), od sledećeg 1. su u ciklusu.
- Odustajanje: kao danas (nema novih nacrta; posle kraja plaćenog perioda zaključavanje; posle 90 dana briše se samo stanje magacina).

### Saldo (kartica klijenta)
- Zaduženja povećavaju dug, uplate ga smanjuju. Uplata se unosi kao iznos za klijenta i zatvara najstarija zaduženja (FIFO); ne mora se vezati za jedno zaduženje.
- **Preplata** ostaje kao kredit i umanjuje sledeće zaduženje (nema povraćaja).
- **Delimična uplata**: klijent radi dalje, ostatak se prenosi.
- Na zaduženju i u emailu: iznos za period + linija „Dug iz prethodnog perioda“ / „Preplata iz prethodnog perioda“ = **Za uplatu** (iznos za period se ne duplira u saldu - „Za uplatu“ je saldo posle tog zaduženja).
- Iznosi na dve decimale, RSD.

### Blokada
- Posle 5. u mesecu klijent je blokiran ako: **za tekući period nije uplaćeno ništa**, ili je **dug ≥ mesečnog iznosa tog klijenta** (paket + dodatni nalozi − popust).
- Posle **2 uzastopna meseca sa dugom** klijent ulazi u „Treba pažnju“; blokadu tada uključuje superadmin ručno (dugme). Ručna blokada i deblokada su uvek moguće.
- Izuzetak po klijentu: „Produži rok do …“ (npr. platio, izvod nije stigao).
- Uplata koja otklanja uslov odmah skida blokadu.
- **Blokiran klijent**: admin se prijavljuje, ali vidi samo stranicu zaduženja i podatke za uplatu; komercijalisti i magacin vide samo poruku o blokadi.
- Baner od 1. („Uplata nije evidentirana, nalog se blokira 6.“) obavezan u portalu i mobilnoj; zaduženja vidi samo admin klijenta, ostali samo baner.

### Predračun
- Svako odobreno zaduženje dobija **broj predračuna** `PR-GGGG-NNNN` (brojač po godini). Nije fiskalni račun.
- PDF predračuna je kasnija faza; podaci izdavaoca su u podešavanjima već sada (svi neobavezni).

### Podešavanja (stranica kod superadmina; vrednosti iz baze, rezerva env pa kod)
- Naplata: dan nacrta (25), dan roka (1), poslednji dan pre blokade (5), prvi delimičan mesec besplatan (da/ne), koliko dana pre isteka godišnje pretplate ide podsetnik (umesto env `SUBSCRIPTION_REMINDER_DAYS`), posle koliko dana zaključavanja se briše stanje magacina (umesto env `SUBSCRIPTION_PURGE_AFTER_DAYS`), podrazumevani dani upozorenja za rok trajanja (sada 5/15/30 u kodu).
- Podaci za uplatu (sr/en tekst), IPS: tekući račun (18 cifara, provera kontrolnog broja), ime primaoca, šifra plaćanja, svrha, poziv na broj = broj predračuna (da/ne).
- Podaci izdavaoca za predračun (ime, adresa, PIB, račun, napomena).
- Email: pošiljalac za naplatu (adresa, ime), reply-to, dvojezični emailovi (da/ne; ne = samo srpski).
- U env ostaje: tajne i pristupi (`JWT_SECRET`, SMTP nalog, Cloudinary, `CRON_SECRET`), adrese, ograničenja zaštite, veličina slike, `AUTO_PURGE_ENABLED`, valuta RSD.
- „Stanje sistema“ ostaje kartica na dashboardu (samo prikaz).

### Emailovi (preko istog SMTP naloga - Brevo; pošiljalac za naplatu iz podešavanja, rezerva `SMTP_FROM`)
- **Superadminima** (svim aktivnim): kad se 25. naprave nacrti - broj, ukupan iznos, link na odobravanje.
- **Klijentu** (aktivni admini + opciona adresa računovodstva po klijentu; ista adresa = jedan email):
  1. odobreno zaduženje: iznos, razlaganje, rok, podaci za uplatu, **IPS QR** (slika u prilogu prikazana u telu poruke);
  2. podsetnik 1. ako nije plaćeno;
  3. upozorenje 4. pred blokadu;
  4. blokada 6.;
  5. potvrda uplate - **opciono**, bira se pri evidentiranju;
  6. ističe godišnja pretplata - **obavezno, samo za godišnje** klijente.
- Po klijentu: „bez emailova za naplatu“ (menja se i pri evidentiranju uplate); baner ostaje uvek.
- Tekstovi fiksni u kodu (sr / en, prema prekidaču). Bez SMTP-a emailovi se preskaču, baneri rade, „Stanje sistema“ to pokazuje.
- Svaki email jednom po zaduženju i događaju (oznake na zaduženju), pa ponovljeni cron ne šalje duplo.

## Model (izmene u odnosu na sadašnje stanje)
- `payments.status` dobija `draft` (nacrt: ne broji se u dug, klijent ga ne vidi). Odobrenje: `draft → expected`, `approved_at`, `approved_by`, broj predračuna. Postojeći `expected`/`received`/`canceled` ostaju; `received` više ne mora da pokazuje na jedno zaduženje.
- Zaduženje: `period_start`, `period_end`, `cycle` (`monthly`/`annual`), `lines` (paket, nalozi, proporcionalni nalozi, popust, ručna izmena, besplatan mesec), `notified` (izdato, podsetnik, upozorenje, blokada).
- `clients.subscription`: `billing_cycle` (`monthly`/`annual`), `billing_emails` (da/ne), `due_extension_until`, `manual_block`, `extra_seats_billed` (po ulozi: koliko je dodatnih naloga plaćeno do isteka godišnjeg perioda). `clients.accounting_email`.
- `_client_balance(client_id)`: dug, kredit, otvorena zaduženja sa preostalim iznosom (FIFO).
- `subscription_state`: kalendarski istek (kraj plaćenog meseca/perioda), odloženi rok do dana blokade u sledećem mesecu, plus uslovi blokade iznad (dug ≥ mesečni iznos, ručna blokada, produžen rok). Stanje `locked` ostaje isto ime; dodaje se razlog (`reason`).
- `app_settings` (jedan dokument) i helper `setting(key)` sa rezervom env → kod.
- Istek se produžava kad uplata pokrije bar deo zaduženja za taj period (do `period_end`).
- `month_not_charged` i ručni „Zaduži mesec“ se zamenjuju nacrtima (stara zaduženja ostaju u istoriji).

## Faze

### N1 — Podešavanja sistema (urađeno)
- `app_settings`, `GET`/`PUT /settings` (superadmin, validacija: dani 1-28, IPS račun mod 97, email adrese), `setting()` sa rezervom env → kod; zamena konstanti/env iz liste iznad.
- Portal: stranica „Podešavanja“ (tabovi Naplata / Podaci za uplatu / Izdavalac / Email), meni superadmina.
- Testovi: podrazumevane vrednosti, rezerva env, validacija, samo superadmin, izmena utiče na obračun.

### N2 — Kalendarski ciklus, saldo i nacrti (backend) (urađeno)
- Odstupanja od plana pri implementaciji:
  - Automatska migracija (odluka korisnika, da ne ostanu dva modela): pri pokretanju `_migrate_calendar_billing` prebacuje sve klijente sa paketom bez `billing_cycle` na mesečnu naplatu (godišnju ako paket ima samo cenu za 12 meseci); istek se pomera na kraj svog meseca, niko se ne otključava niti skraćuje, bez besplatnog meseca; ponovno pokretanje ne menja ništa. Novi klijenti i dodela paketa idu odmah na kalendarsku naplatu (prvi započeti mesec besplatan uz `first_month_free`). Uklonjeni su „Uplata i produženje“ (`POST /subscriptions/{id}/pay`) i „Zaduži mesec“ (`/clients/{id}/charge-month`) i podsetnik `month_not_charged`; ručno zaduženje/uplata na stranici Uplate ulazi u saldo. `POST /billing/clients/{id}/enroll` sada samo menja ciklus.
  - U saldo ulaze samo novi zapisi (`ledger: true`: odobreni nacrti i uplate preko `POST /billing/payments`); stara ručna zaduženja i „Uplata i produženje“ rade kao pre i ne ulaze u saldo (njihov saldo bi bio pogrešan, npr. uplata bez zaduženja bi izgledala kao preplata).
  - Blokada zbog duga računa samo dug kome je rok prošao (inače bi zaduženje za sledeći mesec odmah blokiralo klijenta).
  - Blokada zbog duga i ručna blokada ne vode u brisanje podataka (brisanje ostaje vezano za istek/otkaz).
  - `POST /billing/drafts/generate` (superadmin, opciono `month`) pravi nacrte odmah, bez čekanja dana nacrta; cron ih pravi od `draft_day`.
- `billing_cycle`, poravnanje postojećih klijenata (jednokratna migracija pri pokretanju: istek na kraj meseca), prvi mesec besplatan pri dodeli paketa.
- Saldo i FIFO raspodela uplata; uplata bez vezivanja za zaduženje; kredit.
- Cron (postojeći dnevni): na dan nacrta pravi nacrte za mesečne i godišnje kojima ističe period (linije, dug/kredit, proporcionalni nalozi za godišnje); jednom po klijentu i periodu.
- `GET /billing/drafts`, `PUT /billing/drafts/{id}` (iznos, napomena, besplatno), `POST /billing/drafts/approve` (izabrani ili svi), broj predračuna, audit.
- Blokada: uslovi, `due_extension_until`, ručna blokada/deblokada (`POST /subscriptions/{id}/block`, `/unblock`, `/extend-due`), uplata skida blokadu.
- „Treba pažnju“: nacrti čekaju odobrenje, 2 uzastopna meseca sa dugom, blokiran zbog duga.
- Testovi: obračun mesečnog i godišnjeg nacrta, prvi mesec 0, proporcionalni nalog, dug i preplata u sledećem nacrtu, FIFO, delimična uplata (bez blokade), dug ≥ mesečnog (blokada), ništa uplaćeno posle 5. (blokada), produžen rok, ručna blokada, uplata skida blokadu, duplikat nacrta, tuđi klijent.

### N3 — Klijent vidi zaduženja i blokadu (urađeno)
- Odstupanja: blokiran admin sme da se prijavi samo kod klijenata na kalendarskoj naplati (stari model zaključavanja ostaje isti); na ostalim putanjama dobija 403 „Subscription blocked“ (ne 401, da ga aplikacija ne odjavi). IPS QR je jedan, za ukupan iznos „Za uplatu“, sa pozivom na broj iz najstarijeg otvorenog predračuna (model 97: `97` + kontrolni broj + cifre broja predračuna). Mobilna za blokiranog admina prikazuje ekran sa iznosom i uputom na portal (QR i detalji su na portalu).
- `GET /billing/me` (samo admin klijenta): otvorena zaduženja sa linijama i brojem predračuna, saldo „Za uplatu“, rok, istorija, podaci za uplatu, procena sledećeg meseca (jasno označena); `GET /billing/me/charges/{id}/qr.png` (IPS QR).
- Blokiran klijent: admin dobija pristup samo `/auth/me`, `/auth/logout`, `/billing/me*`; ostali 401/403 sa porukom o blokadi.
- `/auth/me` dobija `billing` (nema duga / rok / kasni / blokada od, za baner).
- Portal: stranica „Zaduženja“ za admina (umesto procene na „Nalozi i paket“, koja ostaje kao procena), baner u celom portalu; mobilna: baner za sve uloge, ekran blokade za komercijaliste/magacin (admin: poruka da plati preko portala ili prikaz zaduženja).
- IPS QR: biblioteka za QR u `requirements.txt`; sadržaj po NBS standardu (provera formata pri implementaciji).
- Testovi: šta vidi admin, a šta ostali; blokiran admin vidi samo zaduženja; QR za odobreno zaduženje; nacrt se ne vidi.

### N4 — Emailovi
- Slanje HTML + tekst + slika u prilogu (QR), pošiljalac i reply-to iz podešavanja, primaoci (admini + računovodstvo, bez duplih), dvojezično ili samo srpski, „bez emailova za naplatu“ po klijentu.
- Događaji: nacrti napravljeni (superadmini), odobreno (klijent), 1. podsetnik, 4. upozorenje, 6. blokada, potvrda uplate (opciono), godišnji istek (samo godišnji); oznake da se ne šalje dvaput.
- Portal: adresa računovodstva i „bez emailova“ na klijentu; pri evidentiranju uplate „pošalji potvrdu“ i „bez emailova“.
- Testovi (bez SMTP-a u CI): ko bi dobio email (primaoci, duplikat), oznake slanja, preskakanje kad je isključeno.

### N5 — Portal superadmina za naplatu (urađeno)
- Stranica „Nacrti zaduženja“ (`/billing-drafts`): napravi sada, izmena iznosa/napomene, besplatan mesec, odbaci, odobri izabrane/sve. Tab „Naplata“ na klijentu: prebacivanje na kalendarsku naplatu, saldo/preplata/mesečni iznos/istek, zaduženja sa stavkama, uplate, evidentiranje uplate, produži rok, blokada/deblokada, pregled IPS QR. Za klijente na kalendarskoj naplati su sakriveni „Zaduži mesec“ i „Uplata i produženje“ (ostaju za ostale klijente).
- Mobilna: adminu se jednom po prijavi prikaže poruka sa iznosom i rokom i da su podaci za uplatu i QR na portalu.
- Stranica „Nacrti“ (pregled, izmena iznosa/napomene, besplatan mesec, odobri izabrane/sve), saldo i kartica na stranici klijenta, evidentiranje uplate bez izbora zaduženja (prikaz kako će se rasporediti), dugmad blokada/deblokada/produži rok, uklanjanje ručnog „Zaduži mesec“.
- i18n sr/en, `tsc`, `next build`.

### Kasnije
- PDF predračuna (podaci izdavaoca već postoje), uređivanje tekstova emailova, automatsko odobravanje, plaćanje karticom.

## Redosled
N1 → N2 → N3 → N4 → N5 (N5 može paralelno sa N3/N4 posle N2). Svaka faza ide sa testovima; pre spajanja stari tok („Zaduži mesec“, „Uplata i produženje“) mora da radi dok se ne zameni.
