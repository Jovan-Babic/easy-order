# Korisnička uputstva

Uputstva su podeljena po ulogama, da bi aplikacija kasnije svakom korisniku mogla da prikaže samo njegovo uputstvo (polje `uloga` na vrhu svakog fajla odgovara ulozi u sistemu).

| Uloga u sistemu | Uputstvo | Gde radi |
|---|---|---|
| `operator` – komercijalista | [komercijalista.md](komercijalista.md) | Android aplikacija |
| `warehouse` – magacin | [magacin.md](magacin.md) | Android aplikacija (+ portal na računaru) |
| `admin` – administrator firme | [admin.md](admin.md) | portal na računaru + Android aplikacija |

Slike ekrana su u `slike/<uloga>/`. Narandžasti okvir sa brojem označava deo ekrana koji se opisuje u tekstu ispod slike.

## Delovi koji zavise od paketa

Aplikacija i portal prikazuju uputstvo **samo sa onim što firma ima** (osnova + moduli iz paketa ili ugovoreni dodatno). Deo teksta koji pripada modulu označava se HTML komentarom, a backend (`guide_for_modules` u `backend/server.py`) ga izbacuje firmi koja taj modul nema:

```markdown
<!-- modul: sef -->
### E-faktura preko SEF-a
...ceo blok: poglavlje, pasus, red tabele...
<!-- /modul -->

Tekst u redu <!-- modul: focus -->deo rečenice samo za fokus<!-- /modul --> nastavak.
```

- Oznake bloka stoje **svaka u svom redu** (tako se mogu umetnuti i između redova tabele bez praznog reda).
- `modul: stock, expiry` znači da trebaju oba modula, a `modul: !warehouse` da se deo prikazuje samo firmi **bez** tog modula (npr. tekst bez magacina).
- Oznake mogu da budu jedna u drugoj.
- Moduli: `warehouse`, `stock`, `expiry`, `reports`, `focus`, `targets`, `sef`, `visits`.
- Posle filtriranja poglavlja `## N.` se prenumerišu redom, a upućivanja „odeljak N“ / „odeljku N“ prate novu numeraciju. Upućivanje na poglavlje koje firma ne vidi je greška u uputstvu, a test `tests/test_guide_modules.py` proverava sve kombinacije modula.
- Ako ceo modul ima poglavlje, u oznaku stavite i liniju `---` posle njega, da ne ostanu dve crte zaredom.
- Spiskove sa brojevima ispod slike (1., 2., 3. …) ne skraćujte oznakama: brojevi moraju da odgovaraju slici.
