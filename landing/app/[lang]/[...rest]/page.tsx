import { notFound } from "next/navigation";

// Any other path under a language is a 404 (with the site's layout).
export default function Rest() {
  notFound();
}
