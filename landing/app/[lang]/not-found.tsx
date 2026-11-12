import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl font-extrabold text-brand">404</p>
      <p className="text-onSurfaceSecondary">Stranica ne postoji. / Page not found.</p>
      <Link href="/" className="font-bold text-brand hover:underline">
        Easy Order
      </Link>
    </main>
  );
}
