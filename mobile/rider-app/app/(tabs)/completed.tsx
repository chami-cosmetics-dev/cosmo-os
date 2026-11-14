import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CompletedDeliveryCard } from "@/src/components/completed-delivery-card";
import { DatePickerModal } from "@/src/components/date-picker-modal";
import { EmptyState } from "@/src/components/empty-state";
import { useCompletedDeliveriesList } from "@/src/hooks/use-completed-deliveries-list";
import { useTheme } from "@/src/providers/theme";
import {
  formatCompletedDateChipLabel,
  getRecentHistoryDateKeys,
  groupByCompletedDate,
} from "@/src/utils/completed-dates";
import { parseMoney } from "@/src/utils/money";

export default function CompletedScreen() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { deliveries, refreshing, loadingMore, hasMore, reload, loadMore } =
    useCompletedDeliveriesList(selectedDate);
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  const historyDates = useMemo(() => getRecentHistoryDateKeys(60), []);
  const revenue = deliveries.reduce((sum, delivery) => sum + parseMoney(delivery.amount), 0);
  const sections = groupByCompletedDate(deliveries);
  const viewingHistory = Boolean(selectedDate);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 180;
          if (nearBottom) void loadMore();
        }}
        scrollEventThrottle={400}
      >
        <View style={styles.overview}>
          <Text style={styles.overviewEyebrow}>Overview</Text>
          <View style={styles.overviewHeader}>
            <Text style={styles.overviewTitle}>Completed deliveries</Text>
            <View style={styles.overviewIcon}>
              <Feather name="calendar" size={14} color={colors.white} />
            </View>
          </View>
          <View style={styles.overviewStats}>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewLabel}>
                {selectedDate ? formatCompletedDateChipLabel(selectedDate) : "Total today"}
              </Text>
              <Text style={styles.overviewValue}>{deliveries.length}</Text>
            </View>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewLabel}>Revenue</Text>
              <Text style={styles.overviewValue}>Rs. {revenue.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.historyTools}>
          <Pressable style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
            <Feather name="calendar" size={14} color={colors.text} />
            <Text style={styles.datePickerText}>
              {selectedDate ? formatCompletedDateChipLabel(selectedDate) : "View history date"}
            </Text>
            <Feather name="chevron-down" size={14} color={colors.textSoft} />
          </Pressable>
          {selectedDate ? (
            <Pressable style={styles.historyReset} onPress={() => setSelectedDate(null)}>
              <Text style={styles.historyResetText}>Back to today</Text>
            </Pressable>
          ) : null}
        </View>

        {sections.map((section) => (
          <View key={`day-${section.title}`} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((delivery) => (
              <CompletedDeliveryCard key={`${delivery.tenant}:${delivery.id}`} delivery={delivery} />
            ))}
          </View>
        ))}

        {hasMore ? (
          <Pressable style={styles.loadMore} onPress={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </Pressable>
        ) : null}

        {deliveries.length === 0 ? (
          <EmptyState
            title={viewingHistory ? "No history for this date" : "No completed orders today"}
            message={
              viewingHistory
                ? "No completed deliveries were found for the selected date."
                : "Today's completed deliveries will appear here. Pick a history date to load older days."
            }
          />
        ) : null}
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        title="Select history date"
        dates={historyDates}
        selectedDate={selectedDate}
        overviewLabel="Today"
        onClose={() => setShowDatePicker(false)}
        onSelect={setSelectedDate}
      />
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
    list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
    overview: {
      marginTop: 16,
      borderRadius: radii.lg,
      backgroundColor: colors.heroBg,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      ...shadows.card,
    },
    overviewEyebrow: {
      color: "rgba(255,255,255,0.72)",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    overviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    overviewTitle: { color: colors.white, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
    overviewIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    overviewStats: { flexDirection: "row", gap: 10 },
    overviewStat: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: radii.md,
      padding: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    overviewLabel: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "700" },
    overviewValue: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 4 },
    section: { gap: 10 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textSoft,
      marginTop: 4,
    },
    historyTools: { gap: 8, marginTop: 8 },
    datePickerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    datePickerText: { flex: 1, color: colors.text, fontWeight: "700" },
    historyReset: { alignSelf: "flex-start" },
    historyResetText: { color: colors.brand, fontWeight: "700" },
    loadMore: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: 4,
    },
    loadMoreText: { color: colors.brand, fontWeight: "700" },
  });
}
