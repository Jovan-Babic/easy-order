import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme";
import { hasModule } from "@/src/utils/modules";
import { TopBanners, useTopNotices } from "@/src/components/SubscriptionBanner";

export default function TabsLayout() {
  const { t } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Operators only browse/order - product/customer management is an
  // Admin/SuperAdmin concern (SuperAdmin uses the web portal, not mobile).
  // Warehouse staff don't order or manage anything: they get the history
  // and the "Magacin" packing tab (phase 3 of RBAC_PLAN.md).
  const isWarehouse = user?.role === "warehouse";
  // Admins (a client may have only an admin account) also get the Magacin tab
  // to receive/count/pack, but keep the order screen as their start tab.
  // Without the Magacin module there is no such tab at all.
  const showWarehouseTab = (isWarehouse || user?.role === "admin") && hasModule(user, "warehouse");
  const hideAdminTab = user?.role === "operator" || isWarehouse;
  // With the banner on top it takes the status bar inset, so the screens below
  // (which pad themselves by insets.top) must not add it a second time.
  const bannerShown = useTopNotices().length > 0;
  const safeBottomPadding = Math.max(insets.bottom, Platform.OS === "ios" ? 18 : 8);

  return (
    <View style={{ flex: 1 }}>
    <TopBanners />
    <SafeAreaInsetsContext.Provider value={bannerShown ? { ...insets, top: 0 } : insets}>
    <Tabs
      initialRouteName={isWarehouse ? "home" : "index"}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          height: Platform.OS === "ios" ? 88 + Math.max(0, insets.bottom - 18) : 64 + Math.max(0, insets.bottom - 8),
          paddingBottom: safeBottomPadding,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("home"),
          href: isWarehouse ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t("order"),
          href: isWarehouse ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="warehouse"
        options={{
          title: t("warehouse"),
          href: showWarehouseTab ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t("history"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t("admin"),
          href: hideAdminTab ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
    </SafeAreaInsetsContext.Provider>
    </View>
  );
}
