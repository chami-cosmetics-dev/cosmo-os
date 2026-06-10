import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/providers/theme";

type SyncStatusBannerProps = {
  pendingCount: number;
  activeCount: number;
  onSync: () => void;
};

export function SyncStatusBanner({ pendingCount, activeCount, onSync }: SyncStatusBannerProps) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii), [colors, radii]);
  const syncLabel =
    pendingCount === 0 ? "All offline actions are synced." : `${pendingCount} offline action(s) waiting to sync.`;

  return (
    <>
      <Text style={styles.subtitle}>{syncLabel}</Text>
      <View style={styles.stats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active stops</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Waiting sync</Text>
        </View>
      </View>
      <Pressable style={styles.syncButton} onPress={onSync}>
        <Text style={styles.syncButtonText}>Sync now</Text>
      </Pressable>
    </>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"], radii: typeof import("@/src/theme").radii) {
  return StyleSheet.create({
    subtitle: { color: "rgba(255,255,255,0.76)", marginTop: 8, lineHeight: 20, fontSize: 14 },
    stats: { flexDirection: "row", gap: 10, marginTop: 16 },
    statCard: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderRadius: radii.md,
      padding: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    statValue: { color: colors.white, fontSize: 22, fontWeight: "800" },
    statLabel: { color: "rgba(255,255,255,0.72)", marginTop: 4, fontSize: 11 },
    syncButton: {
      marginTop: 16,
      alignSelf: "flex-start",
      borderRadius: radii.sm,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    syncButtonText: { color: colors.slate, fontWeight: "800", fontSize: 13 },
  });
}
