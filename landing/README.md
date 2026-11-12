# Easy Order – landing (javni sajt)

Next.js 16 + Tailwind, ista tehnologija kao `admin-web`. Jedna stranica, srpski na `/`, engleski na `/en`:
proizvod, moduli, cenovnik, uvođenje, česta pitanja i kontakt sa formom.

## Odakle dolaze podaci

Cenovnik i kontakt se čitaju sa backenda (server-side, bez prijave), pa se sajt ne menja kad se promene cene:

| Na sajtu | Endpoint | Gde se menja |
| --- | --- | --- |
| Paketi | `GET /api/public/pricing` → `plans` | Portal → Pretplate → paket, polje „Prikaži na sajtu“ (samo aktivni) |
| Dodatni nalozi i dodaci | `GET /api/public/pricing` → `seat_prices`, `module_prices` | Portal → Cenovnik |
| „Prvi mesec besplatan“ | `GET /api/public/pricing` → `first_month_free` | Portal → Podešavanja → Naplata |
| Telefon, email, adresa | `GET /api/public/contact` | Portal → Podešavanja → Sajt |
| Kontakt forma | `POST /api/contact` (ovaj sajt) → `POST /api/public/contact` | Upiti: Portal → Upiti sa sajta |
| Zaštita forme | `GET /api/challenge` (ovaj sajt) → `GET /api/public/challenge` | Nevidljiva provera (proof of work), bez naloga i ključeva |

Stranica je statička i osvežava se u pozadini najviše jednom u minuti (`revalidate = 60`), pa se izmena na
portalu vidi na sajtu u roku od oko minut. Ako backend ne odgovara, sajt umesto cena prikazuje „Pišite nam za ponudu“.

Kontakt forma ima nevidljivu zaštitu od spama: kad posetilac počne da popunjava formu, pregledač u pozadini reši
mali računski zadatak sa backenda (ALTCHA princip, `lib/captcha.ts`, oko sekund), bez spoljnog servisa i kolačića.
Uz to: skriveno polje za botove i limit od 3 poruke na sat po pošiljaocu i 30 ukupno.

Tekstovi sajta su u `lib/i18n.ts` (sr i en). Slike ekrana u `public/screens/` su čisti snimci (bez oznaka iz
uputstava), prave se skriptom `docs/uputstva/alati/capture_landing.js` (uputstvo u `docs/uputstva/alati/README.md`).

## Pokretanje

```powershell
cd landing
npm install
copy env.example .env.local     # BACKEND_URL, SITE_URL, NEXT_PUBLIC_PORTAL_URL
npm run dev                    # http://localhost:3001
npx tsc --noEmit
```

Na Vercel-u: poseban projekat sa root direktorijumom `landing/` i promenljivama iz `env.example`.
