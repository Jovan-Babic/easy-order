"use client";

import { useLanguage } from "@/lib/i18n";

const androidApkUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL;
const androidVersion = process.env.NEXT_PUBLIC_ANDROID_APP_VERSION;
const androidBuildDate = process.env.NEXT_PUBLIC_ANDROID_BUILD_DATE;
const showAndroidSection = process.env.NEXT_PUBLIC_SHOW_ANDROID_APP_SECTION === "true";

const iosAppUrl = process.env.NEXT_PUBLIC_IOS_APP_URL;
const iosVersion = process.env.NEXT_PUBLIC_IOS_APP_VERSION;
const iosBuildDate = process.env.NEXT_PUBLIC_IOS_BUILD_DATE;
const showIosSection = process.env.NEXT_PUBLIC_SHOW_IOS_APP_SECTION === "true";

function getFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "android.apk";
  } catch {
    return "android.apk";
  }
}

export default function AppDownloadsPage() {
  const { t } = useLanguage();
  const activeSections = Number(showAndroidSection) + Number(showIosSection);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">{t("appDownloads")}</h1>
      <p className="mb-6 text-sm text-muted">{t("appDownloadsSubtitle")}</p>

      {activeSections === 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surfaceSecondary p-6 text-sm text-onSurfaceSecondary shadow-sm">
          {t("appNotReady")}
        </div>
      )}

      <div className={`grid gap-4 ${activeSections > 1 ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
        {showAndroidSection && (
          <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-bold text-onSurface">{t("android")}</h2>
            <p className="mb-4 text-sm text-onSurfaceSecondary">{t("androidDescription")}</p>

            <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm">
              <p className="text-onSurface">
                <span className="font-semibold">{t("version")}:</span> {androidVersion || "—"}
              </p>
              <p className="mt-1 text-onSurface">
                <span className="font-semibold">{t("buildDate")}:</span> {androidBuildDate || "—"}
              </p>
              <p className="mt-1 truncate text-onSurfaceSecondary">
                <span className="font-semibold text-onSurface">{t("file")}:</span>{" "}
                {androidApkUrl ? getFileNameFromUrl(androidApkUrl) : "android.apk"}
              </p>
            </div>

            {androidApkUrl ? (
              <a
                href={androidApkUrl}
                className="inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                download
              >
                {t("downloadApk")}
              </a>
            ) : (
              <div className="rounded-md border border-border bg-surface p-4 text-sm text-onSurfaceSecondary">
                <p className="font-semibold text-onSurface">{t("androidNotAvailable")}</p>
                <p className="mt-2">{t("androidFuture")}</p>
              </div>
            )}
          </section>
        )}

        {showIosSection && (
          <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-bold text-onSurface">{t("ios")}</h2>
            <p className="mb-4 text-sm text-onSurfaceSecondary">{t("iOSDescription")}</p>

            <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm">
              <p className="text-onSurface">
                <span className="font-semibold">{t("version")}:</span> {iosVersion || "—"}
              </p>
              <p className="mt-1 text-onSurface">
                <span className="font-semibold">{t("buildDate")}:</span> {iosBuildDate || "—"}
              </p>
              <p className="mt-1 truncate text-onSurfaceSecondary">
                <span className="font-semibold text-onSurface">{t("link")}:</span>{" "}
                {iosAppUrl || "—"}
              </p>
            </div>

            {iosAppUrl ? (
              <a
                href={iosAppUrl}
                className="inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {t("openIOSDistribution")}
              </a>
            ) : (
              <p className="text-xs text-muted">{t("iosNotActivated")}</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
