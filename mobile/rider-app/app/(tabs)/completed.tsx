import { useCallback, useEffect, useState } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiClient } from "@/src/api/client";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { colors, radii, shadows } from "@/src/theme";

type Delivery = {
  id: string;
  orderLabel: string;
  amount: string;
  deliveryStatus: string;
  completedAt?: string | null;
  customerName: string | null;
  companyLocation?: { name: string } | null;
};

function isRenderableDelivery(delivery: Delivery) {
  return (
    typeof delivery.id === "string" &&
    delivery.id.trim().length > 0 &&
    typeof delivery.orderLabel === "string" &&
    delivery.orderLabel.trim().length > 0 &&
    typeof delivery.amount === "string" &&
    delivery.amount.trim().length > 0
  );
}

export default function CompletedScreen() {
  const { completedDeliveries } = useCompletedDeliveries();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const data = await apiClient.get<{ deliveries: Delivery[] }>("/api/mobile/v1/deliveries");
      const remoteCompleted = data.deliveries.filter((delivery) => delivery.deliveryStatus === "completed");
      const merged = [...completedDeliveries, ...remoteCompleted]
        .filter(isRenderableDelivery)
        .filter(
        (delivery, index, all) => all.findIndex((item) => item.id === delivery.id) === index
      );
      setDeliveries(merged);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [completedDeliveries])
  );

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />} contentContainerStyle={styles.list}>
        <View style={styles.banner}>
          <View style={styles.bannerPill}>
            <Text style={styles.bannerPillText}>Archive</Text>
          </View>
          <Text style={styles.bannerTitle}>Completed deliveries</Text>
          <Text style={styles.bannerText}>Delivered orders appear here after payment is saved and completion is submitted.</Text>
        </View>
        {deliveries.map((delivery) => (
          <View key={delivery.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleWrap}>
                <Text style={styles.cardTitle}>{delivery.orderLabel}</Text>
                <Text style={styles.cardMeta}>{delivery.customerName ?? "Unknown customer"}</Text>
              </View>
              <View style={styles.completedBadge}>
                <Text style={styles.completedBadgeText}>Done</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardAmount}>{delivery.amount}</Text>
              <Text style={styles.cardStatus}>
                {delivery.completedAt ? new Date(delivery.completedAt).toLocaleString("en-LK") : "Just now"}
              </Text>
            </View>
          </View>
        ))}
        {deliveries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No completed orders</Text>
            <Text style={styles.emptyText}>Orders will appear here once the rider collects money and submits delivery.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  banner: {
    marginTop: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.slate,
    padding: 20,
    ...shadows.card,
  },
  bannerPill: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 12,
  },
  bannerPillText: { color: colors.white, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  bannerTitle: { color: colors.white, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  bannerText: { color: "#d9e3ef", marginTop: 8, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    ...shadows.card,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitleWrap: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  cardMeta: { color: colors.textMuted, lineHeight: 20 },
  completedBadge: {
    backgroundColor: colors.slateSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  completedBadgeText: { color: colors.slate, fontSize: 12, fontWeight: "800" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cardAmount: { fontSize: 22, fontWeight: "800", color: colors.brand },
  cardStatus: { color: colors.textSoft, textAlign: "right", flexShrink: 1 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  emptyText: { color: colors.textMuted, marginTop: 6, lineHeight: 20 },
});
