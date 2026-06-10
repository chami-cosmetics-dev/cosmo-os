import { useMemo } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { DeliveryCard } from "@/src/components/delivery-card";
import { EmptyState } from "@/src/components/empty-state";
import { HeroBanner } from "@/src/components/hero-banner";
import { SyncStatusBanner } from "@/src/components/sync-status-banner";
import { useDeliveries } from "@/src/hooks/use-deliveries";
import { useSync } from "@/src/providers/sync";
import { useTheme } from "@/src/providers/theme";

export default function DeliveriesScreen() {
  const router = useRouter();
  const { flushQueue, pendingCount } = useSync();
  const { activeDeliveries, refreshing, reload } = useDeliveries();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
      >
        <HeroBanner compact eyebrow="Live Route" title="Today's route">
          <SyncStatusBanner
            compact
            pendingCount={pendingCount}
            activeCount={activeDeliveries.length}
            onSync={() => void flushQueue()}
          />
        </HeroBanner>

        {activeDeliveries.map((delivery) => (
          <DeliveryCard
            key={`${delivery.tenant}:${delivery.id}`}
            compact
            delivery={delivery}
            onPress={() => router.push(`/delivery/${delivery.tenant}/${delivery.id}`)}
          />
        ))}

        {activeDeliveries.length === 0 ? (
          <EmptyState
            title="No orders for today"
            message="Today's assigned deliveries will appear here first."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24, gap: 8 },
  });
}
