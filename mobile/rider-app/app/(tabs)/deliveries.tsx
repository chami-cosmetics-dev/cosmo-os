import { useMemo } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
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
      <View style={styles.bannerWrap}>
        <HeroBanner eyebrow="Live Route" title="Today's route">
          <SyncStatusBanner
            pendingCount={pendingCount}
            activeCount={activeDeliveries.length}
            onSync={() => void flushQueue()}
          />
        </HeroBanner>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
      >
        {activeDeliveries.map((delivery) => (
          <DeliveryCard
            key={delivery.id}
            delivery={delivery}
            onPress={() => router.push(`/delivery/${delivery.id}`)}
          />
        ))}
        {activeDeliveries.length === 0 ? (
          <EmptyState
            title="No active deliveries"
            message="Completed orders move to the Completed tab automatically."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    bannerWrap: { margin: 16, marginBottom: 0 },
    list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 12 },
  });
}
