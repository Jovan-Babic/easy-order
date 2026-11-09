# Otvorene stavke (gde smo stali)

Datum: 2026-11-09. Spisak onoga što je odloženo, da se lako nastavi. Detalji su u planovima i u CLAUDE.md.

## SEF e-fakture (spojeno: S1, S2, S3, Integracije)
- **Čeka demo SEF ključ** za proveru na pravom SEF-u (`demoefaktura.mfin.gov.rs`). Ključ pravi administrator firme na SEF portalu. Na backendu treba `INTEGRATION_SECRET`.
- **Nepotvrđeno prema pravom SEF-u:** koji ID SEF očekuje za status i otkazivanje (koristimo `SalesInvoiceId`), pravilo datuma izdavanja (uvek današnji), format tekućeg računa, da li `executeValidation=true` samo proverava, ponovno izdavanje sa istim brojem posle otkazivanja, registrovanost kupca na SEF-u (provera nije napravljena).
- **Nije urađeno:** PDF fakture, lista izdatih faktura sa izvozom u Excel, automatsko osvežavanje statusa preko cron-a (`sales-invoice/changes`), upozorenja pred rok PDV-a, avansne fakture i PDV izuzeća (samo kategorija S 10/20 %).
- Plan: `claude/plan-sef-erp` (`PLAN_SEF_MODUL.md`, `PLAN_SEF_I_ERP.md`), nije spojen u `main`.

## Integracije (ERP)
- Stranica Integracije ima tab po integraciji, trenutno samo SEF. Izvoz za ERP (univerzalni izvoz, zatim konektori) nije počet. Istraživanje je u `PLAN_SEF_I_ERP.md`.

## Cenovnik
- Radi: cena dodatnog naloga po ulozi i cena modula, jedna za sve klijente. **Posle deploy-a proveriti Cenovnik** (cene naloga su prepisane iz paketa ako su se slagale, inače podrazumevane 1000 / 1500 / 2000).

## Obilasci (V1 gotov, PR otvoren)
- Vidi `PLAN_OBILASCI.md`, poglavlje 10: Excel kolone, mesečni pregled, V2 (lokacija, novi APK), V3 (rute), pilot klijent.

## Ostalo
- Dostava i grupisanje po zonama (van obima za sada).
- E-otpremnice (poseban modul, kasnije; plan u `PLAN_SEF_I_ERP.md`).
- Rad bez signala u mobilnoj aplikaciji (red za slanje van mreže) nije napravljen.
