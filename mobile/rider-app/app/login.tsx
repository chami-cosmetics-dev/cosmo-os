import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "@/src/config";
import { useAuth } from "@/src/providers/auth";
import { loadLoginPreferences, saveLoginPreferences } from "@/src/storage/login-preferences";
import { getConfiguredApiSummary } from "@/src/env";
import { getConfiguredTenants } from "@/src/tenants";
import { useTheme } from "@/src/providers/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { colors, radii, shadows, resolvedMode } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const companyHint = useMemo(() => {
    const tenants = getConfiguredTenants();
    if (tenants.length > 0) {
      return tenants.map((tenant) => tenant.label).join(" · ");
    }
    const summary = getConfiguredApiSummary();
    return [summary.cosmetics ? "Cosmetics.lk" : null, summary.vault ? "Supplement Vault" : null]
      .filter(Boolean)
      .join(" · ");
  }, []);

  useEffect(() => {
    loadLoginPreferences().then((prefs) => {
      if (prefs.email) {
        setEmail(prefs.email);
        setRememberMe(true);
      }
      if (prefs.deviceName) {
        setDeviceName(prefs.deviceName);
      }
    });
  }, []);

  async function handleForgotPassword() {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/login`);
    } catch {
      setError("Unable to open the password reset page.");
    }
  }

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await saveLoginPreferences({
        remember: rememberMe,
        email,
        deviceName,
      });
      await login({
        email: email.trim().toLowerCase(),
        password,
        deviceName: deviceName.trim() || "Rider phone",
      });
      router.replace("/(tabs)/deliveries");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleRememberMe() {
    const next = !rememberMe;
    setRememberMe(next);
    if (!next) {
      await saveLoginPreferences({ remember: false, email: "", deviceName: "" });
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle={resolvedMode === "dark" ? "light-content" : "dark-content"} backgroundColor={colors.bg} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <Text style={styles.eyebrowText}>Rider Workspace</Text>
          </View>
          <Text style={styles.title}>Cosmo Rider</Text>
          <Text style={styles.subtitle}>
            Delivery updates, payment collection, and cash handovers.
          </Text>
          {companyHint ? (
            <Text style={styles.apiHint}>Connected to: {companyHint}</Text>
          ) : (
            <Text style={styles.apiHint}>Backend URLs missing — contact admin</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputShell}>
              <Feather name="at-sign" size={16} color={colors.textSoft} />
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="name@cosmorider.com"
                placeholderTextColor={colors.textSoft}
                value={email}
                onChangeText={setEmail}
                editable={!submitting}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputShell}>
              <Feather name="lock" size={16} color={colors.textSoft} />
              <TextInput
                style={styles.input}
                secureTextEntry={!showPassword}
                placeholder="........"
                placeholderTextColor={colors.textSoft}
                value={password}
                onChangeText={setPassword}
                editable={!submitting}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={styles.visibilityToggle}
                onPress={() => setShowPassword((current) => !current)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.textSoft} />
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Device Identification</Text>
            <View style={styles.inputShell}>
              <Feather name="archive" size={16} color={colors.textSoft} />
              <TextInput
                style={styles.input}
                placeholder="e.g., Transit-Pad-04"
                placeholderTextColor={colors.textSoft}
                value={deviceName}
                onChangeText={setDeviceName}
                editable={!submitting}
              />
            </View>
          </View>

          <View style={styles.utilityRow}>
            <Pressable style={styles.checkboxRow} onPress={() => void toggleRememberMe()} disabled={submitting}>
              <View style={[styles.checkbox, rememberMe ? styles.checkboxChecked : null]}>
                {rememberMe ? <Feather name="check" size={12} color={colors.white} /> : null}
              </View>
              <Text style={styles.utilityText}>Remember me</Text>
            </Pressable>
            <Pressable onPress={() => void handleForgotPassword()} disabled={submitting}>
              <Text style={styles.resetText}>Forgot password</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, submitting ? styles.buttonDisabled : null]} onPress={() => void handleLogin()} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.white} /> : null}
            <Text style={styles.buttonText}>
              {submitting ? `Signing in to ${companyHint}…` : "Sign In"}
            </Text>
            {!submitting ? <Feather name="arrow-right" size={17} color={colors.white} /> : null}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Cosmo OS</Text>
            <Text style={styles.footerDivider}>|</Text>
            <Text style={styles.footerText}>Rider App</Text>
          </View>
          <Text style={styles.footerMeta}>Secure rider access for deliveries and cash handovers.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) =>
  StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 28, justifyContent: "center" },
  hero: { marginBottom: 22, alignItems: "center" },
  eyebrow: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.brandSoft,
    marginBottom: 14,
  },
  eyebrowText: { color: colors.brand, fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.8 },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.textMuted, maxWidth: 290, textAlign: "center" },
  apiHint: { marginTop: 10, fontSize: 12, lineHeight: 18, color: colors.textSoft, maxWidth: 300, textAlign: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  fieldGroup: { gap: 8 },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.textSoft,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  visibilityToggle: {
    padding: 4,
    marginRight: -4,
  },
  utilityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.heroBg,
    borderColor: colors.heroBg,
  },
  utilityText: { fontSize: 13, color: colors.textMuted },
  resetText: { fontSize: 13, fontWeight: "700", color: colors.brand },
  button: {
    backgroundColor: colors.heroBg,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.85 },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, marginTop: -4, fontSize: 13, lineHeight: 19 },
  footer: { marginTop: 20, alignItems: "center", gap: 8 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  footerText: { color: colors.textSoft, fontSize: 10.5 },
  footerDivider: { color: colors.borderStrong, fontSize: 10.5 },
  footerMeta: { color: colors.textSoft, fontSize: 10, fontWeight: "600", textAlign: "center", maxWidth: 280 },
});
