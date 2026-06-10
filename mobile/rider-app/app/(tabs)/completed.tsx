import { useMemo } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { CompletedDeliveryCard } from "@/src/components/completed-delivery-card";
import { EmptyState } from "@/src/components/empty-state";
import { HeroBanner } from "@/src/components/hero-banner";
import { useCompletedDeliveriesList } from "@/src/hooks/use-completed-deliveries-list";
import { useTheme } from "@/src/providers/theme";

export default function CompletedScreen() {
  const { deliveries, refreshing, reload } = useCompletedDeliveriesList();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
      >
        <View style={styles.bannerWrap}>
          <HeroBanner
            eyebrow="Archive"
            title="Completed deliveries"
            subtitle="Delivered orders appear here after payment is saved and completion is submitted."
          />
        </View>
        {deliveries.map((delivery) => (
          <CompletedDeliveryCard key={`${delivery.tenant}:${delivery.id}`} delivery={delivery} />
        ))}
        {deliveries.length === 0 ? (
          <EmptyState
            title="No completed orders"
            message="Orders will appear here once the rider collects money and submits delivery."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
    bannerWrap: { marginTop: 16 },
  });
}
