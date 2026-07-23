import type { Config } from "tailwindcss";

// Values ported from ../frontend/src/theme.ts, which is itself sourced from
// ../design_guidelines.json - keep in sync if the brand palette changes.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#1A4D2E",
        onBrand: "#FFFFFF",
        brandSecondary: "#E8F3EB",
        brandTertiary: "#D1EAE0",
        surface: "#F3F4F6",
        onSurface: "#111827",
        surfaceSecondary: "#FFFFFF",
        onSurfaceSecondary: "#374151",
        surfaceTertiary: "#E5E7EB",
        onSurfaceTertiary: "#4B5563",
        success: "#059669",
        warning: "#D97706",
        error: "#DC2626",
        info: "#3B82F6",
        border: "#E5E7EB",
        borderStrong: "#9CA3AF",
        muted: "#6B7280",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
