# Plan: stanje robe u magacinu (minimalno)

Cilj: magacin unosi robu (prijem) i vodi stanje po proizvodu, svako slanje porudžbine skida sa stanja, a komercijalista pri dogovaranju prodaje vidi koliko čega ima. Namerno minimalno: jedna količina po proizvodu, bez lokacija, serija i rokova.

## Model podataka

- **`products.stock_qty`**: `Optional[int]`. `null` = stanje se ne vodi za taj proizvod (postojeći proizvodi ostaju takvi dok se ne unese prvi prijem ili popis, pa nigde ne piše pogrešno „0“).
- **`stock_movements`** (nova kolekcija, samo dopisivanje, nikad izmena): `id, client_id, product_id, delta (+/−), type, order_id?, note?, created_by_user_id/name, created_at`.
  - `type`: `receipt` (prijem), `adjustment` (popis/korekcija, napomena obavezna), `shipment` (skidanje pri slanju), `reversal` (vraćanje kad admin poništi slanje).
- `stock_qty` se menja atomski (`$inc`) zajedno sa upisom kretanja, pa se zbir kretanja uvek slaže sa stanjem.
- **Rezervisano** se ne čuva nego računa: zbir `ordered_qty` po proizvodu u porudžbinama `new` i `in_progress`. **Slobodno = stanje − rezervisano.**

## Dozvole

| Akcija | superadmin | admin | warehouse | operator |
|---|---|---|---|---|
| Prijem robe, popis/korekcija | ✅ | ✅ | ✅ | — |
| Istorija kretanja | ✅ | ✅ | ✅ | — |
| Vidi stanje / slobodno u katalogu | ✅ | ✅ | ✅ | ✅ (samo čitanje) |

## Tok

- **Prijem:** `POST /stock/receipts` `{items: [{product_id, qty}], note?}`: `stock_qty += qty` (ako je bilo `null`, počinje od `qty`).
- **Popis:** `POST /stock/adjustments` `{product_id, counted_qty, note}`: kretanje je razlika do izbrojane količine.
- **Slanje porudžbine** (`→ shipped`): za svaku stavku čiji proizvod ima `stock_qty` skida se `picked_qty`, u istom koraku kao status.
- **Poništeno slanje** (admin override sa `shipped` na drugi status): kretanje `reversal` vraća količinu.
- **Komercijalista:** u katalogu na mobilnoj uz proizvod piše „Na stanju: X (slobodno: Y)“; pri unosu veće količine od slobodne samo upozorenje, bez blokade.

## Faze

1. **S1:** backend (polje, kretanja, prijem, popis, lista stanja) + stranica „Stanje“ u portalu (tabela, prijem, popis, istorija) + testovi.
2. **S2:** skidanje pri slanju i vraćanje pri poništavanju + testovi.
3. **S3:** prikaz stanja i upozorenje u katalogu na mobilnoj; kolona stanja u portalu.

## Otvorena pitanja (potrebna odluka)

1. **Jedinica:** komadi ili pakovanja? Preporuka: komadi (kao `ordered_qty` i `picked_qty`).
2. **Kad se skida:** pri slanju (preporuka, jedan trenutak, lako poništavanje) ili čim magacioner čekira stavku?
3. **Minus:** ako stanje ne pokriva spakovano, dozvoliti slanje sa upozorenjem (preporuka, jer stanje u praksi kasni za stvarnošću) ili blokirati?
4. **Vidljivost komercijalisti:** tačan broj ili samo „ima / nema / malo“?
