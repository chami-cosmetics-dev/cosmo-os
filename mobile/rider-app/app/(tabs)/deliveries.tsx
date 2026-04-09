import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { apiClient } from "@/src/api/client";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { useSync } from "@/src/providers/sync";
import { colors, radii, shadows } from "@/src/theme";

type Delivery = {
  id: string;
  orderLabel: string;
  amount: string;
  deliveryStatus: "assigned" | "accepted" | "arrived" | "completed" | "failed";
  customerName: string | null;
  companyLocation?: { name: string } | null;
  payment: {
    collectionStatus: string;
    collectedAmount: string;
  } | null;
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

export default function DeliveriesScreen() {
  const router = useRouter();
  const { completedDeliveries } = useCompletedDeliveries();
  const { flushQueue, pendingCount } = useSync();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const data = await apiClient.get<{ deliveries: Delivery[] }>("/api/mobile/v1/deliveries");
      setDeliveries(data.deliveries);
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
    }, [])
  );

  const completedIds = new Set(completedDeliveries.map((delivery) => delivery.id));
  const activeStatuses = new Set<Delivery["deliveryStatus"]>(["assigned", "accepted", "arrived"]);
  const activeDeliveries = deliveries.filter(
    (delivery) =>
      isRenderableDelivery(delivery) &&
      activeStatuses.has(delivery.deliveryStatus) &&
      !completedIds.has(delivery.id)
  );
  const syncLabel =
    pendingCount === 0 ? "All offline actions are synced." : `${pendingCount} offline action(s) waiting to sync.`;

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.banner}>
        <View style={styles.bannerPill}>
          <Text style={styles.bannerPillText}>Live Route</Text>
        </View>
        <Text style={styles.bannerTitle}>Today's route</Text>
        <Text style={styles.bannerText}>{syncLabel}</Text>
        <View style={styles.bannerStats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeDeliveries.length}</Text>
            <Text style={styles.statLabel}>Active stops</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Waiting sync</Text>
          </View>
        </View>
        <Pressable style={styles.syncButton} onPress={() => void flushQueue()}>
          <Text style={styles.syncButtonText}>Sync now</Text>
        </Pressable>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />} contentContainerStyle={styles.list}>
        {activeDeliveries.map((delivery) => (
          <Pressable key={delivery.id} style={styles.card} onPress={() => router.push(`/delivery/${delivery.id}`)}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleWrap}>
                <Text style={styles.cardTitle}>{delivery.orderLabel}</Text>
                <Text style={styles.cardMeta}>{delivery.customerName ?? "Unknown customer"}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{delivery.deliveryStatus}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardAmount}>{delivery.amount}</Text>
              <Text style={styles.cardHint}>
                {delivery.payment ? `Payment ${delivery.payment.collectionStatus}` : "Open delivery"}
              </Text>
            </View>
          </Pressable>
        ))}
        {activeDeliveries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active deliveries</Text>
            <Text style={styles.emptyText}>Completed orders move to the Completed tab automatically.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  banner: {
    margin: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
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
  bannerPillText: { color: colors.white, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  bannerTitle: { color: colors.white, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  bannerText: { color: "#d5e8df", marginTop: 8, lineHeight: 21, fontSize: 14 },
  bannerStats: { flexDirection: "row", gap: 10, marginTop: 16 },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radii.md,
    padding: 14,
  },
  statValue: { color: colors.white, fontSize: 24, fontWeight: "800" },
  statLabel: { color: "#d5e8df", marginTop: 4, fontSize: 12 },
  syncButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  syncButtonText: { color: colors.text, fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    ...shadows.card,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  cardTitleWrap: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  cardMeta: { color: colors.textMuted, lineHeight: 20 },
  badge: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: { color: colors.brand, textTransform: "capitalize", fontWeight: "800", fontSize: 12 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 2 },
  cardAmount: { fontSize: 22, fontWeight: "800", color: colors.brand },
  cardHint: { color: colors.textSoft, fontSize: 13, flexShrink: 1, textAlign: "right" },
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
