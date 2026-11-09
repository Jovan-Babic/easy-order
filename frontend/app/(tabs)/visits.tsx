import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api, ApiError, DueRow, Visit, VisitSuggestion } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

type Mode = "today" | "week" | "due";

// Dates are plain YYYY-MM-DD strings from the phone's calendar.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return iso(new Date(y, m - 1, d + n));
};
const mondayOf = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return iso(new Date(y, m - 1, d - ((date.getDay() + 6) % 7)));
};
const dmy = (s: string | null) => (s ? s.split("-").reverse().join(".") + "." : "");
const WEEKDAY: Record<"sr" | "en", string[]> = {
  sr: ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const detailOf = (e: unknown) => {
  if (e instanceof ApiError) {
    try {
      const body = JSON.parse(e.detail);
      return typeof body.detail === "string" ? body.detail : e.detail;
    } catch {
      return e.detail;
    }
  }
  return "";
};

export default function VisitsScreen() {
  const { t, lang, showToast } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = iso(new Date());
  const week = mondayOf(today);

  const [mode, setMode] = useState<Mode>("today");
  const [plan, setPlan] = useState<Visit[]>([]);
  const [due, setDue] = useState<DueRow[]>([]);
  const [suggestion, setSuggestion] = useState<VisitSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  // note dialog: marking done (note optional) or skipping (reason required)
  const [dialog, setDialog] = useState<{ visit: Visit; action: "done" | "skip" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const [p, d] = await Promise.all([api.visitsPlan(addDays(today, -14), addDays(week, 6)), api.visitsDue(7)]);
      setPlan(p);
      setDue(d);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today, week]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const behind = plan.filter((v) => v.status === "planned" && v.date < today);
  const todays = plan.filter((v) => v.date === today);
  const weeks = plan.filter((v) => v.date >= week);

  const confirmDialog = async () => {
    if (!dialog) return;
    if (dialog.action === "skip" && !note.trim()) return;
    setBusy(true);
    try {
      if (dialog.action === "done") await api.visitDone(dialog.visit.id, { note: note.trim() || undefined });
      else await api.visitSkip(dialog.visit.id, note.trim());
      setDialog(null);
      setNote("");
      showToast(t("visitsSaved"));
      await load();
    } catch (e) {
      Alert.alert(detailOf(e) || t("visitsSaved"));
    } finally {
      setBusy(false);
    }
  };

  const openMaps = (v: { street: string; city: string; address?: string }) => {
    const query = [v.street, v.city].filter(Boolean).join(", ") || v.address || "";
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`).catch(() => {});
  };

  const suggest = async () => {
    try {
      setSuggestion(await api.visitsSuggest(today, addDays(week, 6)));
    } catch (e) {
      Alert.alert(detailOf(e));
    }
  };
  const acceptSuggestion = async () => {
    if (!suggestion) return;
    try {
      await api.visitsAdd(suggestion.days.flatMap((d) => d.items.map((r) => ({ customer_id: r.customer_id, date: d.date }))));
      setSuggestion(null);
      await load();
    } catch (e) {
      Alert.alert(detailOf(e));
    }
  };
  const addToToday = async (r: DueRow) => {
    try {
      await api.visitsAdd([{ customer_id: r.customer_id, date: today }]);
      showToast(t("visitsAddedToday"));
      await load();
    } catch (e) {
      Alert.alert(detailOf(e));
    }
  };

  const statusText = { planned: t("visitsStatusPlanned"), done: t("visitsStatusDone"), skipped: t("visitsStatusSkipped") } as const;
  const statusColor = { planned: colors.muted, done: colors.success, skipped: colors.warning } as const;
  const dueText = (r: DueRow) =>
    r.last_visit === null && r.days_overdue > 0
      ? `${t("visitsNeverVisited")} · ${t("visitsLate").replace("{n}", String(r.days_overdue))}`
      : r.days_overdue > 0
      ? t("visitsLate").replace("{n}", String(r.days_overdue))
      : r.days_overdue === 0
      ? t("visitsDueToday")
      : t("visitsDueIn").replace("{n}", String(-r.days_overdue));

  const renderVisit = (v: Visit) => {
    const call = v.channel === "call";
    return (
      <View key={v.id} style={styles.card} testID={`visit-${v.id}`}>
        <View style={styles.cardHead}>
          <Ionicons name={call ? "call-outline" : "storefront-outline"} size={20} color={colors.brand} />
          <Text style={styles.cardTitle} numberOfLines={2}>{v.customer_name}</Text>
          <Text style={[styles.status, { color: statusColor[v.status] }]}>{statusText[v.status]}</Text>
        </View>
        <Text style={styles.sub}>{[v.street, v.city].filter(Boolean).join(", ") || v.address}</Text>
        <View style={styles.metaRow}>
          {v.zone_name && <Text style={styles.chip}>{v.zone_name}</Text>}
          <Text style={styles.meta}>{v.last_order ? t("visitsLastOrder").replace("{d}", dmy(v.last_order)) : t("visitsNoOrderYet")}</Text>
        </View>
        {v.date !== today && <Text style={styles.meta}>{WEEKDAY[lang][(new Date(v.date).getDay() + 6) % 7]}, {dmy(v.date)}</Text>}
        {v.note && <Text style={styles.note}>„{v.note}“</Text>}
        {v.status === "planned" && (
          <View style={styles.actions}>
            {v.phone ? (
              <Action icon="call" label={t("visitsCall")} onPress={() => Linking.openURL(`tel:${v.phone}`).catch(() => {})} />
            ) : null}
            {!call && <Action icon="navigate" label={t("visitsNavigate")} onPress={() => openMaps(v)} />}
            <Action icon="cart" label={t("visitsOrder")} onPress={() => router.navigate({ pathname: "/", params: { customer: v.customer_id, visit: v.id } })} />
            <Action icon="checkmark-circle" label={call ? t("visitsCalled") : t("visitsDone")} primary onPress={() => { setNote(""); setDialog({ visit: v, action: "done" }); }} />
            <Action icon="close-circle-outline" label={t("visitsSkip")} onPress={() => { setNote(""); setDialog({ visit: v, action: "skip" }); }} />
          </View>
        )}
      </View>
    );
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{t("visits")}</Text>
        <View style={styles.segment}>
          {(["today", "week", "due"] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segBtnOn]} testID={`visits-mode-${m}`}>
              <Text style={[styles.segText, mode === m && styles.segTextOn]}>{m === "today" ? t("visitsToday") : m === "week" ? t("visitsWeek") : t("visitsDue")}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : failed ? (
        <View style={styles.center}><Ionicons name="cloud-offline-outline" size={48} color={colors.muted} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {mode === "today" && (
            <>
              {behind.length > 0 && (
                <>
                  <Text style={styles.section}>{t("visitsBehind")}</Text>
                  {behind.map(renderVisit)}
                </>
              )}
              {todays.length === 0 && behind.length === 0 && <Text style={styles.empty}>{t("visitsNothingToday")}</Text>}
              {todays.map(renderVisit)}
            </>
          )}

          {mode === "week" && (
            <>
              <Pressable style={styles.suggestBtn} onPress={suggest} testID="visits-suggest">
                <Ionicons name="sparkles-outline" size={18} color={colors.onBrand} />
                <Text style={styles.suggestText}>{t("visitsSuggestWeek")}</Text>
              </Pressable>
              {suggestion && (
                <View style={[styles.card, { borderColor: colors.brand, borderWidth: 1 }]}>
                  <Text style={styles.meta}>{t("visitsSuggestionHint")}</Text>
                  {suggestion.days.length === 0 && <Text style={styles.empty}>{t("visitsNothingDue")}</Text>}
                  {suggestion.days.map((d) => (
                    <View key={d.date} style={{ marginTop: spacing.sm }}>
                      <Text style={styles.cardTitle}>{WEEKDAY[lang][(new Date(d.date).getDay() + 6) % 7]}, {dmy(d.date)}</Text>
                      {d.items.map((r) => (
                        <Text key={r.customer_id} style={styles.sub}>• {r.name}{r.zone_name ? ` (${r.zone_name})` : ""}</Text>
                      ))}
                    </View>
                  ))}
                  <View style={[styles.actions, { marginTop: spacing.md }]}>
                    <Action icon="checkmark" label={t("visitsAcceptSuggestion")} primary onPress={acceptSuggestion} />
                    <Action icon="close" label={t("visitsDiscard")} onPress={() => setSuggestion(null)} />
                  </View>
                </View>
              )}
              {weekDays.map((d) => {
                const list = weeks.filter((v) => v.date === d);
                if (list.length === 0) return null;
                return (
                  <View key={d}>
                    <Text style={styles.section}>{WEEKDAY[lang][(new Date(d).getDay() + 6) % 7]}, {dmy(d)}</Text>
                    {list.map(renderVisit)}
                  </View>
                );
              })}
              {weeks.length === 0 && !suggestion && <Text style={styles.empty}>{t("visitsNothingToday")}</Text>}
            </>
          )}

          {mode === "due" && (
            <>
              {due.length === 0 && <Text style={styles.empty}>{t("visitsNothingDue")}</Text>}
              {due.map((r) => (
                <View key={r.customer_id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Ionicons name={r.channel === "call" ? "call-outline" : "storefront-outline"} size={20} color={colors.brand} />
                    <Text style={styles.cardTitle} numberOfLines={2}>{r.name}</Text>
                  </View>
                  <Text style={styles.sub}>{[r.street, r.city].filter(Boolean).join(", ")}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.chip}>{r.zone_name ?? t("visitsNoZone")}</Text>
                    <Text style={[styles.meta, r.days_overdue > 0 && { color: colors.error, fontWeight: "800" }]}>{dueText(r)}</Text>
                  </View>
                  {r.planned.map((p) => (
                    <Text key={p.visit_id} style={styles.warn}>{t("visitsInPlanOf").replace("{name}", p.user_name).replace("{date}", dmy(p.date))}</Text>
                  ))}
                  <View style={styles.actions}>
                    <Action icon="add-circle-outline" label={t("visitsAddToday")} onPress={() => addToToday(r)} />
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>{dialog?.visit.customer_name}</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={dialog?.action === "skip" ? t("visitsSkipReason") : t("visitsNote")}
              multiline
              maxLength={500}
              style={styles.input}
              testID="visit-note-input"
            />
            <View style={styles.actions}>
              <Action icon="checkmark" primary label={dialog?.action === "skip" ? t("visitsSkip") : t("visitsDone")} onPress={confirmDialog} disabled={busy || (dialog?.action === "skip" && !note.trim())} />
              <Action icon="close" label={t("visitsDiscard")} onPress={() => setDialog(null)} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Action({ icon, label, onPress, primary, disabled }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.action, primary && styles.actionPrimary, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={16} color={primary ? colors.onBrand : colors.brand} />
      <Text style={[styles.actionText, primary && { color: colors.onBrand }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.pill },
  segBtnOn: { backgroundColor: colors.brand },
  segText: { fontWeight: "700", color: colors.onSurfaceSecondary },
  segTextOn: { color: colors.onBrand },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { fontSize: font.sm, fontWeight: "800", color: colors.muted, textTransform: "uppercase", marginTop: spacing.sm, marginBottom: spacing.sm },
  empty: { color: colors.muted, fontSize: font.base, marginVertical: spacing.lg },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: font.base, fontWeight: "800", color: colors.onSurface },
  status: { fontSize: font.sm, fontWeight: "800" },
  sub: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs, flexWrap: "wrap" },
  chip: { fontSize: font.sm, color: colors.brand, backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, overflow: "hidden" },
  meta: { fontSize: font.sm, color: colors.muted },
  note: { fontSize: font.sm, color: colors.muted, fontStyle: "italic", marginTop: spacing.xs },
  warn: { fontSize: font.sm, color: colors.warning, marginTop: spacing.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  action: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  actionPrimary: { backgroundColor: colors.brand },
  actionText: { fontSize: font.sm, fontWeight: "700", color: colors.brand },
  suggestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.lg },
  suggestText: { color: colors.onBrand, fontWeight: "800", fontSize: font.base },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, minHeight: 72, textAlignVertical: "top", color: colors.onSurface },
});
