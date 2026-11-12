// Server-side reads of the backend's public endpoints. The price list is re-read at most every
// REVALIDATE_SECONDS, so a change on the portal ("Cenovnik", plans) shows on the site within that time.
export const REVALIDATE_SECONDS = 60;

export type PublicPlan = {
  id: string;
  name: string;
  description: string;
  modules: string[];
  included_seats: Record<string, number>;
  prices: Record<string, number>;
};

export type PublicPricing = {
  currency: string;
  plans: PublicPlan[];
  seat_prices: Record<string, number>;
  module_prices: Record<string, number>;
  first_month_free: boolean;
};

export type PublicContact = { phone: string | null; email: string | null; address: string | null };

export function backendUrl() {
  return (process.env.BACKEND_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:8000" : "")).replace(/\/$/, "");
}

async function getJson<T>(path: string): Promise<T | null> {
  const base = backendUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // backend down: the page shows "ask us for an offer" instead of prices
  }
}

export const getPricing = () => getJson<PublicPricing>("/public/pricing");
export const getContact = () => getJson<PublicContact>("/public/contact");
