import { backendFetch, backendPublicUrl } from "@/lib/backend";
import { AppDownloads, AndroidRelease } from "@/components/AppDownloads";

type AppUpdate = {
  enabled?: boolean;
  version?: string;
  download_url?: string;
  build_date?: string;
};

// Android release info comes from the backend's /api/app/update (i.e.
// backend/public/app/app-update.json) - the same source the mobile app's
// update prompt uses, so the two can't drift apart. Fetched server-side, so
// the browser never calls the backend directly (no CORS), and it's read per
// request, so publishing a new APK needs no admin-web redeploy.
async function getAndroidRelease(): Promise<AndroidRelease | null> {
  try {
    const res = await backendFetch("/app/update");
    if (!res.ok) return null;
    const data = (await res.json()) as AppUpdate;
    if (!data.enabled || !data.download_url) return null;
    return {
      url: backendPublicUrl(data.download_url),
      version: data.version ?? null,
      buildDate: data.build_date ?? null,
    };
  } catch {
    return null;
  }
}

export default async function AppDownloadsPage() {
  // Env vars are only a fallback for when the backend has no release published.
  const android = (await getAndroidRelease()) ?? {
    url: process.env.NEXT_PUBLIC_ANDROID_APK_URL || null,
    version: process.env.NEXT_PUBLIC_ANDROID_APP_VERSION || null,
    buildDate: process.env.NEXT_PUBLIC_ANDROID_BUILD_DATE || null,
  };

  return (
    <AppDownloads
      showAndroid={process.env.NEXT_PUBLIC_SHOW_ANDROID_APP_SECTION === "true"}
      showIos={process.env.NEXT_PUBLIC_SHOW_IOS_APP_SECTION === "true"}
      android={android}
      ios={{
        url: process.env.NEXT_PUBLIC_IOS_APP_URL || null,
        version: process.env.NEXT_PUBLIC_IOS_APP_VERSION || null,
        buildDate: process.env.NEXT_PUBLIC_IOS_BUILD_DATE || null,
      }}
    />
  );
}
