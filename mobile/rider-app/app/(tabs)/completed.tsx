import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { CompletedDeliveryCard } from "@/src/components/completed-delivery-card";
import { DatePickerModal } from "@/src/components/date-picker-modal";
import { EmptyState } from "@/src/components/empty-state";
import { useCompletedDeliveriesList } from "@/src/hooks/use-completed-deliveries-list";
import { useTheme } from "@/src/providers/theme";
import {
  formatCompletedDateChipLabel,
  getCompletedDateKey,
  getUniqueDateKeys,
  groupByCompletedDate,
  isTodayDateKey,
} from "@/src/utils/completed-dates";
import { parseMoney } from "@/src/utils/money";

export default function CompletedScreen() {
  const { deliveries, refreshing, reload } = useCompletedDeliveriesList();
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const todayDeliveries = deliveries.filter((delivery) => isTodayDateKey(delivery.completedAt));
  const todayRevenue = todayDeliveries.reduce((sum, delivery) => sum + parseMoney(delivery.amount), 0);
  const workedDates = getUniqueDateKeys(deliveries.map((delivery) => delivery.completedAt));

  const historyDeliveries = selectedDate
    ? deliveries.filter((delivery) => getCompletedDateKey(delivery.completedAt) === selectedDate)
    : deliveries.filter((delivery) => !isTodayDateKey(delivery.completedAt));

  const todaySections = groupByCompletedDate(todayDeliveries);
  const historySections = groupByCompletedDate(historyDeliveries);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
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
              <Text style={styles.overviewLabel}>Total today</Text>
              <Text style={styles.overviewValue}>{todayDeliveries.length}</Text>
            </View>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewLabel}>Revenue</Text>
              <Text style={styles.overviewValue}>Rs. {todayRevenue.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {todaySections.map((section) => (
          <View key={`today-${section.title}`} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((delivery) => (
              <CompletedDeliveryCard key={`${delivery.tenant}:${delivery.id}`} delivery={delivery} />
            ))}
          </View>
        ))}

        <View style={styles.historyTools}>
          <Pressable style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
            <Feather name="calendar" size={14} color={colors.text} />
            <Text style={styles.datePickerText}>
              {selectedDate ? formatCompletedDateChipLabel(selectedDate) : "Pick worked date"}
            </Text>
            <Feather name="chevron-down" size={14} color={colors.textSoft} />
          </Pressable>
          {selectedDate ? (
            <Pressable style={styles.historyReset} onPress={() => setSelectedDate(null)}>
              <Text style={styles.historyResetText}>Back to history</Text>
            </Pressable>
          ) : null}
        </View>

        {!selectedDate ? (
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Other history</Text>
            <Text style={styles.historySubtitle}>Older completed deliveries</Text>
          </View>
        ) : null}

        {historySections.map((section) => (
          <View key={`history-${section.title}`} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((delivery) => (
              <CompletedDeliveryCard key={`${delivery.tenant}:${delivery.id}`} delivery={delivery} />
            ))}
          </View>
        ))}

        {todayDeliveries.length === 0 && !selectedDate ? (
          <EmptyState
            title="No completed orders today"
            message="Today's completed deliveries will appear here first."
          />
        ) : null}

        {historyDeliveries.length === 0 ? (
          <EmptyState
            title={selectedDate ? "No history for this date" : "No delivery history yet"}
            message={
              selectedDate
                ? "No completed deliveries were found for the selected date."
                : "Older completed deliveries will appear here automatically."
            }
          />
        ) : null}
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        title="Select worked date"
        dates={workedDates}
        selectedDate={selectedDate}
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
    historyHeader: { gap: 4, marginTop: 4 },
    historyTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
    historySubtitle: { color: colors.textMuted },
  });
}
