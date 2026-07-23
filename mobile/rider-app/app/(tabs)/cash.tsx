import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DatePickerModal } from "@/src/components/date-picker-modal";
import { EmptyState } from "@/src/components/empty-state";
import { useCashSummaries } from "@/src/hooks/use-cash-summary";
import { useHandoverHistory } from "@/src/hooks/use-handover-history";
import { useTheme } from "@/src/providers/theme";
import type { TenantCashSummary } from "@/src/hooks/use-cash-summary";
import {
  formatCompletedDateChipLabel,
  getCompletedDateKey,
  getUniqueDateKeys,
  isTodayDateKey,
} from "@/src/utils/completed-dates";
import { formatMoney, parseMoney } from "@/src/utils/money";
import { submitOrQueue } from "@/src/utils/submit-or-queue";
import { APP_TIME_ZONE } from "@/src/constants/app";

function formatHandoverCalendarDate(value: string) {
  return new Date(value).toLocaleDateString("en-LK", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function formatHandoverSubmittedAt(value: string) {
  return new Date(value).toLocaleString("en-LK", { timeZone: APP_TIME_ZONE });
}

function HandoverPreview({
  summary,
  showPreview,
  onTogglePreview,
}: {
  summary: TenantCashSummary;
  showPreview: boolean;
  onTogglePreview: () => void;
}) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createPreviewStyles(colors, radii, shadows), [colors, radii, shadows]);

  return (
    <View style={styles.card}>
      <Pressable style={styles.toggle} onPress={onTogglePreview}>
        <Text style={styles.toggleText}>{showPreview ? "Hide preview" : "Preview handover"}</Text>
        <Feather name={showPreview ? "chevron-up" : "chevron-down"} size={14} color={colors.brand} />
      </Pressable>
      {showPreview ? (
        <View style={styles.wrap}>
          <Text style={styles.heading}>Orders</Text>
          {(summary.orders ?? []).map((order) => (
            <View key={order.paymentId} style={styles.row}>
              <View style={styles.meta}>
                <Text style={styles.title}>{order.orderLabel}</Text>
                <Text style={styles.sub}>{order.companyLocationName}</Text>
              </View>
              <Text style={styles.amount}>{formatMoney(order.collectedAmount)}</Text>
            </View>
          ))}
          <Text style={styles.heading}>Location totals</Text>
          {summary.groups.map((group) => (
            <View key={group.companyLocationId} style={styles.row}>
              <View style={styles.meta}>
                <Text style={styles.title}>{group.companyLocationName}</Text>
                <Text style={styles.sub}>{group.orderCount} orders</Text>
              </View>
              <Text style={styles.amount}>{formatMoney(group.cashAmount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total handover</Text>
            <Text style={styles.totalValue}>{formatMoney(summary.totalCollectedCash)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CompanyCashBlock({
  summary,
  onSubmitted,
}: {
  summary: TenantCashSummary;
  onSubmitted: () => void;
}) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createBlockStyles(colors, radii, shadows), [colors, radii, shadows]);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasCashFlow = parseMoney(summary.totalCollectedCash) > 0;

  async function submitHandover() {
    setSubmitting(true);
    try {
      const result = await submitOrQueue({
        tenant: summary.tenant,
        endpoint: "/api/mobile/v1/handovers",
        body: {
          totalHandedOverCash: Number(summary.totalCollectedCash),
          idempotencyKey: `handover-${summary.tenant}-${Date.now()}`,
        },
        queuedMessage: "Handover was added to the sync queue.",
      });

      if (result.mode === "live") {
        Alert.alert("Submitted", "Handover was submitted successfully.");
      } else {
        Alert.alert("Queued", result.message);
      }
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasCashFlow) {
    return (
      <EmptyState
        title={`No cash flow for ${summary.companyLabel}`}
        message="Today's collected cash and handover summary will appear here when COD orders are completed."
      />
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.companyTitle}>{summary.companyLabel}</Text>
      <View style={styles.shiftCard}>
        <Text style={styles.shiftEyebrow}>Cash Flow</Text>
        <View style={styles.shiftHeader}>
          <Text style={styles.shiftTitle}>Shift Balance</Text>
          <View style={styles.shiftIcon}>
            <Feather name="file-text" size={14} color={colors.white} />
          </View>
        </View>
        <Text style={styles.shiftValue}>{formatMoney(summary.totalCollectedCash)}</Text>
        <View style={styles.shiftMetaRow}>
          <Text style={styles.shiftMetaLabel}>Expected</Text>
          <Text style={styles.shiftMetaValue}>{formatMoney(summary.totalExpectedCash)}</Text>
          <Text style={styles.shiftMetaLabel}>Collected</Text>
          <Text style={styles.shiftMetaValue}>{formatMoney(summary.totalCollectedCash)}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Breakdown by Hub</Text>
        <Text style={styles.sectionMeta}>Allocations</Text>
      </View>

      {summary.groups.map((group) => (
        <View key={group.companyLocationId} style={styles.breakdownCard}>
          <View style={styles.breakdownTop}>
            <View style={styles.breakdownMain}>
              <View style={styles.breakdownIcon}>
                <Feather name="map-pin" size={12} color={colors.textMuted} />
              </View>
              <View style={styles.breakdownBody}>
                <Text style={styles.breakdownTitle}>{group.companyLocationName}</Text>
                <Text style={styles.breakdownSub}>Physical Cash</Text>
              </View>
            </View>
            <Text style={styles.breakdownAmount}>{formatMoney(group.cashAmount)}</Text>
          </View>
          <View style={styles.breakdownFooter}>
            <Text style={styles.breakdownFooterLabel}>Orders ({group.orderCount})</Text>
          </View>
        </View>
      ))}

      <View style={styles.verificationCard}>
        <View style={styles.verificationIcon}>
          <Feather name="shield" size={13} color={colors.brand} />
        </View>
        <View style={styles.verificationBody}>
          <Text style={styles.verificationTitle}>Handover Verification</Text>
          <Text style={styles.verificationText}>
            Review every cash group before you submit to avoid a mismatch in the ledger.
          </Text>
        </View>
      </View>

      <HandoverPreview
        summary={summary}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((current) => !current)}
      />

      <Pressable
        style={[styles.submitButton, submitting ? styles.buttonDisabled : null]}
        onPress={() => void submitHandover()}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : <Feather name="check-circle" size={15} color={colors.white} />}
        <Text style={styles.submitButtonText}>{submitting ? "Submitting..." : `Submit ${summary.companyLabel} handover`}</Text>
      </Pressable>
    </View>
  );
}

export default function CashScreen() {
  const { summaries, totalCollectedCash, totalExpectedCash, refreshing, reload } = useCashSummaries();
  const { handovers, reload: reloadHandovers } = useHandoverHistory();
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createPageStyles(colors, radii, shadows), [colors, radii, shadows]);
  const [selectedHandoverDate, setSelectedHandoverDate] = useState<string | null>(null);
  const [showHandoverDatePicker, setShowHandoverDatePicker] = useState(false);

  const todayHandovers = handovers.filter((handover) => isTodayDateKey(handover.handoverDate));
  const handoverDates = getUniqueDateKeys(handovers.map((handover) => handover.handoverDate));
  const filteredHandovers = selectedHandoverDate
    ? handovers.filter((handover) => getCompletedDateKey(handover.handoverDate) === selectedHandoverDate)
    : handovers.filter((handover) => !isTodayDateKey(handover.handoverDate));

  async function refreshAll() {
    await Promise.all([reload(), reloadHandovers()]);
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshAll()} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Cash Desk</Text>
          <Text style={styles.heroTitle}>Collected cash</Text>
          <Text style={styles.heroValue}>{formatMoney(totalCollectedCash)}</Text>
          <Text style={styles.heroSub}>Expected across companies: {formatMoney(totalExpectedCash)}</Text>
        </View>

        {summaries.map((summary) => (
          <CompanyCashBlock key={summary.tenant} summary={summary} onSubmitted={() => void refreshAll()} />
        ))}

        {summaries.length === 0 ? (
          <EmptyState title="No cash data" message="Sign in and complete COD deliveries to see collected cash here." />
        ) : null}

        {todayHandovers.length > 0 ? (
          <View style={styles.historyCard}>
            <Text style={styles.historyTitle}>Today&apos;s handovers</Text>
            {todayHandovers.map((handover) => (
              <View key={`${handover.tenant}-${handover.id}`} style={styles.historyRow}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>
                    {handover.companyLabel} · {formatHandoverCalendarDate(handover.handoverDate)}
                  </Text>
                  <Text style={styles.historyStatus}>{handover.status}</Text>
                </View>
                <Text style={styles.historyMeta}>
                  Submitted: {formatHandoverSubmittedAt(handover.submittedAt)}
                </Text>
                <Text style={styles.historyMeta}>
                  Total: {formatMoney(handover.totalHandedOverCash)} | Variance: {formatMoney(handover.varianceAmount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.historyCard}>
          <View style={styles.historyTools}>
            <Pressable style={styles.datePickerButton} onPress={() => setShowHandoverDatePicker(true)}>
              <Feather name="calendar" size={14} color={colors.text} />
              <Text style={styles.datePickerText}>
                {selectedHandoverDate ? formatCompletedDateChipLabel(selectedHandoverDate) : "Pick worked date"}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textSoft} />
            </Pressable>
            {selectedHandoverDate ? (
              <Pressable style={styles.historyReset} onPress={() => setSelectedHandoverDate(null)}>
                <Text style={styles.historyResetText}>Back to history</Text>
              </Pressable>
            ) : null}
          </View>

          {!selectedHandoverDate ? (
            <View style={styles.historyIntro}>
              <Text style={styles.historyIntroTitle}>Other history</Text>
              <Text style={styles.historyIntroSub}>Older handover records</Text>
            </View>
          ) : null}

          {filteredHandovers.map((handover) => (
            <View key={`${handover.tenant}-${handover.id}`} style={styles.historyRow}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>
                  {handover.companyLabel} · {formatHandoverCalendarDate(handover.handoverDate)}
                </Text>
                <Text style={styles.historyStatus}>{handover.status}</Text>
              </View>
              <Text style={styles.historyMeta}>
                Submitted: {formatHandoverSubmittedAt(handover.submittedAt)}
              </Text>
              <Text style={styles.historyMeta}>
                Total: {formatMoney(handover.totalHandedOverCash)} | Variance: {formatMoney(handover.varianceAmount)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <DatePickerModal
        visible={showHandoverDatePicker}
        title="Select worked date"
        dates={handoverDates}
        selectedDate={selectedHandoverDate}
        onClose={() => setShowHandoverDatePicker(false)}
        onSelect={setSelectedHandoverDate}
      />
    </SafeAreaView>
  );
}

function createPageStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 16, paddingBottom: 28 },
    hero: {
      borderRadius: radii.lg,
      backgroundColor: colors.heroBg,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
      ...shadows.card,
    },
    heroEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
    heroTitle: { color: colors.white, fontSize: 22, fontWeight: "800" },
    heroValue: { color: colors.white, fontSize: 34, fontWeight: "800", marginTop: 4, letterSpacing: -0.8 },
    heroSub: { color: "rgba(255,255,255,0.82)", fontSize: 14 },
    historyCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      ...shadows.card,
    },
    historyTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
    historyRow: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    historyHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    historyDate: { flex: 1, fontWeight: "800", color: colors.text },
    historyStatus: { color: colors.brand, fontWeight: "700", textTransform: "capitalize" },
    historyMeta: { color: colors.textMuted, lineHeight: 20 },
    historyTools: { gap: 8 },
    datePickerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    datePickerText: { flex: 1, color: colors.text, fontWeight: "700" },
    historyReset: { alignSelf: "flex-start" },
    historyResetText: { color: colors.brand, fontWeight: "700" },
    historyIntro: { gap: 4 },
    historyIntroTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
    historyIntroSub: { color: colors.textMuted },
  });
}

function createBlockStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    block: { gap: 12 },
    companyTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
    shiftCard: {
      borderRadius: radii.lg,
      backgroundColor: colors.heroBg,
      padding: 18,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    shiftEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
    shiftHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    shiftTitle: { color: colors.white, fontSize: 22, fontWeight: "800" },
    shiftIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    shiftValue: { color: colors.white, fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
    shiftMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
    shiftMetaLabel: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "700" },
    shiftMetaValue: { color: colors.white, fontWeight: "800", marginRight: 8 },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
    sectionMeta: { color: colors.textSoft, fontWeight: "700", fontSize: 12 },
    breakdownCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
      ...shadows.card,
    },
    breakdownTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
    breakdownMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    breakdownIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    breakdownBody: { flex: 1, gap: 2 },
    breakdownTitle: { fontWeight: "800", color: colors.text },
    breakdownSub: { color: colors.textMuted, fontSize: 12 },
    breakdownAmount: { fontWeight: "800", color: colors.emphasis, fontSize: 16 },
    breakdownFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
    breakdownFooterLabel: { color: colors.textSoft, fontSize: 12, fontWeight: "700" },
    verificationCard: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: colors.brandSoft,
      borderRadius: radii.md,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    verificationIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    verificationBody: { flex: 1, gap: 4 },
    verificationTitle: { fontWeight: "800", color: colors.text },
    verificationText: { color: colors.textMuted, lineHeight: 20 },
    submitButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: radii.md,
      backgroundColor: colors.brand,
      padding: 16,
      minHeight: 52,
    },
    buttonDisabled: { opacity: 0.75 },
    submitButtonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  });
}

function createPreviewStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      ...shadows.card,
    },
    toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleText: { color: colors.brand, fontWeight: "800" },
    wrap: { gap: 8 },
    heading: { fontWeight: "800", color: colors.textSoft, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
    row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    meta: { flex: 1, gap: 2 },
    title: { fontWeight: "700", color: colors.text },
    sub: { color: colors.textMuted, fontSize: 12 },
    amount: { fontWeight: "800", color: colors.emphasis },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderStrong },
    totalLabel: { fontWeight: "800", color: colors.text },
    totalValue: { fontWeight: "800", color: colors.brand, fontSize: 16 },
  });
}
