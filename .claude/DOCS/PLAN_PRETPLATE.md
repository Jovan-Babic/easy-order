# Plan: pretplate (paketi, rok važenja, zaključavanje, brisanje)

Nadovezuje se na `PLAN_MODULI.md`. Cilj: superadmin ručno vodi evidenciju klijenata — koji paket imaju, do kada važi, šta se desi kad istekne — a kasnije automatska naplata samo piše iste podatke.

## Odluke

- Samo **klijenti** (kompanije) imaju pretplatu. Korisnici koje klijent pravi ništa ne nasleđuju posebno: zaključavanje i moduli rade preko njihovog klijenta.
- Posle isteka **zaključava se ceo nalog** (ne samo moduli).
- Brisanje posle 90 dana zaključanosti obuhvata samo podatke opcionih modula (zalihe). Porudžbine, kupci, artikli i korisnici se ne brišu. Brisanje celog klijenta nikad nije automatsko.
- Bez probnog perioda: probni nalog se napravi ručno i ne naplaćuje se.
- Klijent **bez pretplate** nema rok (stariji i interni nalozi) — niko se ne zaključava pri puštanju ove izmene.

## Podaci

- `plans`: `name`, `description`, `modules`, `active`. Pravi ih superadmin u portalu (tab Paketi). Neaktivan paket ne može da se dodeli; paket u upotrebi ne može da se obriše.
- `clients.subscription`: `plan_id`, `plan_name`, `starts_at`, `ends_at` (poslednji dan važenja, uključivo), `note`, `source` (`manual`; kasnije npr. provajder naplate), `canceled_at`, `purge_paused`, `purged_at`, `reminder_for`, `purge_warned_for`.
- `clients.modules` ostaje ono što backend čita na svaki zahtev; dodela paketa ga postavlja na module iz paketa. Za klijenta na paketu `PUT /clients` odbija izmenu `modules` (menja se paket). Izmena paketa ne dira klijente osim uz `apply_to_clients`.
- `subscription_events` (samo se dodaje): `assigned`, `extended`, `canceled`, `purge_paused`, `purge_resumed`, `purged` — ko, kad, napomena, izvor (`manual` / `cron`).

## Životni ciklus (`subscription_state`)

| Stanje | Kada | Šta radi |
|---|---|---|
| `active` | do `ends_at` | sve radi; poslednjih 14 dana baner + email adminu |
| `grace` | 14 dana posle `ends_at` | sve radi, baner „istekla, zaključava se …“ |
| `locked` | posle grejsa, ili odmah posle otkazivanja | login 403 „Subscription expired“, tokeni 401; superadmin radi normalno |
| brisanje | `locked_since` + 90 dana | cron briše podatke zaliha (vidi dole) |

Produženje (`extend`) ili nova dodela (`assign`) odmah otključava i poništava zakazano brisanje. Otkazivanje zaključava odmah, bez grejsa.

## Brisanje podataka

Dnevni posao: `GET /api/internal/cron/subscriptions` (Vercel Cron, `backend/vercel.json`, 03:00 UTC), zaštićen sa `Authorization: Bearer $CRON_SECRET` (bez `CRON_SECRET` endpoint je isključen, 503).
- Šalje email adminima klijenta: 14 dana pre isteka i 14 dana pre brisanja (jednom po roku).
- Briše (`_purge_module_data`): `stock_movements`, `stock_batches`, `stock_qty` na artiklima, `track_expiry` → false.
- **Briše se samo ako je `AUTO_PURGE_ENABLED=true`** i nije `dry_run`; inače samo javlja šta bi obrisao (`would_purge`). Podrazumevano isključeno.
- Superadmin može da zaustavi brisanje po klijentu, i da pre toga izveze podatke (`GET /subscriptions/{id}/export`, JSON).

Podešavanja (env, backend): `CRON_SECRET`, `AUTO_PURGE_ENABLED` (default `false`), `SUBSCRIPTION_GRACE_DAYS` (14), `SUBSCRIPTION_PURGE_AFTER_DAYS` (90), `SUBSCRIPTION_REMINDER_DAYS` (14).

## Portal (samo superadmin)

Sekcija **Pretplate**: tab Pretplate (klijent, paket, status, važi do, preostalo dana, moduli; akcije dodeli/promeni paket, produži, otkaži, istorija sa zaustavljanjem brisanja i izvozom) i tab Paketi. Forma novog klijenta ima izbor paketa i datuma; za klijenta na paketu forma ne nudi module. Admin klijenta vidi baner u grejsu i poslednjih 14 dana.

## Mobilna

Isti baner (`src/components/SubscriptionBanner.tsx`, u `app/(tabs)/_layout.tsx`) za sve uloge klijenta; uzima status bara od `user.subscription`, pa ekrani ispod ne dodaju gornji inset drugi put. `AuthContext` ponovo čita `/auth/me` kad se aplikacija vrati u prvi plan, pa se broj dana i moduli osvežavaju i bez ponovnog pokretanja. Zaključan nalog vidi poruku pri prijavi. Samo JavaScript: OTA, bez novog APK-a.

## Nije urađeno

- Automatska naplata (kasnije piše iste `subscription_events` sa drugim `source`).
- Ograničenja (broj korisnika, porudžbina) — `limits` uz paket kad se dogovore.
- Vercel Cron radi samo u produkcionom deploy-u; `CRON_SECRET` treba postaviti u Vercel okruženju backenda.
