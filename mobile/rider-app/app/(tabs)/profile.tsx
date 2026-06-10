import { useMemo } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { HeroBanner } from "@/src/components/hero-banner";
import { useAuth } from "@/src/providers/auth";
import { useTheme } from "@/src/providers/theme";
import type { ThemeSetting } from "@/src/storage/theme";

const APP_VERSION = "1.0.0";

function getInitials(name: string | null | undefined) {
  const parts = (name ?? "Rider").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const THEME_OPTIONS: Array<{ value: ThemeSetting; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { colors, radii, shadows, themeSetting, setThemeSetting } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  function confirmLogout() {
    Alert.alert("Logout", "Sign out from this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => void handleLogout() },
    ]);
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroBanner eyebrow="Account" title="Profile" subtitle="Rider details, preferences, and session controls." />

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(session?.rider.name)}</Text>
          </View>
          <View style={styles.profileBody}>
            <Text style={styles.profileName}>{session?.rider.name?.trim() || "Rider"}</Text>
            <Text style={styles.profileMeta}>{session?.rider.email ?? "No email on file"}</Text>
            <Text style={styles.profileMeta}>{session?.rider.mobile ?? "No mobile number"}</Text>
            <Text style={styles.profileMeta}>{session?.rider.company?.name ?? "No company assigned"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preferences</Text>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Appearance</Text>
            <Text style={styles.menuSub}>Choose light, dark, or follow the device setting.</Text>
            <View style={styles.optionRow}>
              {THEME_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.optionChip, themeSetting === option.value ? styles.optionChipActive : null]}
                  onPress={() => void setThemeSetting(option.value)}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      themeSetting === option.value ? styles.optionChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>App info</Text>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Cosmo Rider</Text>
            <Text style={styles.menuSub}>Version {APP_VERSION}</Text>
          </View>
        </View>

        <Pressable style={styles.logoutButton} onPress={confirmLogout}>
          <Text style={styles.logoutText}>Logout from device</Text>
        </Pressable>
      </ScrollView>
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
    content: { padding: 16, gap: 16, paddingBottom: 28 },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      gap: 14,
      alignItems: "center",
      ...shadows.card,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.brand, fontWeight: "800", fontSize: 18 },
    profileBody: { flex: 1, gap: 4 },
    profileName: { fontSize: 20, fontWeight: "800", color: colors.text },
    profileMeta: { color: colors.textMuted, lineHeight: 20 },
    section: { gap: 8 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textSoft,
    },
    menuCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
      ...shadows.card,
    },
    menuTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
    menuSub: { color: colors.textMuted, lineHeight: 20 },
    optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    optionChip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surfaceMuted,
    },
    optionChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    optionChipText: { color: colors.textMuted, fontWeight: "700" },
    optionChipTextActive: { color: colors.white },
    logoutButton: {
      marginTop: 8,
      borderRadius: radii.md,
      backgroundColor: colors.dangerSoft,
      padding: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    logoutText: { color: colors.danger, fontWeight: "800" },
  });
}
