import type { Config } from "tailwindcss";

// Same brand palette as admin-web (../design_guidelines.json), plus the amber accent of the sales deck.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#1A4D2E",
        brandDark: "#133A22",
        brandMid: "#4F8A5B",
        brandSecondary: "#E8F3EB",
        brandTertiary: "#D1EAE0",
        accent: "#E8A33D",
        surface: "#F3F4F6",
        onSurface: "#111827",
        onSurfaceSecondary: "#374151",
        border: "#E5E7EB",
        muted: "#6B7280",
        error: "#DC2626",
        success: "#059669",
      },
      borderRadius: { sm: "6px", md: "10px", lg: "16px" },
    },
  },
  plugins: [],
};

export default config;
