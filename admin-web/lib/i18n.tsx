"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "sr" | "en";

export const STORAGE_KEY = "easy-order-admin-lang";

export const translations = {
  sr: {
    dashboard: "Kontrolna tabla",
    clients: "Klijenti",
    users: "Korisnici",
    products: "Proizvodi",
    customers: "Kupci",
    orders: "Narudžbine",
    app: "Aplikacija",
    appDownloads: "Preuzimanja aplikacije",
    language: "Jezik",
    logout: "Odjavi se",
    login: "Prijava",
    loggingIn: "Prijavljivanje...",
    email: "Email",
    password: "Lozinka",
    invalidCredentials: "Neispravan email ili lozinka",
    allClients: "Svi klijenti",
    revenueByClient: "Prihod po klijentu",
    revenueInclVat: "Prihod (sa PDV-om)",
    ordersCount: "Narudžbine",
    customersCount: "Kupci",
    productsCount: "Proizvodi",
    loading: "Učitavanje...",
    cancel: "Otkaži",
    close: "Zatvori",
    createClient: "Kreiraj klijenta",
    createCustomer: "Kreiraj kupca",
    createUser: "Kreiraj korisnika",
    createProduct: "Kreiraj proizvod",
    newClient: "Novi klijent",
    newCustomer: "Novi kupac",
    newUser: "Novi korisnik",
    newProduct: "Novi proizvod",
    company: "Kompanija",
    companyName: "Naziv kompanije",
    companyEmail: "Email kompanije",
    companyPhone: "Telefon kompanije",
    taxIdPib: "PIB",
    firstAdminUser: "Prvi admin korisnik",
    adminName: "Ime admina",
    adminEmail: "Email admina",
    adminPassword: "Lozinka admina",
    status: "Status",
    active: "Aktivan",
    inactive: "Neaktivan",
    view: "Pregled",
    edit: "Izmeni",
    delete: "Obriši",
    name: "Ime",
    address: "Adresa",
    phone: "Telefon",
    image: "Slika",
    productImage: "Slika proizvoda",
    manufacturer: "Proizvođač",
    priceExclVat: "Cena (bez PDV-a)",
    vatRate: "PDV (%)",
    defaultDiscount: "Podrazumevani popust (%)",
    additionalDiscountOptions: "Opcije dodatnog popusta (%)",
    piecesPerPackage: "Komada u pakovanju",
    boxesPerTransport: "Kutija po transportu",
    client: "Klijent",
    selectClient: "Izaberi klijenta...",
    productPreview: "Pregled proizvoda",
    orPasteImageUrl: "Ili nalepi URL slike",
    noImage: "Nema slike",
    noImageAvailable: "Nema slike",
    saveChanges: "Sačuvaj izmene",
    saving: "Čuvanje...",
    creating: "Kreiranje...",
    customer: "Kupac",
    items: "Stavke",
    date: "Datum",
    noOrdersYet: "Nema narudžbina.",
    addProduct: "Dodaj proizvod",
    editProduct: "Izmeni proizvod",
    productName: "Naziv proizvoda",
    productManufacturer: "Proizvođač",
    productPrice: "Cena",
    vat: "PDV",
    packaging: "Pakovanje",
    allClientsLabel: "Svi klijenti",
    failedCreateCustomer: "Nije uspelo kreiranje kupca",
    failedCreateClient: "Nije uspelo kreiranje klijenta",
    failedCreateUser: "Nije uspelo kreiranje korisnika",
    failedUpdateUser: "Nije uspelo ažuriranje korisnika",
    newPasswordOptional: "Nova lozinka (opciono)",
    phoneRequired: "Telefon je obavezan",
    userRoleOperator: "Operator",
    userRoleAdmin: "Admin",
    userRoleSuperAdmin: "SuperAdmin",
    role: "Uloga",
    accountScope: "Novi korisnici se kreiraju kao operatori za vašu kompaniju.",
    appDownloadsTitle: "Preuzimanja aplikacije",
    appDownloadsSubtitle: "Distribucija mobilne aplikacije za teren.",
    appNotReady: "Sekcija za preuzimanje aplikacije je trenutno u pripremi. Kada verzije budu spremne, ovde će se automatski pojaviti opcije za Android i iOS.",
    android: "Android",
    ios: "iOS",
    androidDescription: "APK za direktnu instalaciju na uređaje zaposlenih.",
    version: "Verzija",
    buildDate: "Datum izgradnje",
    file: "Fajl",
    downloadApk: "Preuzmi APK",
    androidNotAvailable: "Android aplikacija još nije dostupna za preuzimanje.",
    androidFuture: "Uskoro će biti dodat instalacioni paket. Kada tim objavi novu verziju, dugme za preuzimanje će se pojaviti automatski.",
    iOSDescription: "iOS distribucija ide preko TestFlight-a ili Apple Business Manager-a.",
    link: "Link",
    openIOSDistribution: "Otvori iOS distribuciju",
    iosNotActivated: "iOS distribucija još nije aktivirana. Kada pristup bude spreman, ovde će biti dostupan direktan link.",
    download: "Preuzmi",
    adminPortal: "Admin portal"
  },
  en: {
    dashboard: "Dashboard",
    clients: "Clients",
    users: "Users",
    products: "Products",
    customers: "Customers",
    orders: "Orders",
    app: "App",
    appDownloads: "App downloads",
    language: "Language",
    logout: "Log out",
    login: "Log in",
    loggingIn: "Logging in...",
    email: "Email",
    password: "Password",
    invalidCredentials: "Invalid email or password",
    allClients: "All clients",
    revenueByClient: "Revenue by client",
    revenueInclVat: "Revenue (incl. VAT)",
    ordersCount: "Orders",
    customersCount: "Customers",
    productsCount: "Products",
    loading: "Loading...",
    cancel: "Cancel",
    close: "Close",
    createClient: "Create client",
    createCustomer: "Create customer",
    createUser: "Create user",
    createProduct: "Create product",
    newClient: "New client",
    newCustomer: "New customer",
    newUser: "New user",
    newProduct: "New product",
    company: "Company",
    companyName: "Company name",
    companyEmail: "Company email",
    companyPhone: "Company phone",
    taxIdPib: "Tax ID (PIB)",
    firstAdminUser: "First Admin user",
    adminName: "Admin name",
    adminEmail: "Admin email",
    adminPassword: "Admin password",
    status: "Status",
    active: "Active",
    inactive: "Inactive",
    view: "View",
    edit: "Edit",
    delete: "Delete",
    name: "Name",
    address: "Address",
    phone: "Phone",
    image: "Image",
    productImage: "Product image",
    manufacturer: "Manufacturer",
    priceExclVat: "Price (excl. VAT)",
    vatRate: "VAT rate (%)",
    defaultDiscount: "Default discount (%)",
    additionalDiscountOptions: "Additional discount options (%)",
    piecesPerPackage: "Pieces per package",
    boxesPerTransport: "Boxes per transport",
    client: "Client",
    selectClient: "Select client...",
    productPreview: "Product preview",
    orPasteImageUrl: "Or paste image URL",
    noImage: "No image",
    noImageAvailable: "No image",
    saveChanges: "Save changes",
    saving: "Saving...",
    creating: "Creating...",
    customer: "Customer",
    items: "Items",
    date: "Date",
    noOrdersYet: "No orders yet.",
    addProduct: "Add product",
    editProduct: "Edit product",
    productName: "Product name",
    productManufacturer: "Manufacturer",
    productPrice: "Price",
    vat: "VAT",
    packaging: "Packaging",
    allClientsLabel: "All clients",
    failedCreateCustomer: "Failed to create customer",
    failedCreateClient: "Failed to create client",
    failedCreateUser: "Failed to create user",
    failedUpdateUser: "Failed to update user",
    newPasswordOptional: "New password (optional)",
    phoneRequired: "Phone is required",
    userRoleOperator: "Operator",
    userRoleAdmin: "Admin",
    userRoleSuperAdmin: "SuperAdmin",
    role: "Role",
    accountScope: "New users are created as Operators for your company.",
    appDownloadsTitle: "App Downloads",
    appDownloadsSubtitle: "Distribution of the mobile app for field teams.",
    appNotReady: "The app download section is currently being prepared. Once the versions are ready, the Android and iOS options will appear automatically here.",
    android: "Android",
    ios: "iOS",
    androidDescription: "APK for direct installation on employees' devices.",
    version: "Version",
    buildDate: "Build date",
    file: "File",
    downloadApk: "Download APK",
    androidNotAvailable: "The Android app is not available for download yet.",
    androidFuture: "An installation package will be added soon. When the team publishes a new version, the download button will appear automatically.",
    iOSDescription: "The iOS distribution is handled via TestFlight or Apple Business Manager.",
    link: "Link",
    openIOSDistribution: "Open iOS distribution",
    iosNotActivated: "The iOS distribution is not active yet. Once access is ready, a direct link will be available here.",
    download: "Download",
    adminPortal: "Admin portal"
  },
} as const;

export type TranslationKey = keyof typeof translations.sr;

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getDefaultLang(): Lang {
  if (typeof window === "undefined") return "sr";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "sr" || stored === "en") return stored;
  const browserLang = window.navigator.language.toLowerCase();
  return browserLang.startsWith("sr") ? "sr" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("sr");

  useEffect(() => {
    setLangState(getDefaultLang());
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang: (nextLang) => setLangState(nextLang),
      t: (key) => {
        const valueByLang = translations[lang][key];
        if (valueByLang) {
          return valueByLang;
        }
        return translations.en[key] ?? key;
      },
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
