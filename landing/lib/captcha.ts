// The contact form's invisible captcha: a proof of work handed out by the backend
// (GET /api/public/challenge, through this site's /api/challenge). The browser tries numbers until
// sha256(salt + n) equals the challenge, in batches so it takes about a second even on a phone.
export type Challenge = { algorithm: string; challenge: string; salt: string; maxnumber: number; signature: string };
export type Solution = { salt: string; number: number; challenge: string; signature: string };

const BATCH = 500;

function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function solveChallenge(ch: Challenge): Promise<Solution> {
  const enc = new TextEncoder();
  for (let start = 0; start <= ch.maxnumber; start += BATCH) {
    const numbers = Array.from({ length: Math.min(BATCH, ch.maxnumber - start + 1) }, (_, i) => start + i);
    const hashes = await Promise.all(numbers.map((n) => crypto.subtle.digest("SHA-256", enc.encode(`${ch.salt}${n}`))));
    const found = hashes.findIndex((h) => hex(h) === ch.challenge);
    if (found >= 0) return { salt: ch.salt, number: numbers[found], challenge: ch.challenge, signature: ch.signature };
  }
  throw new Error("Challenge not solved");
}

// Fetch and solve a fresh challenge (each one is valid for 10 minutes and only once).
export async function freshSolution(): Promise<Solution> {
  const res = await fetch("/api/challenge", { cache: "no-store" });
  if (!res.ok) throw new Error("No challenge");
  return solveChallenge((await res.json()) as Challenge);
}
