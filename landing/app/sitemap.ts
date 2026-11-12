import type { MetadataRoute } from "next";

const SITE_URL = (process.env.SITE_URL || "http://localhost:3001").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, alternates: { languages: { sr: `${SITE_URL}/`, en: `${SITE_URL}/en` } } },
    { url: `${SITE_URL}/en`, alternates: { languages: { sr: `${SITE_URL}/`, en: `${SITE_URL}/en` } } },
  ];
}
