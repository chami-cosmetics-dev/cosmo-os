import { useMemo, useState } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { DeliveryCard } from "@/src/components/delivery-card";
import { EmptyState } from "@/src/components/empty-state";
import { HeroBanner } from "@/src/components/hero-banner";
import { SyncStatusBanner } from "@/src/components/sync-status-banner";
import { useDeliveries } from "@/src/hooks/use-deliveries";
import { useSync } from "@/src/providers/sync";
import { useTheme } from "@/src/providers/theme";
import { matchesDeliverySearch } from "@/src/utils/delivery-search";

export default function DeliveriesScreen() {
  const router = useRouter();
  const { flushQueue, pendingCount } = useSync();
  const { activeDeliveries, refreshing, reload } = useDeliveries();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredDeliveries = useMemo(
    () => activeDeliveries.filter((delivery) => matchesDeliverySearch(delivery, searchQuery)),
    [activeDeliveries, searchQuery]
  );

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

        <View style={styles.searchCard}>
          <Text style={styles.searchLabel}>Search order</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Order no / last 4 / customer / phone"
            placeholderTextColor={colors.textSoft}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {filteredDeliveries.map((delivery) => (
          <DeliveryCard
            key={`${delivery.tenant}:${delivery.id}`}
            compact
            delivery={delivery}
            onPress={() => router.push(`/delivery/${delivery.tenant}/${delivery.id}`)}
          />
        ))}

        {filteredDeliveries.length === 0 ? (
          <EmptyState
            title={activeDeliveries.length === 0 ? "No orders for today" : "No matching orders"}
            message={
              activeDeliveries.length === 0
                ? "Today's assigned deliveries will appear here first."
                : "Try order number, last 4 digits, customer name, or phone."
            }
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
    searchCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 6,
    },
    searchLabel: {
      color: colors.textMuted,
      fontWeight: "700",
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
    },
  });
}
