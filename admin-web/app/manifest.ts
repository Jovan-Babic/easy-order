import type { MetadataRoute } from "next";

// Installable portal (PWA): "Add to home screen" opens it full screen like an
// app. No service worker / offline cache - billing and stock data must be live.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Easy Order Admin",
    short_name: "Easy Order",
    description: "Admin portal for Easy Order",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F3F4F6",
    theme_color: "#1A4D2E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
