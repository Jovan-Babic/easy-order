# Alati za slike ekrana u uputstvima

Slike se prave iz web verzije mobilne aplikacije (Expo web) nad probnom bazom u memoriji, sa izmišljenim podacima. **Nikad nad pravom bazom.**

1. Backend sa probnom bazom (bez SMTP-a), kao za testove (`.claude/CLAUDE.md`, Backend):
   `SEED_DEMO_DATA=true`, `MONGO_URL`/`DB_NAME` na probnu bazu, `uvicorn server:app --port 8000`.
2. Web build aplikacije: `cd frontend && EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 npx expo export --platform web --output-dir <dist>`.
3. Slike artikala i server: `python3 make_images.py <img>`, pa `python3 serve.py <dist> <img>` (port 8099, i aplikacija i `/img/*`).
4. Probni podaci: `SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... python3 seed.py` (superadmin probnog backenda, vidi `backend/server.py`; u repou nema nijedne lozinke: nalozi iz primera dobijaju nasumičnu lozinku koja se upisuje u `seed.json`) (firma „Veleprodaja Morava“, komercijalista `marko@morava-primer.rs`, kupci, artikli, porudžbine u svim statusima; piše `seed.json`).
5. Snimanje (Playwright; putanja do Playwright-a je u `lib.js`). Svaka grupa slika traži **svež backend + `seed.py`**, jer snimanje menja podatke:
   - komercijalista: `node capture_operator.js raw/`, pa odmah `node capture_operator_fokus.js raw2/` (roba u fokusu i „Moj učinak“; sama pravi fokus, ciljeve i porudžbine),
   - admin: `python3 seed.py`, pa `python3 seed_admin.py` (paket, pretplata, jedno zaduženje), portal na :3100, `node capture_admin.js raw/` (portal; `ONLY=korak,korak` snima samo neke), pa `node capture_admin_app.js raw2/` (admin kartica u aplikaciji),
   - magacin (telefon): `node capture_magacin.js raw/`,
   - magacin (portal na računaru, odmah posle prethodnog, na istom stanju): pokrenuti portal (`BACKEND_URL=http://localhost:8000 JWT_SECRET=<isti kao backend> npx next dev -p 3100`), pa `node capture_magacin_portal.js raw/` (`ONLY=p4` snima samo stranicu Stanje).
6. Obrada: `python3 finalize.py raw ../slike/<uloga>`. Slike portala (1920 px) pre toga smanjiti na ~1440 px širine.
7. PDF za pregled (nije u repou): `python3 to_html.py ../komercijalista.md out.pdf` napravi `out.html`, `node print.js out.html out.pdf`.

`lib.js`: `mark()` crta narandžasti okvir sa brojem oko elementa (po `testID`, tekstu ili CSS-u), `union()` uokviruje više elemenata zajedno, `shot()` snima (uz `clip` za isečak).
Seed se pokreće na sveže pokrenut backend (baza u memoriji), inače se istorija puni duplim porudžbinama.

**Uputstva u aplikacijama:** backend servira kopiju iz `backend/public/guides`. Posle svake izmene uputstva ili slika pokrenuti `python3 alati/publish_guides.py` (iz `docs/uputstva`) i commit-ovati kopiju; backend test `test_published_copy_matches_the_docs` pada ako se razlikuju.
