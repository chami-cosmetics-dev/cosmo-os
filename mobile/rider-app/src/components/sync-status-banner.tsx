import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/providers/theme";

type SyncStatusBannerProps = {
  pendingCount: number;
  activeCount: number;
  onSync: () => void;
  compact?: boolean;
};

export function SyncStatusBanner({ pendingCount, activeCount, onSync, compact }: SyncStatusBannerProps) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, compact), [colors, radii, compact]);
  const needsSync = pendingCount > 0;
  const syncLabel = needsSync
    ? `${pendingCount} waiting to sync`
    : compact
      ? "All synced"
      : "All offline actions are synced.";

  return (
    <View style={styles.wrap}>
      {compact ? (
        <View style={styles.compactRow}>
          <View style={styles.compactStats}>
            <Text style={styles.compactStat}>
              <Text style={styles.compactStatValue}>{activeCount}</Text> stops
            </Text>
            <Text style={styles.compactDivider}>·</Text>
            <Text style={[styles.compactStat, needsSync ? styles.compactStatWarn : null]}>{syncLabel}</Text>
          </View>
          {needsSync ? (
            <Pressable style={styles.compactSyncButton} onPress={onSync}>
              <Text style={styles.compactSyncText}>Sync</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
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
      )}
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  compact?: boolean
) {
  return StyleSheet.create({
    wrap: { marginTop: compact ? 8 : 0 },
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
    syncButtonText: { color: colors.onAccentSoft, fontWeight: "800", fontSize: 13 },
    compactRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    compactStats: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    compactStat: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "600" },
    compactStatValue: { color: colors.white, fontWeight: "800", fontSize: 14 },
    compactStatWarn: { color: "#ffd4a8" },
    compactDivider: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
    compactSyncButton: {
      borderRadius: radii.sm,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    compactSyncText: { color: colors.onAccentSoft, fontWeight: "800", fontSize: 12 },
  });
}
