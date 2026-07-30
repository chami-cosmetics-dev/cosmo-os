import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { EmptyState } from "@/src/components/empty-state";
import { HeroBanner } from "@/src/components/hero-banner";
import { SyncStatusBanner } from "@/src/components/sync-status-banner";
import { useRiderPerformance } from "@/src/hooks/use-rider-performance";
import { useSync } from "@/src/providers/sync";
import { useTheme } from "@/src/providers/theme";
import type { RiderPerformancePeriodKind } from "@/src/types/performance";
import { formatMoney } from "@/src/utils/money";

export default function PerformanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { flushQueue, pendingCount } = useSync();
  const [period, setPeriod] = useState<RiderPerformancePeriodKind>("current");
  const { data, periodLabel, refreshing, reload } = useRiderPerformance(period);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
      >
        <HeroBanner
          compact
          eyebrow="My pay"
          title="Performance"
          subtitle={periodLabel ?? "Set payday in Cosmo OS settings to see your pay period."}
        >
          <SyncStatusBanner
            compact
            pendingCount={pendingCount}
            activeCount={data.todayCompletedCount}
            onSync={() => void flushQueue()}
          />
        </HeroBanner>

        <View style={styles.periodRow}>
          <Pressable
            style={[styles.periodChip, period === "current" && styles.periodChipActive]}
            onPress={() => setPeriod("current")}
          >
            <Text style={[styles.periodChipText, period === "current" && styles.periodChipTextActive]}>
              Current period
            </Text>
          </Pressable>
          <Pressable
            style={[styles.periodChip, period === "previous" && styles.periodChipActive]}
            onPress={() => setPeriod("previous")}
          >
            <Text style={[styles.periodChipText, period === "previous" && styles.periodChipTextActive]}>
              Previous period
            </Text>
          </Pressable>
        </View>

        {!data.paydayConfigured ? (
          <EmptyState
            title="Payday not configured"
            message="Ask ops to set the rider payday day of month in Cosmo OS Settings. Today’s deliveries can still show below once configured."
          />
        ) : (
          <>
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Completed</Text>
                <Text style={styles.statValue}>{data.completedCount ?? 0}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Failed</Text>
                <Text style={styles.statValue}>{data.failedCount ?? 0}</Text>
              </View>
              <View style={[styles.stat, styles.statWide]}>
                <Text style={styles.statLabel}>Incentive</Text>
                <Text style={styles.statValue}>{formatMoney(data.incentiveTotal)}</Text>
              </View>
            </View>

            {pendingCount > 0 ? (
              <Text style={styles.pendingNote}>
                {pendingCount} delivery action(s) still syncing — totals may update after sync.
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Deliveries this period</Text>
            {data.lines.length === 0 ? (
              <EmptyState
                title="No completions yet this pay period"
                message="When you complete deliveries, shipping amounts will add to your incentive here."
              />
            ) : (
              data.lines.map((line) => (
                <View key={`${line.tenant ?? "t"}:${line.taskId}`} style={styles.lineCard}>
                  <View style={styles.lineTop}>
                    <Text style={styles.lineOrder}>{line.orderLabel}</Text>
                    <Text style={styles.lineIncentive}>{formatMoney(line.incentiveAmount)}</Text>
                  </View>
                  {line.companyLabel ? <Text style={styles.lineMeta}>{line.companyLabel}</Text> : null}
                  {line.completedAt ? (
                    <Text style={styles.lineMeta}>
                      {new Date(line.completedAt).toLocaleString("en-LK")}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24, gap: 10 },
    periodRow: { flexDirection: "row", gap: 8 },
    periodChip: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 10,
      alignItems: "center",
    },
    periodChipActive: {
      borderColor: colors.brand,
      backgroundColor: colors.surface,
    },
    periodChipText: { color: colors.textSoft, fontWeight: "700", fontSize: 13 },
    periodChipTextActive: { color: colors.brand },
    statsCard: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    stat: { width: "30%", gap: 4 },
    statWide: { width: "100%", marginTop: 4 },
    statLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    statValue: { color: colors.text, fontSize: 22, fontWeight: "800" },
    pendingNote: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
    sectionTitle: { color: colors.text, fontWeight: "800", fontSize: 15, marginTop: 4 },
    lineCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 4,
    },
    lineTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    lineOrder: { color: colors.text, fontWeight: "800", flex: 1 },
    lineIncentive: { color: colors.brand, fontWeight: "800" },
    lineMeta: { color: colors.textMuted, fontSize: 12 },
  });
}
