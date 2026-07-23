import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AppProvider } from "@/src/context/AppContext";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";

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
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (fontsReady && status !== "loading") {
      SplashScreen.hideAsync();
    }
  }, [fontsReady, status]);

  useEffect(() => {
    if (status === "loading") return;
    const onLoginScreen = segments[0] === "login";
    if (status === "unauthenticated" && !onLoginScreen) {
      router.replace("/login");
    } else if (status === "authenticated" && onLoginScreen) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  return <>{children}</>;
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
                <Stack.Screen name="invoice" options={{ presentation: "card" }} />
              </Stack>
            </RouteGuard>
          </AppProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
