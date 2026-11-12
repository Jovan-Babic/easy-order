// Every text of the site in Serbian (default, "/") and English ("/en").
export type Lang = "sr" | "en";
export const LANGS: Lang[] = ["sr", "en"];
export const isLang = (v: string): v is Lang => (LANGS as string[]).includes(v);
export const homeHref = (lang: Lang) => (lang === "sr" ? "/" : "/en");

type Feature = { title: string; text: string };
type Role = { key: string; title: string; lead: string; points: string[]; image: string; alt: string; wide?: boolean };

export type Dict = {
  meta: { title: string; description: string };
  nav: { features: string; modules: string; pricing: string; contact: string; login: string; other: string; otherLabel: string };
  hero: { kicker: string; title: string; text: string; cta: string; secondary: string; note: string; alt: string };
  problems: { title: string; items: Feature[] };
  flow: { title: string; text: string; steps: Feature[] };
  roles: { title: string; items: Role[] };
  modules: { title: string; text: string; base: string; baseText: string; addon: string; perMonth: string; requires: string };
  moduleNames: Record<string, Feature>;
  pricing: {
    title: string; text: string; monthly: string; yearly: string; perMonthYearly: string; save: string; included: string;
    unlimited: string; accounts: string; modulesInPlan: string; baseOnly: string; ask: string; extraTitle: string;
    extraText: string; addonsTitle: string; addonsText: string; firstFree: string; prepaid: string; empty: string;
    emptyCta: string; vat: string; perMonth: string;
  };
  roleNames: Record<string, string>;
  start: { title: string; steps: Feature[] };
  faq: { title: string; items: Feature[] };
  contact: {
    title: string; text: string; phone: string; email: string; address: string; formTitle: string; name: string;
    company: string; emailField: string; phoneField: string; plan: string; planNone: string; message: string;
    messagePlaceholder: string; send: string; sending: string; sent: string; needContact: string; failed: string;
    tooMany: string; invalid: string; privacy: string;
  };
  footer: { rights: string; portal: string };
};

const sr: Dict = {
  meta: {
    title: "Easy Order – porudžbine sa terena, magacin i faktura",
    description: "Easy Order vodi porudžbinu od komercijaliste na terenu, preko magacina, do fakture. Za veleprodaje i distributere.",
  },
  nav: { features: "Funkcije", modules: "Moduli", pricing: "Cenovnik", contact: "Kontakt", login: "Prijava", other: "EN", otherLabel: "English" },
  hero: {
    kicker: "Za veleprodaje i distributere",
    title: "Porudžbina sa terena stiže u magacin istog trenutka",
    text: "Komercijalista unosi porudžbinu na telefonu, magacin je odmah pakuje uz skener, a faktura nastaje sama. Bez papira, poziva i prekucavanja.",
    cta: "Zatražite ponudu",
    secondary: "Pogledajte cene",
    note: "Prvi nepun mesec je besplatan.",
    alt: "Katalog sa cenama i popustima u aplikaciji Easy Order",
  },
  problems: {
    title: "Da li vam je ovo poznato?",
    items: [
      { title: "Telefon, Viber i papir", text: "Porudžbina se diktira i prepisuje, pa se lako pogrešno razume." },
      { title: "Prekucavanje u fakturu", text: "Isti podaci se unose dva ili tri puta." },
      { title: "Pogrešna roba u isporuci", text: "Magacin pakuje sa nečitkog papira, pa stižu reklamacije." },
      { title: "Uprava ne vidi teren", text: "Šta je prodato i ko kasni saznaje se tek na kraju meseca." },
    ],
  },
  flow: {
    title: "Porudžbina se unosi samo jednom",
    text: "Svi vide istu porudžbinu, od trenutka unosa do fakture.",
    steps: [
      { title: "Komercijalista", text: "Bira kupca i unosi količine i dozvoljene popuste na telefonu." },
      { title: "Magacin", text: "Odmah vidi porudžbinu, pakuje je i skenira barkod." },
      { title: "Faktura", text: "Nastaje iz porudžbine, sa stvarno isporučenim količinama." },
    ],
  },
  roles: {
    title: "Za svakoga ko učestvuje u prodaji",
    items: [
      {
        key: "operator", title: "Komercijalista", lead: "Porudžbina za par minuta, bez zvanja kancelarije.",
        points: ["Katalog sa cenama, slikama i pretragom", "Samo popusti koje je uprava odobrila", "Stanje i upozorenje kad poruči više", "Faktura se deli kupcu sa telefona"],
        image: "/screens/katalog.webp", alt: "Katalog u aplikaciji za komercijaliste",
      },
      {
        key: "warehouse", title: "Magacin", lead: "Pakovanje bez papira i bez pogrešne robe.",
        points: ["Nova porudžbina odmah na početnom ekranu", "Barkod skener na kameri telefona", "Manja isporuka kad nečega nema, faktura to prati", "Prijem, popis i rokovi trajanja"],
        image: "/screens/pakovanje.webp", alt: "Pakovanje porudžbine u magacinu",
      },
      {
        key: "admin", title: "Uprava", lead: "Prodaja na jednom mestu, u svakom trenutku.",
        points: ["Porudžbine po statusu, komercijalisti i periodu", "Uvoz artikala i kupaca iz Excela", "Roba u fokusu i ciljevi prodaje", "Korisnici i uloge na portalu"],
        image: "/screens/izvestaji.webp", alt: "Izveštaji na portalu za upravu", wide: true,
      },
    ],
  },
  modules: {
    title: "Uključite ono što vam treba",
    text: "Osnova je uvek uključena: katalog, kupci, porudžbine i faktura. Ostalo zavisi od paketa, a dodaci se uključuju posebno.",
    base: "Osnova", baseText: "Katalog, kupci, porudžbine, faktura, mobilna aplikacija i portal",
    addon: "Dodatak", perMonth: "mesečno", requires: "uz",
  },
  moduleNames: {
    warehouse: { title: "Magacin", text: "Uloga magacionera, pakovanje, statusi porudžbine, barkod skener i otpremnica." },
    stock: { title: "Zalihe", text: "Stanje, prijem, popis i istorija promena; stanje se skida pri otpremi." },
    expiry: { title: "Rok trajanja", text: "Serije po datumu, upozorenja pre isteka i otpis; prvo izlazi roba sa kraćim rokom." },
    reports: { title: "Izveštaji", text: "Porudžbine po statusu, komercijalisti i magacioneru za izabrani period." },
    focus: { title: "Roba u fokusu", text: "Istaknuti artikli sa preporučenim popustom i izveštajem o prodaji." },
    targets: { title: "Ciljevi prodaje", text: "Mesečni, kvartalni i godišnji ciljevi po komercijalisti i ekran „Moj učinak“." },
    sef: { title: "SEF e-fakture", text: "Slanje e-fakture iz porudžbine, provera podataka i praćenje statusa." },
    visits: { title: "Plan obilazaka", text: "Učestalost obilaska po kupcu, zone, nedeljni plan i ko je na redu." },
  },
  pricing: {
    title: "Cenovnik",
    text: "Plaćate paket, dodatne naloge i dodatke koje koristite. Cene su iste za sve klijente.",
    monthly: "mesečno", yearly: "godišnje", perMonthYearly: "mesečno uz godišnje plaćanje", save: "ušteda",
    included: "Uključeni nalozi", unlimited: "bez ograničenja", accounts: "nalog(a)", modulesInPlan: "Moduli u paketu",
    baseOnly: "Samo osnova", ask: "Zatražite ponudu", extraTitle: "Dodatni nalozi",
    extraText: "Kada vam zatreba više naloga nego što paket sadrži, svaki dodatni se plaća mesečno.",
    addonsTitle: "Dodaci", addonsText: "Uključuju se uz bilo koji paket.",
    firstFree: "Prvi nepun mesec korišćenja je besplatan.",
    prepaid: "Plaćanje unapred, mesečno ili godišnje; predračun stiže mejlom, sa IPS QR kodom.",
    empty: "Cene pripremamo prema veličini vaše firme.", emptyCta: "Pišite nam za ponudu",
    vat: "Cene su u dinarima.", perMonth: "mesečno",
  },
  roleNames: { operator: "Komercijalista", warehouse: "Magacioner", admin: "Administrator" },
  start: {
    title: "Počinjete za nekoliko dana",
    steps: [
      { title: "Vaši podaci", text: "Pošaljete Excel sa artiklima i kupcima, a mi ih uvezemo." },
      { title: "Nalozi", text: "Svaki korisnik dobija pozivnicu na mejl i sam bira lozinku." },
      { title: "Obuka", text: "Kratka obuka po ulozi, a uputstvo sa slikama je u aplikaciji." },
      { title: "Prva porudžbina", text: "Komercijalisti rade sa terena, magacin pakuje uz skener." },
    ],
  },
  faq: {
    title: "Česta pitanja",
    items: [
      { title: "Da li zamenjuje knjigovodstveni program?", text: "Ne. Easy Order pokriva teren i magacin, deo pre knjigovodstva. Faktura izlazi iz porudžbine, a e-fakturu na SEF šalje dodatak SEF." },
      { title: "Na kojim uređajima radi?", text: "Aplikacija za komercijaliste i magacin je za Android telefone. Portal za upravu radi u pregledaču na računaru." },
      { title: "Da li su naši podaci odvojeni od drugih firmi?", text: "Da. Podaci svake firme su potpuno odvojeni, a svaka uloga vidi samo ono što joj treba; komercijalista vidi samo svoje porudžbine." },
      { title: "Šta ako promenimo cenu artikla?", text: "Stare porudžbine i fakture se ne menjaju, jer čuvaju cenu iz trenutka unosa." },
      { title: "Prodajemo na kilogram i metar. Da li je to podržano?", text: "Da: komad, masa, zapremina i dužina, sa pakovanjem i barkodom kutije za robu na komad." },
      { title: "Da li treba internet?", text: "Za unos porudžbine je potreban internet. Uputstvo je dostupno i bez mreže." },
      { title: "Šta se dešava ako zakasnimo sa uplatom?", text: "Nalog se blokira posle roka za plaćanje, ali podaci ostaju sačuvani; administrator i dalje vidi zaduženja i može da plati." },
    ],
  },
  contact: {
    title: "Kontakt",
    text: "Pišite nam ili pozovite. Odgovaramo u toku radnog dana i dogovaramo prikaz sa vašim artiklima.",
    phone: "Telefon", email: "Email", address: "Adresa", formTitle: "Pošaljite upit",
    name: "Ime i prezime", company: "Firma", emailField: "Email", phoneField: "Telefon", plan: "Paket koji vas zanima",
    planNone: "Nisam siguran", message: "Poruka",
    messagePlaceholder: "Koliko imate komercijalista i magacionera? Šta vam je najvažnije?",
    send: "Pošalji upit", sending: "Šalje se...", sent: "Hvala! Upit je poslat, javljamo vam se uskoro.",
    needContact: "Unesite email ili telefon, da bismo mogli da vam odgovorimo.",
    failed: "Slanje nije uspelo. Pokušajte ponovo ili nas pozovite.",
    tooMany: "Poslali ste više poruka. Pokušajte ponovo za sat vremena.",
    invalid: "Proverite unete podatke (email ili telefon).",
    privacy: "Podatke iz upita koristimo samo da bismo vam odgovorili.",
  },
  footer: { rights: "Sva prava zadržana.", portal: "Portal za korisnike" },
};

const en: Dict = {
  meta: {
    title: "Easy Order – field orders, warehouse and invoices",
    description: "Easy Order takes an order from the sales rep in the field, through the warehouse, to the invoice. For wholesalers and distributors.",
  },
  nav: { features: "Features", modules: "Modules", pricing: "Pricing", contact: "Contact", login: "Sign in", other: "SR", otherLabel: "Srpski" },
  hero: {
    kicker: "For wholesalers and distributors",
    title: "An order from the field reaches the warehouse instantly",
    text: "The sales rep enters the order on a phone, the warehouse packs it right away with a scanner, and the invoice makes itself. No paper, calls or retyping.",
    cta: "Request an offer",
    secondary: "See pricing",
    note: "The first partial month is free.",
    alt: "Catalog with prices and discounts in the Easy Order app",
  },
  problems: {
    title: "Does this sound familiar?",
    items: [
      { title: "Phone, Viber and paper", text: "Orders are dictated and copied, so they are easily misunderstood." },
      { title: "Retyping into invoices", text: "The same data is entered two or three times." },
      { title: "Wrong goods delivered", text: "The warehouse packs from illegible paper, and complaints follow." },
      { title: "Management can't see the field", text: "What was sold and who is late is known only at month end." },
    ],
  },
  flow: {
    title: "An order is entered only once",
    text: "Everyone sees the same order, from entry to invoice.",
    steps: [
      { title: "Sales rep", text: "Picks the customer and enters quantities and allowed discounts on a phone." },
      { title: "Warehouse", text: "Sees the order at once, packs it and scans the barcode." },
      { title: "Invoice", text: "Made from the order, with the quantities actually shipped." },
    ],
  },
  roles: {
    title: "For everyone involved in sales",
    items: [
      {
        key: "operator", title: "Sales rep", lead: "An order in minutes, without calling the office.",
        points: ["Catalog with prices, pictures and search", "Only the discounts management approved", "Stock levels and a warning when ordering more", "The invoice is shared with the customer from the phone"],
        image: "/screens/katalog.webp", alt: "Catalog in the sales rep app",
      },
      {
        key: "warehouse", title: "Warehouse", lead: "Packing without paper and without wrong goods.",
        points: ["New orders right on the home screen", "Barcode scanner on the phone camera", "Short shipments when something is missing, the invoice follows", "Receiving, stocktaking and expiry dates"],
        image: "/screens/pakovanje.webp", alt: "Packing an order in the warehouse",
      },
      {
        key: "admin", title: "Management", lead: "All sales in one place, at any moment.",
        points: ["Orders by status, sales rep and period", "Import products and customers from Excel", "Goods in focus and sales targets", "Users and roles in the portal"],
        image: "/screens/izvestaji.webp", alt: "Reports in the management portal", wide: true,
      },
    ],
  },
  modules: {
    title: "Turn on what you need",
    text: "The base is always included: catalog, customers, orders and invoices. The rest depends on the package, and add-ons are switched on separately.",
    base: "Base", baseText: "Catalog, customers, orders, invoices, the mobile app and the portal",
    addon: "Add-on", perMonth: "per month", requires: "with",
  },
  moduleNames: {
    warehouse: { title: "Warehouse", text: "Warehouse role, packing, order statuses, barcode scanner and delivery note." },
    stock: { title: "Stock", text: "Stock levels, receiving, stocktaking and history; stock is deducted on shipping." },
    expiry: { title: "Expiry dates", text: "Batches by date, alerts before expiry and write-offs; the shortest date ships first." },
    reports: { title: "Reports", text: "Orders by status, sales rep and warehouse handler for a chosen period." },
    focus: { title: "Goods in focus", text: "Highlighted products with a recommended discount and a sales report." },
    targets: { title: "Sales targets", text: "Monthly, quarterly and yearly targets per sales rep and a \"My progress\" screen." },
    sef: { title: "SEF e-invoices", text: "Send the e-invoice from the order, check the data and follow its status." },
    visits: { title: "Visit plan", text: "Visit frequency per customer, zones, a weekly plan and who is due." },
  },
  pricing: {
    title: "Pricing",
    text: "You pay for the package, extra accounts and the add-ons you use. Prices are the same for every client.",
    monthly: "per month", yearly: "per year", perMonthYearly: "per month, billed yearly", save: "save",
    included: "Accounts included", unlimited: "unlimited", accounts: "account(s)", modulesInPlan: "Modules in the package",
    baseOnly: "Base only", ask: "Request an offer", extraTitle: "Extra accounts",
    extraText: "When you need more accounts than the package includes, each extra one is billed monthly.",
    addonsTitle: "Add-ons", addonsText: "Available with any package.",
    firstFree: "The first partial month of use is free.",
    prepaid: "Paid in advance, monthly or yearly; the pro-forma invoice comes by email with an IPS QR code.",
    empty: "We prepare prices for the size of your company.", emptyCta: "Ask us for an offer",
    vat: "Prices are in Serbian dinars (RSD).", perMonth: "per month",
  },
  roleNames: { operator: "Sales rep", warehouse: "Warehouse", admin: "Administrator" },
  start: {
    title: "You start within a few days",
    steps: [
      { title: "Your data", text: "Send an Excel file with products and customers, and we import it." },
      { title: "Accounts", text: "Every user gets an email invitation and picks their own password." },
      { title: "Training", text: "Short training per role, with an illustrated guide inside the app." },
      { title: "First order", text: "Sales reps work from the field, the warehouse packs with a scanner." },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      { title: "Does it replace our accounting software?", text: "No. Easy Order covers the field and the warehouse, the part before accounting. The invoice comes from the order, and the SEF add-on sends the e-invoice." },
      { title: "Which devices does it run on?", text: "The app for sales reps and the warehouse is for Android phones. The management portal runs in a browser on a computer." },
      { title: "Is our data separate from other companies?", text: "Yes. Each company's data is fully separate, and each role sees only what it needs; a sales rep sees only their own orders." },
      { title: "What if we change a product's price?", text: "Past orders and invoices don't change: they keep the price from the moment of entry." },
      { title: "We sell by the kilogram and metre. Is that supported?", text: "Yes: pieces, mass, volume and length, with packaging and a box barcode for goods sold by the piece." },
      { title: "Is an internet connection needed?", text: "Entering an order needs the internet. The guide is available offline too." },
      { title: "What happens if we pay late?", text: "The account is blocked after the payment deadline, but the data is kept; the administrator still sees the charges and can pay." },
    ],
  },
  contact: {
    title: "Contact",
    text: "Write or call us. We answer within a working day and arrange a demo with your own products.",
    phone: "Phone", email: "Email", address: "Address", formTitle: "Send an inquiry",
    name: "Full name", company: "Company", emailField: "Email", phoneField: "Phone", plan: "Package you are interested in",
    planNone: "Not sure", message: "Message",
    messagePlaceholder: "How many sales reps and warehouse staff do you have? What matters most to you?",
    send: "Send inquiry", sending: "Sending...", sent: "Thank you! Your inquiry was sent, we will get back to you soon.",
    needContact: "Enter an email or a phone number so we can reply.",
    failed: "Sending failed. Please try again or call us.",
    tooMany: "You have sent several messages. Please try again in an hour.",
    invalid: "Please check the email or phone number.",
    privacy: "We use the data from the inquiry only to reply to you.",
  },
  footer: { rights: "All rights reserved.", portal: "Customer portal" },
};

export const DICTS: Record<Lang, Dict> = { sr, en };

// Display order of the modules; `addon` = sold separately, never part of the base.
export const MODULE_ORDER: Array<{ key: string; addon?: boolean; requires?: string }> = [
  { key: "warehouse" },
  { key: "stock", requires: "warehouse" },
  { key: "expiry", requires: "stock" },
  { key: "reports" },
  { key: "focus" },
  { key: "targets" },
  { key: "sef", addon: true },
  { key: "visits", addon: true },
];

export function money(value: number, lang: Lang, currency = "RSD") {
  const n = value.toLocaleString(lang === "sr" ? "sr-RS" : "en-US", { maximumFractionDigits: 2 });
  return lang === "sr" && currency === "RSD" ? `${n} din` : `${n} ${currency}`;
}
