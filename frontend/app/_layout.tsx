import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import { useEffect, useRef } from "react";
import { Alert, Image, Linking, LogBox, Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AppProvider } from "@/src/context/AppContext";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { useApp } from "@/src/context/AppContext";
import { api } from "@/src/api";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
SplashScreen.preventAutoHideAsync();

// Rendered inside AuthProvider, so useAuth() here sees the live session
// state - hides the splash once both fonts and the session are ready, and
// redirects based on auth status.
function RouteGuard({
  fontsReady,
  children,
}: {
  fontsReady: boolean;
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const { t } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const updateChecked = useRef(false);

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  useEffect(() => {
    if (status === "loading") return;
    const publicScreens = new Set(["login", "forgot-password", "reset-password"]);
    const onPublicScreen = publicScreens.has(segments[0] ?? "");
    if (status === "unauthenticated" && !onPublicScreen) {
      router.replace("/login");
    } else if (status === "authenticated" && onPublicScreen) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  useEffect(() => {
    if (updateChecked.current || status === "loading" || Platform.OS !== "android") return;
    updateChecked.current = true;

    const checkForUpdate = async () => {
      try {
        const update = await api.checkAppUpdate();
        const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
        if (!update.enabled || !update.version || !update.download_url || compareVersions(update.version, currentVersion) <= 0) {
          return;
        }

        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;
        const downloadUrl = new URL(update.download_url, backendUrl).toString();
        Alert.alert(
          t("appUpdateAvailable"),
          update.release_notes ? `${t("appUpdateMessage")}\n\n${update.release_notes}` : t("appUpdateMessage"),
          [
            { text: t("appUpdateLater"), style: "cancel" },
            { text: t("appUpdateNow"), onPress: () => Linking.openURL(downloadUrl) },
          ],
        );
      } catch {
        // Update checks are best-effort and must not block app startup.
      }
    };

    checkForUpdate();
  }, [status, t]);

  if (status === "loading") {
    return (
      <View style={styles.splashContainer}>
        <Image
          source={require("../assets/images/splash-image.png")}
          style={styles.splashImage}
          resizeMode="cover"
        />
      </View>
    );
  }

  return <>{children}</>;
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const fontsReady = loaded || !!error;

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppProvider>
            <RouteGuard fontsReady={fontsReady}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="login" options={{ presentation: "card" }} />
                <Stack.Screen name="forgot-password" options={{ presentation: "card" }} />
                <Stack.Screen name="reset-password" options={{ presentation: "card" }} />
                <Stack.Screen name="invoice" options={{ presentation: "card" }} />
              </Stack>
            </RouteGuard>
          </AppProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: "#1A4D2E",
  },
  splashImage: {
    width: "100%",
    height: "100%",
  },
});
