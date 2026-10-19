# Alati za slike ekrana u uputstvima

Slike se prave iz web verzije mobilne aplikacije (Expo web) nad probnom bazom u memoriji, sa izmišljenim podacima. **Nikad nad pravom bazom.**

1. Backend sa probnom bazom (bez SMTP-a), kao za testove (`.claude/CLAUDE.md`, Backend):
   `SEED_DEMO_DATA=true`, `MONGO_URL`/`DB_NAME` na probnu bazu, `uvicorn server:app --port 8000`.
2. Web build aplikacije: `cd frontend && EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 npx expo export --platform web --output-dir <dist>`.
3. Slike artikala i server: `python3 make_images.py <img>`, pa `python3 serve.py <dist> <img>` (port 8099, i aplikacija i `/img/*`).
4. Probni podaci: `python3 seed.py` (firma „Veleprodaja Morava“, komercijalista `marko@morava-primer.rs`, kupci, artikli, porudžbine u svim statusima; piše `seed.json`).
5. Snimanje: `node capture_operator.js raw/` (Playwright; putanja do Playwright-a je u `lib.js`).
6. Obrada: `python3 finalize.py raw ../slike/komercijalista`.
7. PDF za pregled (nije u repou): `python3 to_html.py ../komercijalista.md out.pdf` napravi `out.html`, `node print.js out.html out.pdf`.

`lib.js`: `mark()` crta narandžasti okvir sa brojem oko elementa (po `testID`, tekstu ili CSS-u), `union()` uokviruje više elemenata zajedno, `shot()` snima (uz `clip` za isečak).
Seed se pokreće na sveže pokrenut backend (baza u memoriji), inače se istorija puni duplim porudžbinama.
