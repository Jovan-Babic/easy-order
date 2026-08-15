# Plan za uloge i RBAC model u Easy Order

## 1. Trenutno stanje u projektu

Ovo je plan koji uzima u obzir ono što je već implementirano, da ne bi ponavljana ista logika u narednim fazama.

### Već urađeno
- `backend/server.py` ima osnovni multi-tenant model:
  - `Role.SUPERADMIN`
  - `Role.ADMIN`
  - `Role.OPERATOR`
- Postoji `client_id` na poslovnim podacima (`customers`, `products`, `orders`, `users`).
- Postoji zaštita pristupa po tenant-u:
  - korisnik ne može da vidi ili menja podatke drugog klijenta
  - `resolve_write_client_id()` i `_scope_query()` usmeravaju zapis i pregled na odgovarajući `client_id`
- Superadmin može da kreira klijente i admin korisnike.
- Admin može da kreira operatore za svoj klijent, ali ne može da dodeljuje više privilegije od `operator`.
- Admin-web portal u `admin-web/components/Sidebar.tsx` već ima osnovnu podešenu navigaciju za `superadmin` i `admin`.
- Postoji inicijalni sistem autentikacije i `auth/me` endpoint.

### Već postoji, ali je potrebno proširiti
- Uloga `operator` postoji, ali još nije razrađen kao posebna poslovna uloga za magacin/warehouse workflow.
- Admin-web portal trenutno ne sadrži posebnu logiku za `magacin` ulogu i status workflow.
- Nema još definisan audit/history statusa porudžbine.
- Nema kompletna separation između “kreiranje porudžbine” i “obrada statusa”.

---

## 2. Ciljani model uloga

Predloženi cilj je sledeći:

### Superadmin
- globalni administrator celog sistema
- kreira klijente
- kreira admine za klijente
- ima pregled celog sistema
- ne mora da radi svakodnevno poslovanje
- ne mora da sledi magacin workflow u svakodnevnom radu

### Admin
- vlasnik jednog klijenta / jedne aplikacijske grupe
- dodaje proizvode
- dodaje klijente unutar svog klijenta/systema
- dodaje korisnike (operator, komercijalista, magacin)
- pregleda sve podatke vezane za njegov klijent
- može da menja status ako je potrebno, ali ne treba da bude primarni entitet za to

### Operator
- kreira porudžbine
- pregled porudžbina za klijent
- opcionalno: samo svoje porudžbine ili sve za klijent, po odabiru
- ne menja status porudžbine

### Magacin
- pregled porudžbina koje je operator kreirao
- menja status porudžbine (`u obradi`, `završeno`, `odbijeno`, itd.)
- odgovoran za operativni tok izvršenja porudžbine
- može da koristi admin-web portal za svoj rad

> Ključna pravila: `Admin`, `Operator` i `Magacin` su u okviru jednog klijenta, a ne globalno nezavisne uloge.

---

## 3. Predložena RBAC struktura

Najbezbedniji aproach je da se modelira preko jedne uloge i jedne tenant veze:

- `users`
  - `id`
  - `email`
  - `name`
  - `role`
  - `client_id`
  - `active`
  - `created_at`

- `clients`
  - `id`
  - `name`
  - `active`
  - `created_at`

- `orders`
  - `id`
  - `client_id`
  - `status`
  - `created_by_user_id`
  - `created_at`

Dodatno, ako se želi bolja kontrola, može da se uvede i tabela `user_client_roles`, ali za sada to nije obavezno ako se sve radi kroz `users.role + users.client_id`.

---

## 4. Pravila pristupa

### 4.1 Globalno
- `superadmin` ima pristup svim client-ovima.
- `admin` ima pristup samo svom `client_id`.
- `operator` i `magacin` imaju pristup samo svom `client_id`.

### 4.2 Izmena i kreiranje
- `admin` sme da kreira i menja korisnike unutar svog klijenta.
- `admin` sme da dodeli `operator` i `magacin` uloge za svoj klijent.
- `admin` ne sme da dodeli `superadmin` ili drugi globalni role.
- `operator` ne sme da kreira korisnike.
- `magacin` ne sme da kreira porudžbine.
- `magacin` ne sme da menja proizvode ili klijente.

### 4.3 Status workflow
- `operator` može da kreira porudžbine i da ih pregleda.
- `magacin` menja status.
- `admin` može da vidi i eventualno override-a status, ali mora da bude jasno da je primarno magacin odgovoran za to.

---

## 5. Statusi porudžbina

Preporučeni workflow:

- `new`
- `pending`
- `in_processing`
- `completed`
- `rejected`
- `canceled`

Ako želite jednostavniji model, onda:

- `nova`
- `u obradi`
- `završena`
- `odbijena`

### Preporuka
Koristiti malo više detalja nego previše jednostavan model, jer u B2B poslovanju magacin često radi između više stanja.

---

## 6. History promena statusa

Ovo je dobra i preporučena funkcionalnost.

### Predlog tabele
- `order_status_history`
  - `id`
  - `order_id`
  - `previous_status`
  - `new_status`
  - `changed_by_user_id`
  - `changed_by_role`
  - `changed_at`
  - `note`

### Prednost
- audit log
- pregled ko i kada je promenio status
- lakše razrešenje sporova / pitanja o porudžbini

---

## 7. Admin-web portal: šta je potrebno dodati

### Za sada je urađeno
- navigacija za `superadmin` i `admin`
- osnovni dashboard i CRUD moduli za klijente, korisnike, proizvode, porudžbine

### Nedostaje za magacin domen
- posebna sekcija / modul "Magacin"
- filter po statusu porudžbine
- prikaz samo porudžbina za current `client_id`
- dugme za promenu statusa
- prikaz history statusa
- rola `warehouse` / `magacin` u frontend logici

### Preporuka
Ne treba praviti potpuno identičan admin dashboard za magacin i admin. Dovoljno je da magacin dobije manji, fokusiran modul:
- pregled porudžbina
- filtriranje po statusu
- akcije za status update
- pregled istorije promene

---

## 8. Faze razvoja

### Faza 1 — RBAC proširenje
- dodati `warehouse`/`magacin` ulogu u backend enum
- omogućiti admin-u da kreira warehouse naloge za svoj klient
- proširiti backend permission kontrolu

### Faza 2 — workflow porudžbina
- definisati statusni model
- dozvoliti operatoru kreiranje porudžbina
- dozvoliti magacinu promenu statusa
- blokirati operatora od menjanja statusa

### Faza 3 — audit/history
- dodati `order_status_history`
- čuvati `changed_by_user_id`, `role`, `timestamp`, `note`

### Faza 4 — admin-web portal
- uvesti `magacin` u sidebar i permission check
- dodati modul za pregled i status update
- dodati konkretne UI akcije i filtriranje

### Faza 5 — refinements
- opcionalno: notifikacije za status promenu
- opcionalno: oznake po klijentu i po korisniku
- opcionalno: ograničeno prikazivanje samo porudžbina vezanih za konkretni operator

---

## 9. Predlog finalnog pristupa

Najpravilan model za ovaj projekat je:

- `superadmin` = globalni kontroler sistema
- `admin` = vlasnik klijenta i upravitelj svog sistema
- `operator` = kreira porudžbine
- `magacin` = vodi obradu i status

To znači:
- `superadmin` ne mora da radi u magacin modulu
- `admin` ne mora da bude finansijski/warehouse korisnik
- `magacin` treba da bude poseban role, ali unutar istog `client_id`
- `client_id` ostaje glavni zid za odvajanje tenant-a

---

## 10. Zaključak

Ovaj plan ne ponavlja osnovni multi-tenant model koji je već u projektu, nego fokusira na sledeće:
- proširenje uloga sa `magacin`
- status workflow za porudžbine
- audit/history promene statusa
- admin-web portal sa posebnim magacin modu

To je sledeći logičan korak za prelazak iz osnovnog `superadmin/admin/operator` modela u pravi poslovni workflow B2B aplikacije.
