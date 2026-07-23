import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easy Order Admin",
  description: "Admin portal for Easy Order",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
