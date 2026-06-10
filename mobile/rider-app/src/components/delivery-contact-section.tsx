import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/providers/theme";
import { getAddressText, openDirections, openPhoneCall, openSmsMessage } from "@/src/utils/contact";

type DeliveryContactSectionProps = {
  customerName: string | null;
  customerPhone: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
};

export function DeliveryMapCard(props: DeliveryContactSectionProps) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createMapStyles(colors, radii), [colors, radii]);
  const address = getAddressText(props);

  return (
    <Pressable style={styles.mapCard} onPress={() => void openDirections(address)}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={styles.destination}>
        <Feather name="navigation" size={12} color={colors.brand} />
        <Text style={styles.destinationText}>Destination</Text>
      </View>
    </Pressable>
  );
}

export function DeliveryContactSection(props: DeliveryContactSectionProps) {
  const { colors, radii, resolvedMode } = useTheme();
  const styles = useMemo(() => createContactStyles(colors, radii), [colors, radii]);
  const isDarkMode = resolvedMode === "dark";
  const address = getAddressText(props);

  return (
    <>
      <View style={styles.sectionCard}>
        <Text style={styles.addressTitle}>{address}</Text>
        <View style={styles.actionStack}>
          <Pressable style={styles.actionCard} onPress={() => void openDirections(address)}>
            <View style={styles.actionIcon}>
              <Feather name="map-pin" size={14} color={isDarkMode ? "#dbe6f7" : colors.slate} />
            </View>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Open map</Text>
              <Text style={styles.actionText}>Navigate to this delivery address.</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>Customer information</Text>
        <View style={styles.customerRow}>
          <View style={styles.customerAvatar}>
            <Feather name="user" size={16} color={colors.brand} />
          </View>
          <View style={styles.customerBody}>
            <Text style={styles.customerName}>{props.customerName ?? "Unknown customer"}</Text>
            <Text style={styles.customerMeta}>{props.customerPhone ?? "Tap for phone"}</Text>
          </View>
        </View>
        <View style={styles.dualActions}>
          <Pressable style={styles.ghostButton} onPress={() => void openPhoneCall(props.customerPhone)}>
            <Feather name="phone-call" size={14} color={colors.brand} />
            <Text style={styles.ghostButtonText}>Call Customer</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={() => void openSmsMessage(props.customerPhone)}>
            <Feather name="message-square" size={14} color={isDarkMode ? "#dbe6f7" : colors.slate} />
            <Text style={styles.ghostButtonTextAlt}>Message</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function createMapStyles(colors: ReturnType<typeof useTheme>["colors"], radii: typeof import("@/src/theme").radii) {
  return StyleSheet.create({
    mapCard: {
      height: 120,
      borderRadius: radii.lg,
      backgroundColor: colors.heroBg,
      overflow: "hidden",
      justifyContent: "flex-end",
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    glowA: {
      position: "absolute",
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: "rgba(111, 99, 217, 0.35)",
      top: -20,
      right: -10,
    },
    glowB: {
      position: "absolute",
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: "rgba(107, 200, 214, 0.25)",
      bottom: -20,
      left: 20,
    },
    destination: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    destinationText: { color: colors.white, fontWeight: "700", fontSize: 11 },
  });
}

function createContactStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii
) {
  return StyleSheet.create({
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    addressTitle: { fontSize: 16, fontWeight: "800", color: colors.text, lineHeight: 24 },
    actionStack: { gap: 10 },
    actionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.sm,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    actionBody: { flex: 1, gap: 2 },
    actionTitle: { fontWeight: "800", color: colors.text },
    actionText: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    sectionLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textSoft },
    customerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    customerAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    customerBody: { flex: 1, gap: 4 },
    customerName: { fontSize: 16, fontWeight: "800", color: colors.text },
    customerMeta: { color: colors.textMuted },
    dualActions: { flexDirection: "row", gap: 10 },
    ghostButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: radii.sm,
      paddingVertical: 12,
      backgroundColor: colors.brandSoft,
    },
    ghostButtonText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
    ghostButtonTextAlt: { color: colors.text, fontWeight: "800", fontSize: 13 },
  });
}
