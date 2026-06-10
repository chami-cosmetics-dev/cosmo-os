import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
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
import { colors, radii, shadows } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        email,
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
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <Text style={styles.eyebrowText}>Rider Workspace</Text>
          </View>
          <Text style={styles.title}>Cosmo Rider</Text>
          <Text style={styles.subtitle}>
            Delivery updates, payment collection, and cash handovers.
          </Text>
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
                secureTextEntry={true}
                placeholder="........"
                placeholderTextColor={colors.textSoft}
                value={password}
                onChangeText={setPassword}
                editable={!submitting}
              />
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
          <Pressable style={styles.button} onPress={() => void handleLogin()} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? "Signing In..." : "Sign In"}</Text>
            <Feather name="arrow-right" size={17} color={colors.white} />
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f4f5fa" },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 28, justifyContent: "center" },
  hero: { marginBottom: 22, alignItems: "center" },
  eyebrow: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#dde7fb",
    marginBottom: 14,
  },
  eyebrowText: { color: "#5f77a5", fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { fontSize: 28, fontWeight: "800", color: "#22314d", letterSpacing: -0.8 },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: "#7b8193", maxWidth: 290, textAlign: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "#eef0f5",
    ...shadows.card,
  },
  fieldGroup: { gap: 8 },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#7f8495",
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#eef2ff",
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
  utilityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ccd3df",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.slate,
    borderColor: colors.slate,
  },
  utilityText: { fontSize: 13, color: "#7b8193" },
  resetText: { fontSize: 13, fontWeight: "700", color: "#7a75dd" },
  button: {
    backgroundColor: colors.slate,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
  },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, marginTop: -4, fontSize: 13 },
  footer: { marginTop: 20, alignItems: "center", gap: 8 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  footerText: { color: "#82889a", fontSize: 10.5 },
  footerDivider: { color: "#c2c7d1", fontSize: 10.5 },
  footerMeta: { color: "#afb4c1", fontSize: 10, fontWeight: "600", textAlign: "center", maxWidth: 280 },
});
