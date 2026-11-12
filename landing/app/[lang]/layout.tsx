import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { DICTS, LANGS, isLang } from "@/lib/i18n";
import "../globals.css";

const SITE_URL = (process.env.SITE_URL || "http://localhost:3001").replace(/\/$/, "");

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = DICTS[isLang(lang) ? lang : "sr"].meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description: t.description,
    alternates: { canonical: lang === "en" ? "/en" : "/", languages: { sr: "/", en: "/en" } },
    openGraph: { title: t.title, description: t.description, type: "website", locale: lang === "en" ? "en_US" : "sr_RS", images: ["/screens/katalog.webp"] },
    icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1A4D2E" };

// Root layout per language: "/" is Serbian (proxy.ts rewrites it to /sr), "/en" English.
export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
