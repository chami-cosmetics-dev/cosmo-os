import { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiClient } from "@/src/api/client";
import { queueAction } from "@/src/storage/offline-queue";
import { colors, radii, shadows } from "@/src/theme";

type CashSummary = {
  totalExpectedCash: string;
  totalCollectedCash: string;
  groups: Array<{
    companyLocationId: string;
    companyLocationName: string;
    cashAmount: string;
    orderCount: number;
  }>;
};

export default function CashScreen() {
  const [summary, setSummary] = useState<CashSummary | null>(null);

  async function load() {
    const data = await apiClient.get<CashSummary>("/api/mobile/v1/cash-summary");
    setSummary(data);
  }

  async function submitHandover() {
    if (!summary) return;
    await queueAction({
      endpoint: "/api/mobile/v1/handovers",
      method: "POST",
      body: {
        totalHandedOverCash: Number(summary.totalCollectedCash),
        idempotencyKey: `handover-${Date.now()}`,
      },
    });
    Alert.alert("Queued", "Handover submission was added to the sync queue.");
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>Cash Desk</Text>
          </View>
          <Text style={styles.heroLabel}>Collected cash</Text>
          <Text style={styles.heroValue}>{summary?.totalCollectedCash ?? "0.00"}</Text>
          <Text style={styles.heroSub}>Expected: {summary?.totalExpectedCash ?? "0.00"}</Text>
        </View>
        {summary?.groups.map((group) => (
          <View key={group.companyLocationId} style={styles.row}>
            <View style={styles.rowMetaBlock}>
              <Text style={styles.rowTitle}>{group.companyLocationName}</Text>
              <Text style={styles.rowMeta}>{group.orderCount} orders</Text>
            </View>
            <Text style={styles.rowAmount}>{group.cashAmount}</Text>
          </View>
        ))}
        <Pressable style={styles.button} onPress={() => void submitHandover()}>
          <Text style={styles.buttonText}>Submit handover</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  hero: {
    backgroundColor: colors.danger,
    borderRadius: radii.lg,
    padding: 20,
    ...shadows.card,
  },
  heroPill: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginBottom: 12,
  },
  heroPillText: { color: colors.white, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  heroLabel: { color: "#f6dede", fontSize: 15 },
  heroValue: { color: colors.white, fontSize: 34, fontWeight: "800", marginTop: 8, letterSpacing: -0.8 },
  heroSub: { color: "#f8e8e8", marginTop: 6, fontSize: 15 },
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
  rowAmount: { color: colors.brand, fontWeight: "800", fontSize: 20 },
  button: {
    marginTop: 8,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    padding: 17,
    alignItems: "center",
  },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
});
