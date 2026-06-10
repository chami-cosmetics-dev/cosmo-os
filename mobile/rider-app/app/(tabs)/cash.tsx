import { useMemo } from "react";
import { Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { HeroBanner } from "@/src/components/hero-banner";
import { useCashSummaries } from "@/src/hooks/use-cash-summary";
import { queueAction } from "@/src/storage/offline-queue";
import { useTheme } from "@/src/providers/theme";

export default function CashScreen() {
  const { summaries, totalCollectedCash, totalExpectedCash, refreshing, reload } = useCashSummaries();
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  async function submitHandover(tenant: (typeof summaries)[number]["tenant"], totalCollected: string) {
    await queueAction({
      tenant,
      endpoint: "/api/mobile/v1/handovers",
      method: "POST",
      body: {
        totalHandedOverCash: Number(totalCollected),
        idempotencyKey: `handover-${tenant}-${Date.now()}`,
      },
    });
    Alert.alert("Queued", "Handover submission was added to the sync queue.");
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.content}
      >
        <HeroBanner eyebrow="Cash Desk" title="Collected cash">
          <Text style={styles.heroValue}>{totalCollectedCash}</Text>
          <Text style={styles.heroSub}>Expected: {totalExpectedCash}</Text>
        </HeroBanner>

        {summaries.map((summary) => (
          <View key={summary.tenant} style={styles.companyBlock}>
            <Text style={styles.companyTitle}>{summary.companyLabel}</Text>
            <View style={styles.companyTotals}>
              <Text style={styles.companyAmount}>{summary.totalCollectedCash}</Text>
              <Text style={styles.companyMeta}>Expected: {summary.totalExpectedCash}</Text>
            </View>
            {summary.groups.map((group) => (
              <View key={`${summary.tenant}-${group.companyLocationId}`} style={styles.row}>
                <View style={styles.rowMetaBlock}>
                  <Text style={styles.rowTitle}>{group.companyLocationName}</Text>
                  <Text style={styles.rowMeta}>{group.orderCount} orders</Text>
                </View>
                <Text style={styles.rowAmount}>{group.cashAmount}</Text>
              </View>
            ))}
            <Pressable
              style={styles.button}
              onPress={() => void submitHandover(summary.tenant, summary.totalCollectedCash)}
            >
              <Text style={styles.buttonText}>Submit {summary.companyLabel} handover</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 16, paddingBottom: 28 },
    heroValue: { color: colors.white, fontSize: 34, fontWeight: "800", marginTop: 8, letterSpacing: -0.8 },
    heroSub: { color: "rgba(255,255,255,0.82)", marginTop: 6, fontSize: 15 },
    companyBlock: { gap: 10 },
    companyTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
    companyTotals: { gap: 4 },
    companyAmount: { fontSize: 24, fontWeight: "800", color: colors.slate },
    companyMeta: { color: colors.textMuted },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      ...shadows.card,
    },
    rowMetaBlock: { flex: 1 },
    rowTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
    rowMeta: { color: colors.textMuted, marginTop: 4 },
    rowAmount: { color: colors.slate, fontWeight: "800", fontSize: 20 },
    button: {
      borderRadius: radii.md,
      backgroundColor: colors.slate,
      padding: 15,
      alignItems: "center",
    },
    buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  });
}
