import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Markdown, { ASTNode, MarkdownIt } from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, Guide, guideImageUrl } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing, font } from "@/src/theme";

const cacheKey = (role: string) => `guide:${role}`;

// Text of a heading node, to match it with the table of contents.
const textOf = (node: ASTNode): string =>
  (node.content ?? "") + (node.children ?? []).map(textOf).join("");

/** A screenshot of the guide; its height follows the picture, a tap shows it bigger. */
function GuideImage({ uri, alt, onOpen }: { uri: string; alt?: string; onOpen: (uri: string) => void }) {
  const [ratio, setRatio] = useState(0.6);
  return (
    <Pressable onPress={() => onOpen(uri)} style={styles.imageWrap} accessibilityLabel={alt}>
      <Image
        source={{ uri }}
        contentFit="contain"
        style={{ width: "100%", aspectRatio: ratio }}
        onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
      />
    </Pressable>
  );
}

export default function GuideScreen() {
  const { t, lang } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Own role's guide (a superadmin reads the admin one); used to find the saved copy offline.
  const ownRole: Guide["role"] | undefined =
    user?.role === "operator" || user?.role === "warehouse" ? user.role : user?.role === "admin" || user?.role === "superadmin" ? "admin" : undefined;
  const [guide, setGuide] = useState<Guide | null>(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const headingY = useRef<Record<string, number>>({});

  // Show the saved copy at once (works offline), then the fresh one.
  const load = useCallback(async (wanted?: Guide["role"]) => {
    setLoading(true);
    setFailed(false);
    headingY.current = {};
    const saved = wanted ? await storage.getItem<string>(cacheKey(wanted), "") : "";
    if (saved) {
      try {
        setGuide(JSON.parse(saved) as Guide);
        setLoading(false);
      } catch {
        // a damaged copy is ignored
      }
    }
    try {
      const fresh = await api.getGuide(wanted);
      setGuide(fresh);
      setOffline(false);
      await storage.setItem(cacheKey(fresh.role), JSON.stringify(fresh));
    } catch {
      if (!saved) {
        // first time and no connection: the last guide opened (own role) may still be saved
        setFailed(true);
      } else {
        setOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(ownRole);
  }, [load, ownRole]);

  const contents = useMemo(
    () => (guide?.markdown.match(/^## .+$/gm) ?? []).map((h) => h.replace(/^## /, "").trim()),
    [guide]
  );

  const rules = useMemo(
    () => ({
      image: (node: ASTNode) => (
        <GuideImage key={node.key} uri={guideImageUrl(node.attributes.src)} alt={node.attributes.alt} onOpen={setZoom} />
      ),
      heading2: (node: ASTNode, children: React.ReactNode, _parent: ASTNode[], mdStyles: Record<string, object>) => (
        <View
          key={node.key}
          onLayout={(e) => {
            headingY.current[textOf(node).trim()] = e.nativeEvent.layout.y;
          }}
        >
          <Text style={mdStyles.heading2}>{children}</Text>
        </View>
      ),
    }),
    []
  );

  const roleLabel: Record<Guide["role"], string> = {
    operator: t("guideRoleOperator"),
    warehouse: t("guideRoleWarehouse"),
    admin: t("guideRoleAdmin"),
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="guide-back" onPress={() => router.back()} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{guide?.title || t("guide")}</Text>
      </View>

      {guide && guide.available_roles.length > 1 && (
        <View style={styles.roleRow}>
          {guide.available_roles.map((r) => (
            <Pressable
              key={r}
              testID={`guide-role-${r}`}
              onPress={() => load(r)}
              style={[styles.chip, guide.role === r && styles.chipActive]}
            >
              <Text style={[styles.chipText, guide.role === r && styles.chipTextActive]}>{roleLabel[r]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading && !guide ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : failed || !guide ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Text style={styles.muted}>{t("guideUnavailable")}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl }}
        >
          {lang === "en" && <Text style={styles.notice}>{t("guideSerbianOnly")}</Text>}
          {offline && <Text style={styles.notice}>{t("guideOffline")}</Text>}
          {guide.version ? <Text style={styles.version}>v{guide.version}</Text> : null}

          {contents.length > 0 && (
            <View style={styles.toc}>
              <Text style={styles.tocTitle}>{t("guideContents")}</Text>
              {contents.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    const y = headingY.current[c];
                    if (y != null) scroll.current?.scrollTo({ y: bodyY.current + y - spacing.sm, animated: true });
                  }}
                >
                  <Text style={styles.tocItem}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
            <Markdown
              style={markdownStyles}
              rules={rules}
              markdownit={MarkdownIt({ typographer: false }).enable("table")}
              onLinkPress={(url) => {
                Linking.openURL(url).catch(() => {});
                return false;
              }}
            >
              {guide.markdown}
            </Markdown>
          </View>
        </ScrollView>
      )}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoom(null)}>
          <ScrollView contentContainerStyle={{ padding: spacing.md }} maximumZoomScale={4} minimumZoomScale={1}>
            {zoom && <GuideImage uri={zoom} onOpen={() => setZoom(null)} />}
          </ScrollView>
          <View style={[styles.zoomClose, { top: insets.top + spacing.md }]}>
            <Ionicons name="close" size={28} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  body: { fontSize: font.base, lineHeight: 22, color: colors.onSurface },
  heading1: { fontSize: font.xxl, fontWeight: "800", color: colors.brand, marginTop: spacing.md, marginBottom: spacing.sm },
  heading2: {
    fontSize: font.xl, fontWeight: "800", color: colors.brand, marginTop: spacing.xl, marginBottom: spacing.sm,
    paddingBottom: spacing.xs, borderBottomWidth: 2, borderBottomColor: colors.brandSecondary,
  },
  heading3: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.xs },
  strong: { fontWeight: "700" },
  blockquote: {
    backgroundColor: "#FFF7ED", borderLeftWidth: 4, borderLeftColor: "#F97316", borderRadius: radius.sm,
    paddingHorizontal: spacing.md, marginVertical: spacing.md,
  },
  code_inline: { backgroundColor: colors.surfaceTertiary, borderRadius: 4, paddingHorizontal: 4 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginVertical: spacing.md },
  th: { padding: spacing.sm, fontWeight: "700", backgroundColor: colors.brandSecondary },
  td: { padding: spacing.sm },
  tr: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row" },
  hr: { backgroundColor: "transparent", height: 4 },
  bullet_list: { marginVertical: spacing.xs },
  ordered_list: { marginVertical: spacing.xs },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  roleRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: font.sm, fontWeight: "700", color: colors.onSurfaceSecondary },
  chipTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  muted: { color: colors.muted },
  notice: { color: colors.warning, fontSize: font.sm, fontWeight: "700", marginBottom: spacing.sm },
  version: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.sm },
  toc: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  tocTitle: { fontSize: font.sm, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  tocItem: { fontSize: font.base, color: colors.brand, fontWeight: "600", paddingVertical: 2 },
  imageWrap: { width: "100%", alignSelf: "stretch", marginVertical: spacing.md, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  zoomBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center" },
  zoomClose: { position: "absolute", right: spacing.md },
});
