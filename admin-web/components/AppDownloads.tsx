"use client";

import { useLanguage } from "@/lib/i18n";

export type AndroidRelease = {
  url: string | null;
  version: string | null;
  buildDate: string | null;
};

export type IosRelease = {
  url: string | null;
  version: string | null;
  buildDate: string | null;
};

function getFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "android.apk";
  } catch {
    return "android.apk";
  }
}

export function AppDownloads({
  showAndroid,
  showIos,
  android,
  ios,
}: {
  showAndroid: boolean;
  showIos: boolean;
  android: AndroidRelease;
  ios: IosRelease;
}) {
  const { t } = useLanguage();
  const activeSections = Number(showAndroid) + Number(showIos);

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
        {showAndroid && (
          <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-bold text-onSurface">{t("android")}</h2>
            <p className="mb-4 text-sm text-onSurfaceSecondary">{t("androidDescription")}</p>

            <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm">
              <p className="text-onSurface">
                <span className="font-semibold">{t("version")}:</span> {android.version || "—"}
              </p>
              <p className="mt-1 text-onSurface">
                <span className="font-semibold">{t("buildDate")}:</span> {android.buildDate || "—"}
              </p>
              <p className="mt-1 truncate text-onSurfaceSecondary">
                <span className="font-semibold text-onSurface">{t("file")}:</span>{" "}
                {android.url ? getFileNameFromUrl(android.url) : "android.apk"}
              </p>
            </div>

            {android.url ? (
              <a
                href={android.url}
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

        {showIos && (
          <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-bold text-onSurface">{t("ios")}</h2>
            <p className="mb-4 text-sm text-onSurfaceSecondary">{t("iOSDescription")}</p>

            <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm">
              <p className="text-onSurface">
                <span className="font-semibold">{t("version")}:</span> {ios.version || "—"}
              </p>
              <p className="mt-1 text-onSurface">
                <span className="font-semibold">{t("buildDate")}:</span> {ios.buildDate || "—"}
              </p>
              <p className="mt-1 truncate text-onSurfaceSecondary">
                <span className="font-semibold text-onSurface">{t("link")}:</span> {ios.url || "—"}
              </p>
            </div>

            {ios.url ? (
              <a
                href={ios.url}
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
