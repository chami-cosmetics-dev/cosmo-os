import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/providers/auth";
import { colors, radii, shadows } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Rider phone");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password, deviceName });
      router.replace("/(tabs)/deliveries");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
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
            Delivery updates, payment collection, and cash handovers in one clean mobile workspace.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Text style={styles.cardCopy}>Use the rider account assigned to your device.</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            placeholder="Email"
            placeholderTextColor={colors.textSoft}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            secureTextEntry={true}
            placeholder="Password"
            placeholderTextColor={colors.textSoft}
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="Device name"
            placeholderTextColor={colors.textSoft}
            value={deviceName}
            onChangeText={setDeviceName}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? "Signing in..." : "Sign in"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hero: { marginBottom: 24 },
  eyebrow: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.brandSoft,
    marginBottom: 16,
  },
  eyebrowText: { color: colors.brand, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 40, fontWeight: "800", color: colors.text, letterSpacing: -1.2 },
  subtitle: { marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.textMuted, maxWidth: 340 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardTitle: { fontSize: 24, fontWeight: "800", color: colors.text },
  cardCopy: { fontSize: 14, color: colors.textMuted, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 15,
    backgroundColor: colors.surfaceMuted,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radii.sm,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  error: { color: colors.danger, marginTop: 4 },
});
