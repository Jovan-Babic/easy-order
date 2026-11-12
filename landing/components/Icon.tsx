// A few outline icons (24px grid, stroke = currentColor), so the site needs no icon package.
const PATHS: Record<string, string> = {
  phone: "M3 5.5A2.5 2.5 0 0 1 5.5 3h1.6a1 1 0 0 1 1 .8l.7 3.4a1 1 0 0 1-.5 1.1l-1.6.9a11 11 0 0 0 6.1 6.1l.9-1.6a1 1 0 0 1 1.1-.5l3.4.7a1 1 0 0 1 .8 1v1.6A2.5 2.5 0 0 1 18.5 21C10 21 3 14 3 5.5Z",
  keyboard: "M3 7h18v10H3zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9",
  eyeOff: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.4 3.4M6.2 6.2A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7 1.6 0 3-.4 4.3-1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  warehouse: "M3 21V9l9-5 9 5v12M7 21v-8h10v8M7 17h10",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  check: "M5 12.5 10 17 19 7",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  chevron: "M6 9l6 6 6-6",
  menu: "M4 7h16M4 12h16M4 17h16",
};

export function Icon({ name, className = "h-6 w-6" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
