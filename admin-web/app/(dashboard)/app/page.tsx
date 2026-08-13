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
  const activeSections = Number(showAndroidSection) + Number(showIosSection);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">App Downloads</h1>
      <p className="mb-6 text-sm text-muted">
        Distribucija mobilne aplikacije za teren.
      </p>

      {activeSections === 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surfaceSecondary p-6 text-sm text-onSurfaceSecondary shadow-sm">
          Sekcija za preuzimanje aplikacije je trenutno u pripremi. Kada verzije budu spremne,
          ovde ce se automatski pojaviti opcije za Android i iOS.
        </div>
      )}

      <div className={`grid gap-4 ${activeSections > 1 ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
        {showAndroidSection && (
        <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-onSurface">Android</h2>
          <p className="mb-4 text-sm text-onSurfaceSecondary">
            APK za direktnu instalaciju na uredjaje zaposlenih.
          </p>

          <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm">
            <p className="text-onSurface">
              <span className="font-semibold">Verzija:</span> {androidVersion || "Bice objavljeno uskoro"}
            </p>
            <p className="mt-1 text-onSurface">
              <span className="font-semibold">Build datum:</span> {androidBuildDate || "Bice objavljeno uskoro"}
            </p>
            <p className="mt-1 truncate text-onSurfaceSecondary">
              <span className="font-semibold text-onSurface">Fajl:</span>{" "}
              {androidApkUrl ? getFileNameFromUrl(androidApkUrl) : "android.apk"}
            </p>
          </div>

          {androidApkUrl ? (
            <a
              href={androidApkUrl}
              className="inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              download
            >
              Preuzmi APK
            </a>
          ) : (
            <div className="rounded-md border border-border bg-surface p-4 text-sm text-onSurfaceSecondary">
              <p className="font-semibold text-onSurface">Android aplikacija jos nije dostupna za preuzimanje.</p>
              <p className="mt-2">
                Uskoro ce biti dodat instalacioni paket. Kada tim objavi novu verziju,
                dugme za preuzimanje ce se pojaviti automatski.
              </p>
            </div>
          )}
        </section>
        )}

        {showIosSection && (
        <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-onSurface">iOS</h2>
          <p className="mb-4 text-sm text-onSurfaceSecondary">
            iOS distribucija ide preko TestFlight-a ili Apple Business Manager-a.
          </p>

          <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm">
            <p className="text-onSurface">
              <span className="font-semibold">Verzija:</span> {iosVersion || "Bice objavljeno uskoro"}
            </p>
            <p className="mt-1 text-onSurface">
              <span className="font-semibold">Build datum:</span> {iosBuildDate || "Bice objavljeno uskoro"}
            </p>
            <p className="mt-1 truncate text-onSurfaceSecondary">
              <span className="font-semibold text-onSurface">Link:</span>{" "}
              {iosAppUrl || "Bice dostupan uskoro"}
            </p>
          </div>

          {iosAppUrl ? (
            <a
              href={iosAppUrl}
              className="inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Otvori iOS distribuciju
            </a>
          ) : (
            <p className="text-xs text-muted">
              iOS distribucija jos nije aktivirana. Kada pristup bude spreman,
              ovde ce biti dostupan direktan link.
            </p>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
