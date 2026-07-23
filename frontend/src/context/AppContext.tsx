import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { storage } from "@/src/utils/storage";
import { Lang, translations, TranslationKey } from "@/src/i18n";
import { colors, radius, spacing, font } from "@/src/theme";

type AppContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
  showToast: (msg: string) => void;
};

const AppContext = createContext<AppContextType>({
  lang: "sr",
  setLang: () => {},
  t: (k) => k,
  showToast: () => {},
});

const LANG_KEY = "easyorder_lang";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("sr");
  const [toast, setToast] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(LANG_KEY, "sr");
      if (saved === "sr" || saved === "en") setLangState(saved);
    })();
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    storage.setItem(LANG_KEY, l);
  };

  const t = useCallback(
    (key: TranslationKey) => translations[lang][key] ?? key,
    [lang]
  );

  const showToast = useCallback(
    (msg: string) => {
      setToast(msg);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setToast(null));
    },
    [opacity]
  );

  return (
    <AppContext.Provider value={{ lang, setLang, t, showToast }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity, bottom: insets.bottom + 90 }]}
        >
          <Text style={styles.toastText} testID="toast-message">{toast}</Text>
        </Animated.View>
      )}
    </AppContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.surfaceInverse,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    zIndex: 9999,
  },
  toastText: { color: colors.onSurfaceInverse, fontSize: font.base, fontWeight: "600" },
});

export const useApp = () => useContext(AppContext);
