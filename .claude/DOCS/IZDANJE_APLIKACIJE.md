# Izdavanje mobilne aplikacije (APK + OTA)

Postoje dva načina da izmena stigne do telefona. Oba se pokreću jednim klikom na GitHub-u (**Actions**).

| Šta se promenilo | Workflow | Šta korisnik vidi |
|---|---|---|
| Samo JS/TS kod: ekrani, logika, prevodi, slike | **OTA update** | pri sledećem pokretanju „Izmene su spremne → Restartuj" |
| Native deo: nov paket sa native kodom, dozvola, `app.json` plugin, nadogradnja Expo SDK-a | **Release Android** | pri pokretanju „Dostupna je nova verzija → Preuzmi" (novi APK) |
| Backend / admin-web | nijedan, samo push (Vercel) | — |

Ako nisi siguran: probaj **OTA update**. Ako izmena traži novi APK, `runtimeVersion: fingerprint` sprečava da je dobije APK sa kojim nije kompatibilna. Ništa neće pući, izmena samo neće stići dok ne uradiš **Release Android**.

---

## Jednokratno podešavanje

1. **Expo token:** expo.dev → Account settings → **Access tokens** → Create token.
2. **GitHub secret:** repo → Settings → Secrets and variables → **Actions** → New repository secret. Ime `EXPO_TOKEN`, vrednost je token iz koraka 1.
3. **Prvo izdanje preko novog sistema:** Release Android sa verzijom **1.2.0**. Korisnici na 1.1.1 dobiće ponudu za preuzimanje i moraju **jednom ručno** da instaliraju 1.2.0, jer 1.1.1 nema `expo-updates`. Od 1.2.0 nadalje OTA radi.

---

## Release Android (novi APK)

GitHub → **Actions** → **Release Android** → **Run workflow**:
- `version`: nova verzija, na primer `1.3.0`. Mora biti veća od verzije u `backend/public/app/app-update.json`.
- `release_notes`: kratak opis koji korisnici vide u ponudi za update.

Workflow sam (oko 15–25 minuta):
1. upiše verziju u `frontend/app.json`;
2. pokrene `eas build` (profil `apk`) i sačeka ga, pa skine APK;
3. commituje i pushuje verziju, pa napravi **GitHub Release** `v1.3.0` sa fajlom `easy-order.apk`;
4. u `app-update.json` upiše verziju, link, datum i opis, obriše eventualne APK fajlove iz `backend/public/app/` i pushuje. **Vercel zatim sam uradi deploy backenda.**

Ako bilo koji korak do builda padne, **ništa nije pushovano**.

**Linkovi:**
- za konkretnu verziju (koristi ga `app-update.json`): `https://github.com/Jovan-Babic/easy-order/releases/download/v1.3.0/easy-order.apk`;
- stalni link koji uvek vodi na najnoviji APK, za ručno deljenje: `https://github.com/Jovan-Babic/easy-order/releases/latest/download/easy-order.apk`.

Verziju u `app.json` **ne menjaj ručno**, to radi workflow.

---

## OTA update (bez APK-a)

GitHub → **Actions** → **OTA update** → **Run workflow** → `message`: opis izmene.

Instalirane aplikacije pri sledećem pokretanju preuzmu izmenu u pozadini i ponude restart. Ako korisnik izabere „Kasnije", izmena se primeni pri sledećem pokretanju.

⚠️ **Ne pokreći `eas update` sa svog računara.** Bundle preuzima `EXPO_PUBLIC_BACKEND_URL` iz okruženja u kom se pravi. Lokalni `frontend/.env` ima LAN IP za Expo Go, pa bi svim telefonima stigla adresa servera do koje ne mogu da dođu. Workflow uzima produkcioni URL iz `eas.json`.

**Vraćanje loše OTA izmene:** expo.dev → projekat → Updates → izaberi prethodnu grupu izmena → „Republish". Može i komandom `eas update:republish` sa ispravnim okruženjem. Drugi način je da popraviš kod i ponovo pokreneš OTA update.

---

## Zašto ovako

- **GitHub Releases umesto repoa ili Vercela:** fajl je trajan i besplatan, ne ulazi u git istoriju i ne opterećuje Vercel funkciju. EAS link ističe posle ograničenog vremena, pa se koristi samo da ga workflow skine.
- **Link sa verzijom u `app-update.json`:** fajl iza linka ne može da bude druga verzija od one koju JSON prijavljuje. To je bio uzrok beskonačne ponude za update, kad je APK prijavljivao 1.0.0.
- **Verziju postavlja workflow:** zato APK uvek prijavljuje tačnu verziju.
- **`autoIncrement`:** EAS podiže interni broj builda (versionCode), pa Android uvek prihvata novi APK preko starog.
- **`runtimeVersion: fingerprint`:** OTA dobijaju samo APK-ovi sa istim native delom. Expo to računa sam, ne moraš ručno da vodiš računa o kompatibilnosti.

## Moguće prepreke pri prvom pokretanju
- **„Missing EXPO_TOKEN secret":** secret nije dodat ili ima drugo ime.
- **Push odbijen:** ako `main` ima zaštitu grane (branch protection), GitHub Actions ne može da pushuje. Treba dozvoliti izuzetak za Actions ili pushovati kroz PR.
- **`eas update` traži dodatnu opciju** (na primer `--environment`) u novijoj verziji eas-cli: greška u logu to kaže jasno. Potrebna je izmena jedne linije u `ota-update.yml`.
