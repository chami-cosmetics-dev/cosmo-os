import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";

import { apiClient } from "@/src/api/client";
import { AuthProvider, useAuth } from "@/src/providers/auth";
import { SyncProvider, useSync } from "@/src/providers/sync";
import { queueAction } from "@/src/storage/offline-queue";
import { loadThemeSetting, saveThemeSetting, type ThemeSetting } from "@/src/storage/theme";
import { darkColors, lightColors, shadows, type ThemeColors } from "@/src/theme";

type Delivery = {
  id: string;
  orderId?: string;
  orderLabel: string;
  orderNumber?: string | null;
  amount: string;
  currency?: string | null;
  deliveryStatus: string;
  completedAt?: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  expectedPaymentMethod?: PaymentMethod | null;
  companyLocation?: { name: string } | null;
  payment: {
    expectedAmount?: string;
    collectionStatus: string;
    collectedAmount: string;
    paymentMethod: PaymentMethod;
    referenceNote?: string | null;
    bankReference?: string | null;
    cardReference?: string | null;
  } | null;
  lineItems?: Array<{
    id: string;
    productTitle: string;
    quantity: number;
    price: string;
  }>;
};

type PaymentMethod = "cod" | "bank_transfer" | "card" | "already_paid";

type CashSummary = {
  totalExpectedCash: string;
  totalCollectedCash: string;
  groups: Array<{
    companyLocationId: string;
    companyLocationName: string;
    cashAmount: string;
    orderCount: number;
  }>;
  orders: Array<{
    paymentId: string;
    orderId: string;
    orderLabel: string;
    companyLocationId: string;
    companyLocationName: string;
    expectedAmount: string;
    collectedAmount: string;
    collectionStatus: string;
    collectedAt: string | null;
  }>;
};

const ACTIVE_DELIVERY_STATUSES = new Set(["assigned", "accepted", "arrived"]);
const ANDROID_STATUSBAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
const APP_TIME_ZONE = "Asia/Colombo";
const REMEMBERED_EMAIL_KEY = "cosmo-rider-remembered-email";

type ThemeContextValue = {
  colors: ThemeColors;
  styles: ReturnType<typeof createAppStyles>;
  resolvedMode: "light" | "dark";
  themeSetting: ThemeSetting;
  setThemeSetting: (next: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>("system");

  useEffect(() => {
    void loadThemeSetting().then(setThemeSettingState);
  }, []);

  const resolvedMode =
    themeSetting === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : themeSetting;

  const colors = resolvedMode === "dark" ? darkColors : lightColors;
  const styles = useMemo(() => createAppStyles(colors), [colors]);

  function setThemeSetting(next: ThemeSetting) {
    setThemeSettingState(next);
    void saveThemeSetting(next);
  }

  return (
    <ThemeContext.Provider
      value={{ colors, styles, resolvedMode, themeSetting, setThemeSetting }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within ThemeProvider");
  }
  return context;
}

function LoginView() {
  const { login } = useAuth();
  const { colors, styles, resolvedMode } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberTerminal, setRememberTerminal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBERED_EMAIL_KEY)
      .then((storedEmail) => {
        if (storedEmail?.trim()) {
          setEmail(storedEmail);
          setRememberTerminal(true);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!rememberTerminal) return;

    AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim()).catch(() => undefined);
  }, [email, rememberTerminal]);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      if (rememberTerminal && email.trim()) {
        await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      await login({ email, password, deviceName: "Rider phone" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/login`);
    } catch {
      setError("Unable to open the website login page.");
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar
        barStyle={resolvedMode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.bg}
      />
      <ScrollView contentContainerStyle={styles.loginScroll}>
        <View style={styles.loginHero}>
          <View style={styles.loginBadge}>
            <Text style={styles.loginBadgeText}>Rider Workspace</Text>
          </View>
          <Text style={styles.loginBrand}>Cosmo Rider</Text>
          <Text style={styles.loginCopy}>Delivery updates, payment collection, and cash handovers.</Text>
        </View>

        <View style={styles.loginCard}>
          <View style={styles.loginFieldGroup}>
            <Text style={styles.loginLabel}>Email Address</Text>
            <View style={styles.loginInputShell}>
              <Feather name="at-sign" size={16} color={colors.textSoft} />
              <TextInput
                style={styles.loginInput}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="name@cosmorider.com"
                value={email}
                onChangeText={setEmail}
                placeholderTextColor={colors.textSoft}
              />
            </View>
          </View>
          <View style={styles.loginFieldGroup}>
            <Text style={styles.loginLabel}>Password</Text>
            <View style={styles.loginInputShell}>
              <Feather name="lock" size={16} color={colors.textSoft} />
              <TextInput
                style={styles.loginInput}
                secureTextEntry={true}
                placeholder="........"
                value={password}
                onChangeText={setPassword}
                placeholderTextColor={colors.textSoft}
              />
            </View>
          </View>
          <View style={styles.loginUtilityRow}>
            <Pressable
              style={styles.loginCheckboxRow}
              onPress={async () => {
                const next = !rememberTerminal;
                setRememberTerminal(next);
                if (!next) {
                  await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
                } else if (email.trim()) {
                  await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
                }
              }}
            >
              <View style={[styles.loginCheckbox, rememberTerminal ? styles.loginCheckboxChecked : null]}>
                {rememberTerminal ? <Feather name="check" size={12} color={colors.white} /> : null}
              </View>
              <Text style={styles.loginUtilityText}>Remember me</Text>
            </Pressable>
            <Pressable onPress={() => void handleForgotPassword()}>
              <Text style={styles.loginResetText}>Forgot password</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? "Signing In..." : "Sign In"}</Text>
            <Feather name="arrow-right" size={17} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.loginFooter}>
          <View style={styles.loginFooterRow}>
            <Text style={styles.loginFooterText}>Cosmo OS</Text>
            <Text style={styles.loginFooterDivider}>|</Text>
            <Text style={styles.loginFooterText}>Rider App</Text>
          </View>
          <Text style={styles.loginFooterMeta}>Secure rider access for deliveries and cash handovers.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MainView() {
  const { logout, session } = useAuth();
  const { colors, styles, resolvedMode, themeSetting, setThemeSetting } = useAppTheme();
  const isDarkMode = resolvedMode === "dark";
  const { flushQueue, pendingCount, clearPendingQueue, queuedActions, refreshPendingQueue } = useSync();
  const [tab, setTab] = useState<"deliveries" | "completed" | "cash" | "profile">("deliveries");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [handoverHistory, setHandoverHistory] = useState<
    Array<{
      id: string;
      handoverDate: string;
      submittedAt: string;
      receivedAt: string | null;
      status: string;
      totalExpectedCash: string;
      totalHandedOverCash: string;
      varianceAmount: string;
      items: Array<{
        id: string;
        companyLocationId: string;
        companyLocationName: string;
        cashAmount: string;
        orderCount: number;
      }>;
    }>
  >([]);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState("");
  const [customerPaidAmount, setCustomerPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [showHandoverPreview, setShowHandoverPreview] = useState(false);
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);
  const [showLegacyCashHandover, setShowLegacyCashHandover] = useState(false);
  const [selectedCompletedDate, setSelectedCompletedDate] = useState<string | null>(null);
  const [showCompletedDatePicker, setShowCompletedDatePicker] = useState(false);
  const [selectedHandoverDate, setSelectedHandoverDate] = useState<string | null>(null);
  const [showHandoverDatePicker, setShowHandoverDatePicker] = useState(false);
  const previousPendingCount = useRef(0);

  async function submitOrQueue(params: {
    endpoint: string;
    body: Record<string, unknown>;
    queuedMessage: string;
  }) {
    const net = await NetInfo.fetch();
    const isOnline = !!net.isConnected && !!net.isInternetReachable;

    if (isOnline) {
      try {
        await apiClient.post(params.endpoint, params.body);
        return { mode: "live" as const };
      } catch {
        // Fall back to offline queue if the live request fails.
      }
    }

    await queueAction({
      endpoint: params.endpoint,
      method: "POST",
      body: params.body,
    });
    await refreshPendingQueue();
    return { mode: "queued" as const, message: params.queuedMessage };
  }

  function parseMoney(value: string | null | undefined) {
    const amount = Number.parseFloat(value ?? "");
    return Number.isFinite(amount) ? amount : 0;
  }

  function formatMoney(value: string | null | undefined, currency?: string | null) {
    const amount = parseMoney(value);
    const formatted = amount.toLocaleString("en-LK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return currency ? `Rs. ${formatted} ${currency}` : `Rs. ${formatted}`;
  }

  function getAddressText(delivery: Delivery | null) {
    const candidate = [delivery?.shippingAddress, delivery?.billingAddress].find(
      (value) => value && typeof value === "object"
    ) as
      | {
          address1?: string | null;
          address2?: string | null;
          city?: string | null;
          province?: string | null;
          zip?: string | null;
          country?: string | null;
          phone?: string | null;
        }
      | undefined;

    if (!candidate) return "No address";

    const parts = [
      candidate.address1,
      candidate.address2,
      candidate.city,
      candidate.province,
      candidate.zip,
      candidate.country,
    ]
      .map((item) => item?.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "No address";
  }

  async function openDirections(delivery: Delivery | null) {
    const address = getAddressText(delivery);
    if (!delivery || address === "No address") {
      Alert.alert("No address", "This delivery does not have a valid address for directions.");
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Maps unavailable", "No maps app is available on this phone.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open maps", "Please try again.");
    }
  }

  async function openPhoneCall(phone: string | null | undefined) {
    const trimmedPhone = phone?.trim();
    if (!trimmedPhone) {
      Alert.alert("No phone number", "This customer does not have a phone number.");
      return;
    }

    const url = `tel:${trimmedPhone}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to call", "Please try again.");
    }
  }

  async function openSmsMessage(phone: string | null | undefined) {
    const trimmedPhone = phone?.trim();
    if (!trimmedPhone) {
      Alert.alert("No phone number", "This customer does not have a phone number for messages.");
      return;
    }

    const url = `sms:${trimmedPhone}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open messages", "Please try again.");
    }
  }

  function getPaymentMethodLabel(method: PaymentMethod | null | undefined) {
    switch (method) {
      case "cod":
        return "Cash on Delivery";
      case "bank_transfer":
        return "Bank Transfer";
      case "card":
        return "Card Payment";
      case "already_paid":
        return "Online Transfer";
      default:
        return "Not set";
    }
  }

  function getRouteBadgeLabel(status: Delivery["deliveryStatus"]) {
    switch (status) {
      case "accepted":
        return "In transit";
      case "arrived":
        return "At stop";
      case "assigned":
        return "Next stop";
      default:
        return status.replace("_", " ");
    }
  }

  function getPriorityLabel(delivery: Delivery) {
    const method = delivery.expectedPaymentMethod ?? delivery.payment?.paymentMethod;
    switch (method) {
      case "cod":
        return "Cash on delivery";
      case "already_paid":
        return "Prepared order";
      case "bank_transfer":
        return "Bank transfer";
      case "card":
        return "Card payment";
      default:
        return "Open delivery";
    }
  }

  function isCashFlowDelivery(delivery: Delivery) {
    const method = delivery.payment?.paymentMethod ?? delivery.expectedPaymentMethod;
    return method === "cod";
  }

  function getZonedDateParts(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) return null;
    return { year, month, day, key: `${year}-${month}-${day}` };
  }

  function formatCompletedSectionLabel(value: string | null | undefined) {
    if (!value) return "Recent";
    const date = new Date(value);
    const targetParts = getZonedDateParts(date);
    const todayParts = getZonedDateParts(new Date());
    if (!targetParts || !todayParts) return "Recent";

    const todayStart = new Date(`${todayParts.key}T00:00:00`);
    const targetStart = new Date(`${targetParts.key}T00:00:00`);
    const diffDays = Math.round((todayStart.getTime() - targetStart.getTime()) / 86400000);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: APP_TIME_ZONE }).toUpperCase()}`;
    }

    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: APP_TIME_ZONE }).toUpperCase();
  }

  function formatCompletedTime(value: string | null | undefined) {
    if (!value) return "Just now";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: APP_TIME_ZONE,
    });
  }

  function getCompletedDateKey(value: string | null | undefined) {
    if (!value) return "unknown";
    const parts = getZonedDateParts(value);
    return parts?.key ?? "unknown";
  }

  function formatCompletedDateChipLabel(value: string | null) {
    if (!value) return "All dates";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "All dates";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: APP_TIME_ZONE,
    });
  }

  const bottomTabs: Array<{
    key: "deliveries" | "completed" | "cash" | "profile";
    label: string;
    icon: keyof typeof Feather.glyphMap;
  }> = [
    { key: "deliveries", label: "Route", icon: "navigation" },
    { key: "completed", label: "Completed", icon: "check-circle" },
    { key: "cash", label: "Cash", icon: "dollar-sign" },
    { key: "profile", label: "Profile", icon: "user" },
  ];

  function requiresReference(method: PaymentMethod) {
    return method === "bank_transfer" || method === "card";
  }

  function getRiderDisplayName() {
    return session?.rider.name?.trim() || session?.rider.email || "Rider";
  }

  function getRiderInitials() {
    const parts = getRiderDisplayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (parts.length === 0) return "R";
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  }

  async function loadDeliveries() {
    setRefreshing(true);
    try {
      const data = await apiClient.get<{ deliveries: Delivery[] }>("/api/mobile/v1/deliveries");
      setDeliveries(data.deliveries);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadSummary() {
    const data = await apiClient.get<CashSummary>("/api/mobile/v1/cash-summary");
    setSummary(data);
  }

  async function loadHandoverHistory() {
    const data = await apiClient.get<{
      handovers: Array<{
        id: string;
        handoverDate: string;
        submittedAt: string;
        receivedAt: string | null;
        status: string;
        totalExpectedCash: string;
        totalHandedOverCash: string;
        varianceAmount: string;
        items: Array<{
          id: string;
          companyLocationId: string;
          companyLocationName: string;
          cashAmount: string;
          orderCount: number;
        }>;
      }>;
    }>("/api/mobile/v1/handovers");
    setHandoverHistory(data.handovers ?? []);
  }

  async function loadDetail(deliveryId: string) {
    const data = await apiClient.get<{ delivery: Delivery }>(`/api/mobile/v1/deliveries/${deliveryId}`);
    setSelectedDelivery(data.delivery);
    const detectedMethod = data.delivery.payment?.paymentMethod ?? data.delivery.expectedPaymentMethod ?? "cod";
    setPaymentMethod(detectedMethod);
    setCollectedAmount(data.delivery.payment?.collectedAmount ?? "");
    setCustomerPaidAmount(data.delivery.payment?.collectedAmount ?? "");
    setPaymentReference(
      data.delivery.payment?.bankReference ??
        data.delivery.payment?.cardReference ??
        ""
    );
    setPaymentNote(data.delivery.payment?.referenceNote ?? "");
  }

  async function queueDelivered() {
    if (!selectedDelivery) return;
    setDeliverySubmitting(true);
    const expectedAmount = parseMoney(selectedDelivery.amount);
    const actualCollectedAmount =
      paymentMethod === "cod"
        ? parseMoney(collectedAmount)
        : parseMoney(collectedAmount || selectedDelivery.amount);

    if (paymentMethod === "cod" && actualCollectedAmount <= 0) {
      Alert.alert("Missing amount", "Enter the cash amount collected from the customer.");
      return;
    }

    if (paymentMethod !== "cod" && paymentMethod !== "already_paid" && actualCollectedAmount <= 0) {
      Alert.alert("Missing amount", "Enter the payment amount before completing.");
      return;
    }

    if (requiresReference(paymentMethod) && !paymentReference.trim()) {
      Alert.alert("Missing reference", "Enter the invoice/reference number before completing.");
      return;
    }

    try {
      const paymentResult = await submitOrQueue({
        endpoint: `/api/mobile/v1/deliveries/${selectedDelivery.id}/payment`,
        body: {
          paymentMethod,
          collectedAmount:
            paymentMethod === "already_paid" && actualCollectedAmount <= 0
              ? expectedAmount
              : actualCollectedAmount,
          bankReference: paymentMethod === "bank_transfer" ? paymentReference.trim() : undefined,
          cardReference: paymentMethod === "card" ? paymentReference.trim() : undefined,
          referenceNote: paymentNote.trim() || undefined,
          idempotencyKey: `payment-${selectedDelivery.id}-${Date.now()}`,
        },
        queuedMessage: "Payment was added to the sync queue.",
      });
      const completeResult = await submitOrQueue({
        endpoint: `/api/mobile/v1/deliveries/${selectedDelivery.id}/complete`,
        body: {
          idempotencyKey: `complete-${selectedDelivery.id}-${Date.now()}`,
        },
        queuedMessage: "Delivery completion was added to the sync queue.",
      });

      if (paymentResult.mode === "live" && completeResult.mode === "live") {
        const completedAt = new Date().toISOString();
        setDeliveries((current) =>
          current.map((delivery) =>
            delivery.id === selectedDelivery.id
              ? {
                  ...delivery,
                  deliveryStatus: "completed",
                  completedAt,
                  payment: {
                    expectedAmount: selectedDelivery.amount,
                    collectedAmount:
                      paymentMethod === "already_paid" && actualCollectedAmount <= 0
                        ? expectedAmount.toFixed(2)
                        : actualCollectedAmount.toFixed(2),
                    paymentMethod,
                    collectionStatus: "collected",
                    referenceNote: paymentNote.trim() || null,
                    bankReference:
                      paymentMethod === "bank_transfer" ? paymentReference.trim() || null : null,
                    cardReference:
                      paymentMethod === "card" ? paymentReference.trim() || null : null,
                  },
                }
              : delivery
          )
        );
        await loadDeliveries();
        await loadSummary();
        setSelectedDelivery(null);
        setTab("completed");
        Alert.alert("Order completed", "The order was completed successfully.");
        return;
      }

      Alert.alert("Queued", "Payment or delivery completion was added to the sync queue.");
      const completedAt = new Date().toISOString();
      setDeliveries((current) =>
        current.map((delivery) =>
          delivery.id === selectedDelivery.id
            ? {
                ...delivery,
                deliveryStatus: "completed",
                completedAt,
                payment: {
                  expectedAmount: selectedDelivery.amount,
                  collectedAmount:
                    paymentMethod === "already_paid" && actualCollectedAmount <= 0
                      ? expectedAmount.toFixed(2)
                      : actualCollectedAmount.toFixed(2),
                  paymentMethod,
                  collectionStatus: "collected",
                  referenceNote: paymentNote.trim() || null,
                  bankReference:
                    paymentMethod === "bank_transfer" ? paymentReference.trim() || null : null,
                  cardReference:
                    paymentMethod === "card" ? paymentReference.trim() || null : null,
                },
              }
            : delivery
        )
      );
      setSelectedDelivery(null);
      setTab("completed");
    } finally {
      setDeliverySubmitting(false);
    }
  }

  async function queueFailed() {
    if (!selectedDelivery) return;
    const result = await submitOrQueue({
      endpoint: `/api/mobile/v1/deliveries/${selectedDelivery.id}/fail`,
      body: {
        reason: failureReason || "Customer unavailable",
        idempotencyKey: `fail-${selectedDelivery.id}-${Date.now()}`,
      },
      queuedMessage: "Failed delivery was added to the sync queue.",
    });
    if (result.mode === "live") {
      await loadDeliveries();
      await loadSummary();
      setSelectedDelivery(null);
      Alert.alert("Updated", "Failed delivery was saved.");
      return;
    }
    setDeliveries((current) =>
      current.map((delivery) =>
        delivery.id === selectedDelivery.id
          ? {
              ...delivery,
              deliveryStatus: "failed",
            }
          : delivery
      )
    );
    setSelectedDelivery(null);
    Alert.alert("Queued", "Failed delivery was added to the sync queue.");
  }

  async function submitHandover() {
    if (!summary) return;
    setHandoverSubmitting(true);
    try {
      const result = await submitOrQueue({
        endpoint: "/api/mobile/v1/handovers",
        body: {
          totalHandedOverCash: Number(summary.totalCollectedCash),
          idempotencyKey: `handover-${Date.now()}`,
        },
        queuedMessage: "Handover was added to the sync queue.",
      });
      if (result.mode === "live") {
        await loadSummary();
        await loadHandoverHistory();
        setShowHandoverPreview(false);
        Alert.alert("Submitted", "Handover was submitted successfully.");
        return;
      }
      Alert.alert("Queued", "Handover was added to the sync queue.");
    } finally {
      setHandoverSubmitting(false);
    }
  }

  useEffect(() => {
    void loadDeliveries();
    void loadSummary();
    void loadHandoverHistory();
  }, []);

  const queuedDeliveryStates = useMemo(() => {
    const stateMap = new Map<string, { hasQueuedPayment: boolean; hasQueuedComplete: boolean; hasQueuedFail: boolean }>();

    for (const item of queuedActions) {
      const match = item.endpoint.match(/\/deliveries\/([^/]+)\/(payment|complete|fail)$/);
      if (!match) continue;

      const [, deliveryId, action] = match;
      const current = stateMap.get(deliveryId) ?? {
        hasQueuedPayment: false,
        hasQueuedComplete: false,
        hasQueuedFail: false,
      };

      if (action === "payment") current.hasQueuedPayment = true;
      if (action === "complete") current.hasQueuedComplete = true;
      if (action === "fail") current.hasQueuedFail = true;

      stateMap.set(deliveryId, current);
    }

    return stateMap;
  }, [queuedActions]);

  const activeDeliveries = deliveries.filter((delivery) => {
    const queuedState = queuedDeliveryStates.get(delivery.id);
    if (queuedState?.hasQueuedComplete || queuedState?.hasQueuedFail) return false;
    return ACTIVE_DELIVERY_STATUSES.has(delivery.deliveryStatus);
  });

  const completedDeliveries = deliveries.filter((delivery) => {
    const queuedState = queuedDeliveryStates.get(delivery.id);
    return delivery.deliveryStatus === "completed" || !!queuedState?.hasQueuedComplete;
  });
  const sortedCompletedDeliveries = [...completedDeliveries].sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bTime - aTime;
  });
  const completedWorkedDates = [
    ...new Set(
      sortedCompletedDeliveries
        .map((delivery) => getCompletedDateKey(delivery.completedAt))
        .filter((value) => value !== "unknown")
    ),
  ];
  const todayCompletedDateKey = getCompletedDateKey(new Date().toISOString());
  const todayCompletedDeliveries = sortedCompletedDeliveries.filter(
    (delivery) => getCompletedDateKey(delivery.completedAt) === todayCompletedDateKey
  );
  const todayCompletedRevenue = todayCompletedDeliveries.reduce((sum, delivery) => sum + parseMoney(delivery.amount), 0);
  const historyCompletedDeliveries = sortedCompletedDeliveries.filter(
    (delivery) => getCompletedDateKey(delivery.completedAt) !== todayCompletedDateKey
  );
  const filteredCompletedDeliveries = selectedCompletedDate
    ? sortedCompletedDeliveries.filter((delivery) => getCompletedDateKey(delivery.completedAt) === selectedCompletedDate)
    : historyCompletedDeliveries;
  const filteredCompletedRevenue = filteredCompletedDeliveries.reduce((sum, delivery) => sum + parseMoney(delivery.amount), 0);
  const completedSections = filteredCompletedDeliveries.reduce<
    Array<{ title: string; items: Delivery[] }>
  >((groups, delivery) => {
    const title = formatCompletedSectionLabel(delivery.completedAt);
    const existing = groups[groups.length - 1];
    if (existing && existing.title === title) {
      existing.items.push(delivery);
      return groups;
    }

    groups.push({ title, items: [delivery] });
    return groups;
  }, []);
  const todayCompletedSection = todayCompletedDeliveries.length
    ? [{ title: "Today", items: todayCompletedDeliveries }]
    : [];
  const cashWorkedDatesFromDeliveries = sortedCompletedDeliveries
    .filter(isCashFlowDelivery)
    .map((delivery) => getCompletedDateKey(delivery.completedAt))
    .filter((value) => value !== "unknown");
  const todayHandoverDateKey = getCompletedDateKey(new Date().toISOString());
  const sortedHandoverHistory = [...handoverHistory].sort((a, b) => {
    const aTime = new Date(a.handoverDate).getTime();
    const bTime = new Date(b.handoverDate).getTime();
    return bTime - aTime;
  });
  const todayHandovers = sortedHandoverHistory.filter(
    (handover) => getCompletedDateKey(handover.handoverDate) === todayHandoverDateKey
  );
  const historyHandovers = sortedHandoverHistory.filter(
    (handover) => getCompletedDateKey(handover.handoverDate) !== todayHandoverDateKey
  );
  const todayCashOrders = (summary?.orders ?? []).filter(
    (order) => getCompletedDateKey(order.collectedAt) === todayHandoverDateKey
  );
  const todayCashTotalsByHub = todayCashOrders.reduce<
    Map<string, { companyLocationId: string; companyLocationName: string; cashAmount: number; orderCount: number }>
  >((groups, order) => {
    const current = groups.get(order.companyLocationId) ?? {
      companyLocationId: order.companyLocationId,
      companyLocationName: order.companyLocationName,
      cashAmount: 0,
      orderCount: 0,
    };
    current.cashAmount += parseMoney(order.collectedAmount);
    current.orderCount += 1;
    groups.set(order.companyLocationId, current);
    return groups;
  }, new Map());
  const todayCashGroups = [...todayCashTotalsByHub.values()];
  const todayExpectedCash = todayCashOrders.reduce((sum, order) => sum + parseMoney(order.expectedAmount), 0);
  const todayCollectedCash = todayCashOrders.reduce((sum, order) => sum + parseMoney(order.collectedAmount), 0);
  const hasTodayCashFlow = todayCashOrders.length > 0 || todayCollectedCash > 0;
  const hasUnfinishedCashFlow = hasTodayCashFlow && todayHandovers.length === 0;
  const handoverWorkedDates = [
    ...new Set(
      [
        ...sortedHandoverHistory.map((handover) => getCompletedDateKey(handover.handoverDate)),
        ...cashWorkedDatesFromDeliveries,
      ]
        .filter((value) => value !== "unknown")
    ),
  ];
  const filteredHandoverHistory = selectedHandoverDate
    ? sortedHandoverHistory.filter((handover) => getCompletedDateKey(handover.handoverDate) === selectedHandoverDate)
    : historyHandovers;
  const selectedDateCashOrders = selectedHandoverDate
    ? (summary?.orders ?? []).filter((order) => getCompletedDateKey(order.collectedAt) === selectedHandoverDate)
    : [];
  const selectedDateCashTotalsByHub = selectedDateCashOrders.reduce<
    Map<string, { companyLocationId: string; companyLocationName: string; cashAmount: number; orderCount: number }>
  >((groups, order) => {
    const current = groups.get(order.companyLocationId) ?? {
      companyLocationId: order.companyLocationId,
      companyLocationName: order.companyLocationName,
      cashAmount: 0,
      orderCount: 0,
    };
    current.cashAmount += parseMoney(order.collectedAmount);
    current.orderCount += 1;
    groups.set(order.companyLocationId, current);
    return groups;
  }, new Map());
  const selectedDateCashGroups = [...selectedDateCashTotalsByHub.values()];
  const selectedDateCollectedCash = selectedDateCashOrders.reduce((sum, order) => sum + parseMoney(order.collectedAmount), 0);
  const selectedDateHasFinishedHandover = selectedHandoverDate
    ? sortedHandoverHistory.some((handover) => getCompletedDateKey(handover.handoverDate) === selectedHandoverDate)
    : false;
  const selectedDateHasUnfinishedCashFlow =
    !!selectedHandoverDate && selectedDateCashOrders.length > 0 && !selectedDateHasFinishedHandover;

  useEffect(() => {
    if (previousPendingCount.current > 0 && pendingCount === 0) {
      void loadDeliveries();
      void loadSummary();
      void loadHandoverHistory();
    }
    previousPendingCount.current = pendingCount;
  }, [pendingCount]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedDelivery) {
        setSelectedDelivery(null);
        return true;
      }

      if (showHandoverPreview) {
        setShowHandoverPreview(false);
        return true;
      }

      if (showLegacyCashHandover) {
        setShowLegacyCashHandover(false);
        return true;
      }

      if (tab !== "deliveries") {
        setTab("deliveries");
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [selectedDelivery, showHandoverPreview, showLegacyCashHandover, tab]);

  if (selectedDelivery) {
    const expectedMethod = selectedDelivery.expectedPaymentMethod ?? "cod";
    const isCodLocked = expectedMethod === "cod";
    const isCash = paymentMethod === "cod";
    const showReference = requiresReference(paymentMethod);
    const orderAmount = parseMoney(selectedDelivery.amount);
    const customerPaid = parseMoney(customerPaidAmount);
    const changeAmount = Math.max(0, customerPaid - orderAmount);
    const manifestCount = selectedDelivery.lineItems?.length ?? 0;
    const customerName = selectedDelivery.customerName ?? "Unknown customer";
    const locationName = selectedDelivery.companyLocation?.name ?? "Unknown location";
    const statusLabel = getRouteBadgeLabel(selectedDelivery.deliveryStatus as Delivery["deliveryStatus"]);

    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.detailScroll}>
          <View style={styles.topbar}>
            <Pressable onPress={() => setSelectedDelivery(null)} style={styles.detailTopbarBack}>
              <Feather name="chevron-left" size={16} color={colors.white} />
            </Pressable>
            <Text style={styles.detailTopbarTitle}>{selectedDelivery.orderLabel}</Text>
            <View style={styles.detailTopbarDot} />
          </View>
          <View style={styles.detailHero}>
            <Text style={styles.detailHeroEyebrow}>Current delivery</Text>
            <Text style={styles.detailHeroTitle}>
              {selectedDelivery.orderLabel}
              {"\n"}
              {getPriorityLabel(selectedDelivery)}
            </Text>
            <View style={styles.detailHeroStats}>
              <View style={styles.detailHeroStat}>
                <Text style={styles.detailHeroStatLabel}>Earnings</Text>
                <Text style={styles.detailHeroStatValue}>{selectedDelivery.amount}</Text>
              </View>
              <View style={styles.detailHeroStat}>
                <Text style={styles.detailHeroStatLabel}>Distance</Text>
                <Text style={styles.detailHeroStatValue}>1.2 km</Text>
              </View>
            </View>
            <View style={styles.detailHeroBadge}>
              <Text style={styles.detailHeroBadgeText}>{statusLabel}</Text>
            </View>
          </View>

          <Pressable style={styles.detailMapCard} onPress={() => void openDirections(selectedDelivery)}>
            <View style={styles.detailMapGlowA} />
            <View style={styles.detailMapGlowB} />
            <View style={styles.detailMapDestination}>
              <Feather name="navigation" size={12} color={colors.brand} />
              <Text style={styles.detailMapDestinationText}>Destination</Text>
            </View>
          </Pressable>

          <View style={styles.detailSectionCard}>
            <Text style={styles.detailAddressTitle}>{getAddressText(selectedDelivery)}</Text>
            <Text style={styles.detailAddressSub}>{locationName}</Text>
            <View style={styles.detailActionStack}>
              <Pressable style={styles.detailActionCard} onPress={() => void openDirections(selectedDelivery)}>
                <View style={styles.detailActionIcon}>
                  <Feather name="map-pin" size={14} color={isDarkMode ? "#dbe6f7" : colors.slate} />
                </View>
                <View style={styles.detailActionBody}>
                  <Text style={styles.detailActionTitle}>Open map</Text>
                  <Text style={styles.detailActionText}>Navigate to this delivery address.</Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.detailSectionCard}>
            <View style={styles.detailSectionHeader}>
              <Text style={styles.detailSectionLabel}>Package Manifest</Text>
              <Text style={styles.detailSectionMeta}>{manifestCount} items</Text>
            </View>
            {(selectedDelivery.lineItems ?? []).map((item) => (
              <View key={item.id} style={styles.detailListRow}>
                <View style={styles.detailListIcon}>
                  <Feather name="archive" size={12} color={colors.textSoft} />
                </View>
                <View style={styles.detailListBody}>
                  <Text style={styles.detailListTitle}>{item.productTitle}</Text>
                  <Text style={styles.detailListSub}>{item.quantity} x {item.price}</Text>
                </View>
                <Text style={styles.detailListMeta}>{item.quantity}x</Text>
              </View>
            ))}
          </View>

          <View style={styles.detailSectionCard}>
            <Text style={styles.detailSectionLabel}>Customer information</Text>
            <View style={styles.detailCustomerRow}>
              <View style={styles.detailCustomerAvatar}>
                <Feather name="user" size={16} color={colors.brand} />
              </View>
              <View style={styles.detailCustomerBody}>
                <Text style={styles.detailCustomerName}>{customerName}</Text>
                <Text style={styles.detailCustomerMeta}>
                  {selectedDelivery.customerPhone ?? "Tap for phone"}
                </Text>
              </View>
            </View>
            <View style={styles.detailDualActions}>
              <Pressable style={styles.detailGhostButton} onPress={() => void openPhoneCall(selectedDelivery.customerPhone)}>
                <Feather name="phone-call" size={14} color={colors.brand} />
                <Text style={styles.detailGhostButtonText}>Call Customer</Text>
              </Pressable>
              <Pressable style={styles.detailGhostButton} onPress={() => void openSmsMessage(selectedDelivery.customerPhone)}>
                <Feather name="message-square" size={14} color={isDarkMode ? "#dbe6f7" : colors.slate} />
                <Text style={styles.detailGhostButtonTextAlt}>Message</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.detailSectionCard}>
            <Text style={styles.detailSectionLabel}>Payment confirmation</Text>
            <Text style={styles.paymentHint}>
              Delivery fee: {formatMoney(selectedDelivery.amount, selectedDelivery.currency)}
            </Text>
            <Text style={styles.paymentHint}>
              Priority surcharge: {formatMoney("0", selectedDelivery.currency)}
            </Text>
            <Text style={styles.detailEarnedTotal}>
              Total Earned <Text style={styles.detailEarnedTotalValue}>{formatMoney(selectedDelivery.amount, selectedDelivery.currency)}</Text>
            </Text>
            <View style={styles.optionGrid}>
              {([
                ["cod", "COD"],
                ["bank_transfer", "Bank"],
                ["card", "Card"],
                ["already_paid", "Online"],
              ] as Array<[PaymentMethod, string]>).map(([value, label]) => (
                (() => {
                  const disabled = isCodLocked && value !== "cod";
                  return (
                <Pressable
                  key={value}
                  style={[
                    styles.optionChip,
                    paymentMethod === value ? styles.optionChipActive : null,
                    disabled ? styles.optionChipDisabled : null,
                  ]}
                  onPress={() => {
                    if (disabled) return;
                    setPaymentMethod(value);
                  }}
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      paymentMethod === value ? styles.optionChipTextActive : null,
                      disabled ? styles.optionChipTextDisabled : null,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
                  );
                })()
              ))}
            </View>
            {isCash ? (
              <View style={styles.moneyInputCard}>
                <Text style={styles.moneyInputLabel}>Receive money from customer</Text>
                <Text style={styles.moneyInputHint}>Enter the cash handed over by the customer.</Text>
                <TextInput
                  style={styles.moneyInput}
                  keyboardType="decimal-pad"
                  value={customerPaidAmount}
                  onChangeText={(value) => {
                    setCustomerPaidAmount(value);
                    setCollectedAmount(selectedDelivery.amount);
                  }}
                  placeholder="Rs.0.00"
                  placeholderTextColor={colors.textSoft}
                />
                <View style={styles.moneyBreakdown}>
                  <View style={styles.moneyBreakdownRow}>
                    <Text style={styles.moneyBreakdownLabel}>Collected</Text>
                    <Text style={styles.moneyBreakdownValue}>
                      {formatMoney(selectedDelivery.amount, selectedDelivery.currency)}
                    </Text>
                  </View>
                  <View style={styles.moneyBreakdownRow}>
                    <Text style={styles.moneyBreakdownLabel}>Change to return</Text>
                    <Text style={styles.moneyBreakdownValue}>
                      {formatMoney(String(changeAmount), selectedDelivery.currency)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.moneyInputCard}>
                <Text style={styles.moneyInputLabel}>Receive payment amount</Text>
                <Text style={styles.moneyInputHint}>Enter the amount confirmed through the selected payment method.</Text>
                <TextInput
                  style={styles.moneyInput}
                  keyboardType="decimal-pad"
                  value={collectedAmount}
                  onChangeText={setCollectedAmount}
                  placeholder="Rs.0.00"
                  placeholderTextColor={colors.textSoft}
                />
              </View>
            )}
            {showReference ? (
              <TextInput
                style={styles.input}
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Invoice / reference number"
                placeholderTextColor={colors.textSoft}
              />
            ) : null}
            {!showReference ? (
              <TextInput
                style={styles.input}
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="Note (optional)"
                placeholderTextColor={colors.textSoft}
              />
            ) : null}
          </View>

          <View style={styles.detailFooterActions}>
            <Pressable style={styles.detailDangerButton} onPress={() => void queueFailed()}>
              <Feather name="x-circle" size={15} color={colors.danger} />
              <Text style={styles.detailDangerButtonText}>Report Failure</Text>
            </Pressable>
            <Pressable
              style={[styles.detailPrimaryButton, deliverySubmitting ? styles.buttonDisabled : null]}
              onPress={() => void queueDelivered()}
              disabled={deliverySubmitting}
            >
              <Feather name="check-circle" size={15} color={colors.white} />
              <Text style={styles.detailPrimaryButtonText}>
                {deliverySubmitting ? "Completing..." : "Complete Delivery"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.detailSectionCard}>
            <Text style={styles.detailSectionLabel}>Failed delivery</Text>
            <TextInput
              style={styles.input}
              value={failureReason}
              onChangeText={setFailureReason}
              placeholder="Reason"
              placeholderTextColor={colors.textSoft}
            />
            <Pressable style={[styles.button, styles.failButton]} onPress={() => void queueFailed()}>
              <Text style={styles.buttonText}>Queue failed delivery</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar
        barStyle={resolvedMode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.bg}
      />
      <View style={styles.topbar}>
        <View style={styles.topbarMain}>
          <Text style={styles.topbarBrand}>Cosmo Rider</Text>
        </View>
        <View style={styles.topbarProfileDot}>
          <Text style={styles.topbarProfileText}>{getRiderInitials()}</Text>
        </View>
      </View>

      {tab === "deliveries" ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDeliveries} />}
          contentContainerStyle={styles.content}
        >
          <View style={styles.routeBoard}>
            <View style={styles.routeBoardTop}>
              <View>
                <Text style={styles.routeBoardTitle}>Today&apos;s route</Text>
                <Text style={styles.routeBoardMeta}>
                  {pendingCount === 0 ? "Last synced just now" : `Last synced ${pendingCount} queue item(s) pending`}
                </Text>
              </View>
              <Pressable style={styles.routeSyncButton} onPress={() => void flushQueue()}>
                <Feather name="refresh-cw" size={14} color="#1a2740" />
                <Text style={styles.routeSyncButtonText}>Sync now</Text>
              </Pressable>
            </View>
            <View style={styles.routeStats}>
              <View style={styles.routeStatCard}>
                <Text style={styles.routeStatLabel}>Active stops</Text>
                <Text style={styles.routeStatValue}>{activeDeliveries.length}</Text>
              </View>
              <View style={styles.routeStatCardMuted}>
                <Text style={styles.routeStatLabel}>Waiting sync</Text>
                <Text style={styles.routeStatValue}>{pendingCount}</Text>
              </View>
            </View>
          </View>
          {pendingCount > 0 ? (
            <Pressable
              style={styles.queueHint}
              onPress={() => {
                Alert.alert(
                  "Clear queued actions",
                  "This removes pending offline test actions from this device without syncing them.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () => void clearPendingQueue(),
                    },
                  ]
                );
              }}
            >
              <Text style={styles.queueHintText}>Waiting sync: tap here to clear test queue items.</Text>
            </Pressable>
          ) : null}
          <View style={styles.routeSectionHeader}>
            <Text style={styles.routeSectionTitle}>Active Deliveries</Text>
            <Text style={styles.routeSectionMeta}>Priority List</Text>
          </View>
          {activeDeliveries.map((delivery) => {
            const queuedState = queuedDeliveryStates.get(delivery.id);
            const isNotSynced = !!queuedState?.hasQueuedPayment || !!queuedState?.hasQueuedComplete;
            const routeBadgeLabel = getRouteBadgeLabel(delivery.deliveryStatus);
            const addressText = getAddressText(delivery);
            return (
            <Pressable
              key={delivery.id}
              style={styles.routeCard}
              onPress={() => void loadDetail(delivery.id)}
            >
              <View style={styles.routeCardTop}>
                <View style={styles.routeCardMain}>
                  <Text style={styles.routeCardCode}>{delivery.orderLabel}</Text>
                  <Text style={styles.routeCardCustomer}>{delivery.customerName ?? "Unknown customer"}</Text>
                </View>
                <View
                  style={[
                    styles.routeCardBadge,
                    delivery.deliveryStatus === "accepted"
                      ? styles.routeCardBadgeTransit
                      : delivery.deliveryStatus === "assigned"
                        ? styles.routeCardBadgeNext
                        : styles.routeCardBadgeArrived,
                  ]}
                >
                  <Text style={styles.routeCardBadgeText}>{routeBadgeLabel}</Text>
                </View>
              </View>
              <View style={styles.routeCardInfoRow}>
                <View style={styles.routeLocationChip}>
                  <Feather name="map-pin" size={12} color={isDarkMode ? "#dbe6f7" : colors.textMuted} />
                  <Text style={styles.routeLocationText} numberOfLines={1}>
                    {addressText}
                  </Text>
                </View>
                <Text style={styles.routeCardAmount}>{formatMoney(delivery.amount, delivery.currency)}</Text>
              </View>
              <Text style={styles.routeDistrictText}>
                {(delivery.companyLocation?.name ?? "Unknown location").toUpperCase()}
              </Text>
              <Text style={styles.routeCardFooterLabel}>{getPriorityLabel(delivery)}</Text>
              {isNotSynced ? <Text style={styles.unsyncedText}>Not synced</Text> : null}
            </Pressable>
          )})}
          {activeDeliveries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>No orders for today</Text>
              <Text style={styles.subtitle}>Today&apos;s assigned deliveries will appear here first.</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : tab === "completed" ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDeliveries} />}
          contentContainerStyle={styles.content}
        >
          <View style={styles.completedOverview}>
            <Text style={styles.completedOverviewEyebrow}>Overview</Text>
            <View style={styles.completedOverviewHeader}>
              <View style={styles.completedOverviewMain}>
                <Text style={styles.completedOverviewTitle}>Completed deliveries</Text>
              </View>
              <View style={styles.completedOverviewIcon}>
                <Feather name="calendar" size={14} color={colors.white} />
              </View>
            </View>
            <View style={styles.completedOverviewStats}>
              <View style={styles.completedOverviewStat}>
                <Text style={styles.completedOverviewLabel}>Total today</Text>
                <Text style={styles.completedOverviewValue}>{todayCompletedDeliveries.length}</Text>
              </View>
              <View style={styles.completedOverviewStat}>
                <Text style={styles.completedOverviewLabel}>Revenue</Text>
                <Text style={styles.completedOverviewValue}>{formatMoney(todayCompletedRevenue.toFixed(2))}</Text>
              </View>
            </View>
          </View>
          {todayCompletedSection.map((section) => (
            <View key={section.title} style={styles.completedSection}>
              <Text style={styles.completedSectionTitle}>{section.title}</Text>
              {section.items.map((delivery) => {
                const queuedState = queuedDeliveryStates.get(delivery.id);
                const isNotSynced = !!queuedState?.hasQueuedComplete;
                return (
                  <View key={delivery.id} style={styles.completedCard}>
                    <View style={styles.completedCardIcon}>
                      <Feather
                        name={
                          delivery.expectedPaymentMethod === "cod"
                            ? "truck"
                            : delivery.expectedPaymentMethod === "already_paid"
                              ? "package"
                              : "shopping-bag"
                        }
                        size={13}
                        color={isDarkMode ? "#dbe6f7" : colors.slate}
                      />
                    </View>
                    <View style={styles.completedCardBody}>
                      <View style={styles.completedCardTop}>
                        <Text style={styles.completedCardCustomer}>{delivery.customerName ?? "Unknown customer"}</Text>
                        <Text style={styles.completedCardAmount}>{delivery.amount}</Text>
                      </View>
                      <Text style={styles.completedCardLocation} numberOfLines={1}>
                        {getAddressText(delivery)}
                      </Text>
                      <View style={styles.completedCardMetaRow}>
                        <Text style={styles.completedCardTime}>{formatCompletedTime(delivery.completedAt)}</Text>
                        <View style={styles.completedMethodBadge}>
                          <Text style={styles.completedMethodBadgeText}>
                            {delivery.expectedPaymentMethod === "cod" ? "COD" : "Done"}
                          </Text>
                        </View>
                        {isNotSynced ? <Text style={styles.completedUnsynced}>Sync</Text> : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={styles.completedHistoryTools}>
              <Pressable style={styles.completedDatePickerButton} onPress={() => setShowCompletedDatePicker(true)}>
                <Feather name="calendar" size={14} color={colors.text} />
                <Text style={styles.completedDatePickerText}>
                  {selectedCompletedDate ? formatCompletedDateChipLabel(selectedCompletedDate) : "Pick worked date"}
                </Text>
                <Feather name="chevron-down" size={14} color={colors.textSoft} />
              </Pressable>
            {selectedCompletedDate ? (
              <Pressable style={styles.completedHistoryReset} onPress={() => setSelectedCompletedDate(null)}>
                <Text style={styles.completedHistoryResetText}>Back to history</Text>
              </Pressable>
            ) : null}
          </View>
          {!selectedCompletedDate ? (
            <View style={styles.completedHistoryHeader}>
              <Text style={styles.completedHistoryTitle}>Other history</Text>
              <Text style={styles.completedHistorySubtitle}>Older completed deliveries</Text>
            </View>
          ) : null}
          {completedSections.map((section) => (
            <View key={section.title} style={styles.completedSection}>
              <Text style={styles.completedSectionTitle}>{section.title}</Text>
              {section.items.map((delivery) => {
                const queuedState = queuedDeliveryStates.get(delivery.id);
                const isNotSynced = !!queuedState?.hasQueuedComplete;
                return (
                  <View key={delivery.id} style={styles.completedCard}>
                    <View style={styles.completedCardIcon}>
                      <Feather
                        name={
                          delivery.expectedPaymentMethod === "cod"
                            ? "truck"
                            : delivery.expectedPaymentMethod === "already_paid"
                              ? "package"
                              : "shopping-bag"
                        }
                        size={13}
                        color={isDarkMode ? "#dbe6f7" : colors.slate}
                      />
                    </View>
                    <View style={styles.completedCardBody}>
                      <View style={styles.completedCardTop}>
                        <Text style={styles.completedCardCustomer}>{delivery.customerName ?? "Unknown customer"}</Text>
                        <Text style={styles.completedCardAmount}>{delivery.amount}</Text>
                      </View>
                      <Text style={styles.completedCardLocation} numberOfLines={1}>
                        {getAddressText(delivery)}
                      </Text>
                      <View style={styles.completedCardMetaRow}>
                        <Text style={styles.completedCardTime}>{formatCompletedTime(delivery.completedAt)}</Text>
                        <View style={styles.completedMethodBadge}>
                          <Text style={styles.completedMethodBadgeText}>
                            {delivery.expectedPaymentMethod === "cod" ? "COD" : "Done"}
                          </Text>
                        </View>
                        {isNotSynced ? <Text style={styles.completedUnsynced}>Sync</Text> : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          {todayCompletedDeliveries.length === 0 && !selectedCompletedDate ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>No completed orders today</Text>
              <Text style={styles.subtitle}>Today&apos;s completed deliveries will appear here first.</Text>
            </View>
          ) : null}
          {filteredCompletedDeliveries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>{selectedCompletedDate ? "No history for this date" : "No delivery history yet"}</Text>
              <Text style={styles.subtitle}>
                {selectedCompletedDate ? "No completed deliveries were found for the selected date." : "Older completed deliveries will appear here automatically."}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : tab === "cash" ? (
        <ScrollView contentContainerStyle={styles.content}>
          {hasTodayCashFlow ? (
            <>
              <View style={styles.shiftBalanceCard}>
                <Text style={styles.shiftBalanceEyebrow}>Cash Flow</Text>
                <View style={styles.shiftBalanceHeader}>
                  <View>
                    <Text style={styles.shiftBalanceTitle}>Shift Balance</Text>
                  </View>
                  <View style={styles.shiftBalanceIcon}>
                    <Feather name="file-text" size={14} color={colors.white} />
                  </View>
                </View>
                <Text style={styles.shiftBalanceValue}>{formatMoney(todayCollectedCash.toFixed(2))}</Text>
                <View style={styles.shiftBalanceMetaRow}>
                  <Text style={styles.shiftBalanceMetaLabel}>Expected</Text>
                  <Text style={styles.shiftBalanceMetaValue}>{formatMoney(todayExpectedCash.toFixed(2))}</Text>
                  <Text style={styles.shiftBalanceMetaLabel}>Collected</Text>
                  <Text style={styles.shiftBalanceMetaValue}>{formatMoney(todayCollectedCash.toFixed(2))}</Text>
                </View>
              </View>
              {hasUnfinishedCashFlow ? (
                <View style={[styles.cashFlowNotice, styles.cashFlowNoticeInline]}>
                  <Text style={styles.cashFlowNoticeText}>Unfinished cash flow is still pending for today.</Text>
                  <Pressable
                    style={styles.cashFlowNoticeButton}
                    onPress={() => {
                      setShowLegacyCashHandover(true);
                      setShowHandoverPreview(true);
                    }}
                  >
                    <Text style={styles.cashFlowNoticeButtonText}>Finish now</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.shiftSectionHeader}>
                <Text style={styles.shiftSectionTitle}>Breakdown by Hub</Text>
                <Text style={styles.shiftSectionMeta}>Allocations</Text>
              </View>
              {todayCashGroups.map((group) => (
                <View key={group.companyLocationId} style={styles.shiftBreakdownCard}>
                  <View style={styles.shiftBreakdownTop}>
                    <View style={styles.shiftBreakdownMain}>
                      <View style={styles.shiftBreakdownIcon}>
                        <Feather name="map-pin" size={12} color={isDarkMode ? "#dbe6f7" : colors.slate} />
                      </View>
                      <View style={styles.shiftBreakdownBody}>
                        <Text style={styles.shiftBreakdownTitle}>{group.companyLocationName}</Text>
                        <Text style={styles.shiftBreakdownSub}>Physical Cash</Text>
                      </View>
                    </View>
                    <Text style={styles.shiftBreakdownAmount}>{formatMoney(group.cashAmount.toFixed(2))}</Text>
                  </View>
                  <View style={styles.shiftBreakdownFooter}>
                    <Text style={styles.shiftBreakdownFooterLabel}>Adjustment ({group.orderCount}p)</Text>
                    <Text style={styles.shiftBreakdownFooterValue}>+0.50</Text>
                  </View>
                </View>
              ))}
              <View style={styles.shiftBreakdownCard}>
                <View style={styles.shiftBreakdownTop}>
                  <View style={styles.shiftBreakdownMain}>
                    <View style={styles.shiftBreakdownIcon}>
                      <Feather name="tablet" size={12} color={isDarkMode ? "#dbe6f7" : colors.textSoft} />
                    </View>
                    <View style={styles.shiftBreakdownBody}>
                      <Text style={styles.shiftBreakdownTitle}>Transit Dock Terminal</Text>
                      <Text style={styles.shiftBreakdownSub}>Banked amount</Text>
                    </View>
                  </View>
                  <Text style={styles.shiftBreakdownAmount}>{formatMoney("0")}</Text>
                </View>
              </View>
              <View style={styles.shiftVerificationCard}>
                <View style={styles.shiftVerificationIcon}>
                  <Feather name="shield" size={13} color={colors.brand} />
                </View>
                <View style={styles.shiftVerificationBody}>
                  <Text style={styles.shiftVerificationTitle}>Handover Verification</Text>
                  <Text style={styles.shiftVerificationText}>
                    Review every cash group before you submit to avoid a mismatch in the ledger.
                  </Text>
                </View>
              </View>
              <View style={styles.card}>
                <Pressable
                  style={styles.shiftPreviewToggle}
                  onPress={() => setShowHandoverPreview((current) => !current)}
                >
                  <Text style={styles.shiftPreviewToggleText}>
                    {showHandoverPreview ? "Hide preview" : "Preview handover"}
                  </Text>
                  <Feather name={showHandoverPreview ? "chevron-up" : "chevron-down"} size={14} color={colors.brand} />
                </Pressable>
                {showHandoverPreview ? (
                  <View style={styles.previewWrap}>
                    <Text style={styles.previewHeading}>Orders</Text>
                    {todayCashOrders.map((order) => (
                      <View key={order.paymentId} style={styles.previewRow}>
                        <View style={styles.previewMeta}>
                          <Text style={styles.previewTitle}>{order.orderLabel}</Text>
                          <Text style={styles.previewSub}>{order.companyLocationName}</Text>
                        </View>
                        <Text style={styles.previewAmount}>{formatMoney(order.collectedAmount)}</Text>
                      </View>
                    ))}
                    <Text style={styles.previewHeading}>Location totals</Text>
                    {todayCashGroups.map((group) => (
                      <View key={group.companyLocationId} style={styles.previewRow}>
                        <View style={styles.previewMeta}>
                          <Text style={styles.previewTitle}>{group.companyLocationName}</Text>
                          <Text style={styles.previewSub}>{group.orderCount} orders</Text>
                        </View>
                        <Text style={styles.previewAmount}>{formatMoney(group.cashAmount.toFixed(2))}</Text>
                      </View>
                    ))}
                    <View style={styles.previewTotalRow}>
                      <Text style={styles.previewTotalLabel}>Total handover</Text>
                      <Text style={styles.previewTotalValue}>{formatMoney(todayCollectedCash.toFixed(2))}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={[styles.shiftSubmitButton, handoverSubmitting ? styles.buttonDisabled : null]}
                onPress={() => void submitHandover()}
                disabled={handoverSubmitting}
              >
                <Feather name="check-circle" size={15} color={colors.white} />
                <Text style={styles.shiftSubmitButtonText}>
                  {handoverSubmitting ? "Submitting..." : "Submit handover"}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>No cash flow for today</Text>
              <Text style={styles.subtitle}>Today&apos;s collected cash and handover summary will appear here first.</Text>
              {hasUnfinishedCashFlow ? (
                <View style={styles.cashFlowNotice}>
                  <Text style={styles.cashFlowNoticeText}>Unfinished cash flow is still pending for today.</Text>
                  <Pressable
                    style={styles.cashFlowNoticeButton}
                    onPress={() => {
                      setShowLegacyCashHandover(true);
                      setShowHandoverPreview(true);
                    }}
                  >
                    <Text style={styles.cashFlowNoticeButtonText}>Finish now</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
          {hasUnfinishedCashFlow && showLegacyCashHandover ? (
            <>
              <View style={styles.card}>
                <Pressable
                  style={styles.shiftPreviewToggle}
                  onPress={() => setShowHandoverPreview((current) => !current)}
                >
                  <Text style={styles.shiftPreviewToggleText}>
                    {showHandoverPreview ? "Hide preview" : "Preview handover"}
                  </Text>
                  <Feather name={showHandoverPreview ? "chevron-up" : "chevron-down"} size={14} color={colors.brand} />
                </Pressable>
                {showHandoverPreview ? (
                  <View style={styles.previewWrap}>
                    <Text style={styles.previewHeading}>Orders</Text>
                    {(summary?.orders ?? []).map((order) => (
                      <View key={order.paymentId} style={styles.previewRow}>
                        <View style={styles.previewMeta}>
                          <Text style={styles.previewTitle}>{order.orderLabel}</Text>
                          <Text style={styles.previewSub}>{order.companyLocationName}</Text>
                        </View>
                        <Text style={styles.previewAmount}>{formatMoney(order.collectedAmount)}</Text>
                      </View>
                    ))}
                    <Text style={styles.previewHeading}>Location totals</Text>
                    {(summary?.groups ?? []).map((group) => (
                      <View key={group.companyLocationId} style={styles.previewRow}>
                        <View style={styles.previewMeta}>
                          <Text style={styles.previewTitle}>{group.companyLocationName}</Text>
                          <Text style={styles.previewSub}>{group.orderCount} orders</Text>
                        </View>
                        <Text style={styles.previewAmount}>{formatMoney(group.cashAmount)}</Text>
                      </View>
                    ))}
                    <View style={styles.previewTotalRow}>
                      <Text style={styles.previewTotalLabel}>Total handover</Text>
                      <Text style={styles.previewTotalValue}>{formatMoney(summary?.totalCollectedCash)}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={[styles.shiftSubmitButton, handoverSubmitting ? styles.buttonDisabled : null]}
                onPress={() => void submitHandover()}
                disabled={handoverSubmitting}
              >
                <Feather name="check-circle" size={15} color={colors.white} />
                <Text style={styles.shiftSubmitButtonText}>
                  {handoverSubmitting ? "Submitting..." : "Submit handover"}
                </Text>
              </Pressable>
            </>
          ) : null}
          {todayHandovers.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Today&apos;s handovers</Text>
              {todayHandovers.map((handover) => (
                <View key={handover.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>
                      {new Date(handover.handoverDate).toLocaleDateString("en-LK")}
                    </Text>
                    <Text style={styles.historyStatus}>{handover.status}</Text>
                  </View>
                  <Text style={styles.meta}>
                    Submitted: {new Date(handover.submittedAt).toLocaleString("en-LK")}
                  </Text>
                  <Text style={styles.meta}>
                    Total: {formatMoney(handover.totalHandedOverCash)} | Variance: {formatMoney(handover.varianceAmount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.card}>
            <View style={styles.completedHistoryTools}>
              <Pressable style={styles.completedDatePickerButton} onPress={() => setShowHandoverDatePicker(true)}>
                <Feather name="calendar" size={14} color={colors.text} />
                <Text style={styles.completedDatePickerText}>
                  {selectedHandoverDate ? formatCompletedDateChipLabel(selectedHandoverDate) : "Pick worked date"}
                </Text>
                <Feather name="chevron-down" size={14} color={colors.textSoft} />
              </Pressable>
              {selectedHandoverDate ? (
                <Pressable style={styles.completedHistoryReset} onPress={() => setSelectedHandoverDate(null)}>
                  <Text style={styles.completedHistoryResetText}>Back to history</Text>
                </Pressable>
              ) : null}
            </View>
            {!selectedHandoverDate ? (
              <View style={styles.completedHistoryHeader}>
                <Text style={styles.completedHistoryTitle}>Other history</Text>
                <Text style={styles.completedHistorySubtitle}>Older handover records</Text>
              </View>
            ) : null}
            {selectedDateHasUnfinishedCashFlow ? (
              <>
                <View style={styles.cashFlowNotice}>
                  <Text style={styles.cashFlowNoticeText}>This worked date has unfinished cash flow.</Text>
                </View>
                <View style={styles.previewWrap}>
                  <Text style={styles.previewHeading}>Orders</Text>
                  {selectedDateCashOrders.map((order) => (
                    <View key={order.paymentId} style={styles.previewRow}>
                      <View style={styles.previewMeta}>
                        <Text style={styles.previewTitle}>{order.orderLabel}</Text>
                        <Text style={styles.previewSub}>{order.companyLocationName}</Text>
                      </View>
                      <Text style={styles.previewAmount}>{formatMoney(order.collectedAmount)}</Text>
                    </View>
                  ))}
                  <Text style={styles.previewHeading}>Location totals</Text>
                  {selectedDateCashGroups.map((group) => (
                    <View key={group.companyLocationId} style={styles.previewRow}>
                      <View style={styles.previewMeta}>
                        <Text style={styles.previewTitle}>{group.companyLocationName}</Text>
                        <Text style={styles.previewSub}>{group.orderCount} orders</Text>
                      </View>
                      <Text style={styles.previewAmount}>{formatMoney(group.cashAmount.toFixed(2))}</Text>
                    </View>
                  ))}
                  <View style={styles.previewTotalRow}>
                    <Text style={styles.previewTotalLabel}>Pending handover</Text>
                    <Text style={styles.previewTotalValue}>{formatMoney(selectedDateCollectedCash.toFixed(2))}</Text>
                  </View>
                  <Pressable
                    style={[styles.shiftSubmitButton, handoverSubmitting ? styles.buttonDisabled : null]}
                    onPress={() => void submitHandover()}
                    disabled={handoverSubmitting}
                  >
                    <Feather name="check-circle" size={15} color={colors.white} />
                    <Text style={styles.shiftSubmitButtonText}>
                      {handoverSubmitting ? "Submitting..." : "Submit handover"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {filteredHandoverHistory.map((handover) => (
              <View key={handover.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>
                    {new Date(handover.handoverDate).toLocaleDateString("en-LK")}
                  </Text>
                  <Text style={styles.historyStatus}>{handover.status}</Text>
                </View>
                <Text style={styles.meta}>
                  Submitted: {new Date(handover.submittedAt).toLocaleString("en-LK")}
                </Text>
                <Text style={styles.meta}>
                  Total: {formatMoney(handover.totalHandedOverCash)} | Variance: {formatMoney(handover.varianceAmount)}
                </Text>
                {handover.items.map((item) => (
                  <View key={item.id} style={styles.historyItemRow}>
                    <Text style={styles.previewTitle}>{item.companyLocationName}</Text>
                    <Text style={styles.previewAmount}>{formatMoney(item.cashAmount)}</Text>
                  </View>
                ))}
              </View>
            ))}
            {todayHandovers.length === 0 && !selectedHandoverDate ? (
              <Text style={styles.subtitle}>No handovers submitted today.</Text>
            ) : null}
            {filteredHandoverHistory.length === 0 ? (
              <Text style={styles.subtitle}>
                {selectedHandoverDate
                  ? selectedDateHasUnfinishedCashFlow
                    ? "This worked date has cash records waiting for handover."
                    : "No handovers were found for the selected date."
                  : "Older handover history will appear here."}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileHero}>
            <View style={styles.profileHeroAvatar}>
              <Text style={styles.profileHeroAvatarText}>{getRiderInitials()}</Text>
            </View>
            <View style={styles.profileHeroBody}>
              <Text style={styles.profileHeroName}>{session?.rider.name?.trim() || "Rider"}</Text>
              <Text style={styles.profileHeroMeta}>{session?.rider.mobile ?? "No mobile number"}</Text>
              <View style={styles.profileHeroBadges}>
                <View style={styles.profileHeroBadge}>
                  <Text style={styles.profileHeroBadgeText}>Shift on</Text>
                </View>
                <View style={styles.profileHeroBadgeMuted}>
                  <Text style={styles.profileHeroBadgeTextMuted}>Verified</Text>
                </View>
              </View>
            </View>
            <View style={styles.profileHeroChevron}>
              <Feather name="chevron-right" size={14} color={colors.textSoft} />
            </View>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionLabel}>Account</Text>
            <View style={styles.profileMenuCard}>
              <Pressable style={styles.profileMenuRow}>
                <View style={styles.profileMenuIcon}>
                  <Feather name="user" size={13} color={colors.brand} />
                </View>
                <View style={styles.profileMenuBody}>
                  <Text style={styles.profileMenuTitle}>Personal Information</Text>
                  <Text style={styles.profileMenuSub}>{session?.rider.email ?? "Rider profile and contact details"}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.textSoft} />
              </Pressable>
              <Pressable style={styles.profileMenuRow}>
                <View style={styles.profileMenuIcon}>
                  <Feather name="credit-card" size={13} color={colors.brand} />
                </View>
                <View style={styles.profileMenuBody}>
                  <Text style={styles.profileMenuTitle}>Payed Methods</Text>
                  <Text style={styles.profileMenuSub}>Linked transfers and cash mode</Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.textSoft} />
              </Pressable>
            </View>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionLabel}>Preferences</Text>
            <View style={styles.profileMenuCard}>
              <View style={styles.profileToggleRow}>
                <View style={styles.profileMenuIcon}>
                  <Feather name="moon" size={13} color={colors.brand} />
                </View>
                <View style={styles.profileMenuBody}>
                  <Text style={styles.profileMenuTitle}>Dark Appearance</Text>
                  <Text style={styles.profileMenuSub}>Mirror this view with a darker surface layer.</Text>
                </View>
                <Pressable
                  style={[styles.profileSwitch, themeSetting === "dark" ? styles.profileSwitchActive : null]}
                  onPress={() => setThemeSetting(themeSetting === "dark" ? "light" : "dark")}
                >
                  <View style={[styles.profileSwitchThumb, themeSetting === "dark" ? styles.profileSwitchThumbActive : null]} />
                </Pressable>
              </View>
              <View style={styles.profileToggleRow}>
                <View style={styles.profileMenuIcon}>
                  <Feather name="bell" size={13} color={colors.brand} />
                </View>
                <View style={styles.profileMenuBody}>
                  <Text style={styles.profileMenuTitle}>Notification</Text>
                  <Text style={styles.profileMenuSub}>Receive route and priority alerts.</Text>
                </View>
                <View style={styles.profileStaticChip}>
                  <Text style={styles.profileStaticChipText}>On</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionLabel}>App Info</Text>
            <View style={styles.profileMenuCard}>
              <Pressable style={styles.profileMenuRow}>
                <View style={styles.profileMenuIcon}>
                  <Feather name="info" size={13} color={colors.brand} />
                </View>
                <View style={styles.profileMenuBody}>
                  <Text style={styles.profileMenuTitle}>Version & Licenses</Text>
                  <Text style={styles.profileMenuSub}>Build 2.4.0 stable</Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.textSoft} />
              </Pressable>
              <Pressable style={styles.profileMenuRow}>
                <View style={styles.profileMenuIcon}>
                  <Feather name="help-circle" size={13} color={colors.brand} />
                </View>
                <View style={styles.profileMenuBody}>
                  <Text style={styles.profileMenuTitle}>Support Center</Text>
                  <Text style={styles.profileMenuSub}>Help articles and assistance</Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.textSoft} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.profileLogoutButton}
            onPress={async () => {
              await logout();
            }}
          >
            <Feather name="log-out" size={14} color={colors.danger} />
            <Text style={styles.profileLogoutText}>Logout from Device</Text>
          </Pressable>

          <Text style={styles.profileFooterText}>
            {session?.rider.company?.name ?? "No company assigned"} | Expires{" "}
            {session?.expiresAt ? new Date(session.expiresAt).toLocaleDateString("en-LK") : "Unknown"}
          </Text>
          <Text style={styles.profileFooterText}>Cosmo Rider secure access node</Text>
        </ScrollView>
      )}
      <View style={styles.bottomTabBar}>
        {bottomTabs.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable key={item.key} style={styles.bottomTabItem} onPress={() => setTab(item.key)}>
              <Feather
                name={item.icon}
                size={18}
                color={active ? colors.brand : colors.textSoft}
              />
              <Text style={active ? styles.bottomTabLabelActive : styles.bottomTabLabel}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Modal
        visible={showCompletedDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCompletedDatePicker(false)}
      >
        <Pressable style={styles.datePickerBackdrop} onPress={() => setShowCompletedDatePicker(false)}>
          <Pressable style={styles.datePickerSheet} onPress={() => undefined}>
            <Text style={styles.datePickerTitle}>Select worked date</Text>
            <Pressable
              style={styles.datePickerOption}
              onPress={() => {
                setSelectedCompletedDate(null);
                setShowCompletedDatePicker(false);
              }}
            >
              <Text style={styles.datePickerOptionText}>History overview</Text>
              {!selectedCompletedDate ? <Feather name="check" size={14} color={colors.brand} /> : null}
            </Pressable>
            {completedWorkedDates.map((value) => (
              <Pressable
                key={value}
                style={styles.datePickerOption}
                onPress={() => {
                  setSelectedCompletedDate(value);
                  setShowCompletedDatePicker(false);
                }}
              >
                <Text style={styles.datePickerOptionText}>{formatCompletedDateChipLabel(value)}</Text>
                {selectedCompletedDate === value ? <Feather name="check" size={14} color={colors.brand} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={showHandoverDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHandoverDatePicker(false)}
      >
        <Pressable style={styles.datePickerBackdrop} onPress={() => setShowHandoverDatePicker(false)}>
          <Pressable style={styles.datePickerSheet} onPress={() => undefined}>
            <Text style={styles.datePickerTitle}>Select worked date</Text>
            <Pressable
              style={styles.datePickerOption}
              onPress={() => {
                setSelectedHandoverDate(null);
                setShowHandoverDatePicker(false);
              }}
            >
              <Text style={styles.datePickerOptionText}>History overview</Text>
              {!selectedHandoverDate ? <Feather name="check" size={14} color={colors.brand} /> : null}
            </Pressable>
            {handoverWorkedDates.map((value) => (
              <Pressable
                key={value}
                style={styles.datePickerOption}
                onPress={() => {
                  setSelectedHandoverDate(value);
                  setShowHandoverDatePicker(false);
                }}
              >
                <Text style={styles.datePickerOptionText}>{formatCompletedDateChipLabel(value)}</Text>
                {selectedHandoverDate === value ? <Feather name="check" size={14} color={colors.brand} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function AppShell() {
  const { session, bootstrapped } = useAuth();
  const { styles } = useAppTheme();

  if (!bootstrapped) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.card}>
          <Text style={styles.title}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return session ? <MainView /> : <LoginView />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <AppShell />
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function createAppStyles(colors: ThemeColors) {
  const isDark = colors.bg === darkColors.bg;
  return StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: ANDROID_STATUSBAR_HEIGHT,
  },
  content: { padding: 16, paddingBottom: 104 },
  loginScroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: "center",
  },
  loginHero: {
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 22,
    alignItems: "center",
  },
  loginBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.brandSoft,
    marginBottom: 14,
  },
  loginBadgeText: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  loginBrand: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.8,
  },
  loginCopy: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    maxWidth: 290,
    textAlign: "center",
  },
  loginCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: colors.border,
    rowGap: 14,
    ...shadows.card,
  },
  loginFieldGroup: {
    rowGap: 8,
  },
  loginLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  loginInputShell: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    height: 44,
    columnGap: 8,
  },
  loginInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  loginUtilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  loginCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  loginCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  loginCheckboxChecked: {
    backgroundColor: colors.slate,
    borderColor: colors.slate,
  },
  loginUtilityText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  loginResetText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
  loginFooter: {
    marginTop: 20,
    alignItems: "center",
    rowGap: 8,
  },
  loginFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loginFooterText: {
    color: colors.textMuted,
    fontSize: 10.5,
  },
  loginFooterDivider: {
    color: colors.textSoft,
    fontSize: 10.5,
  },
  loginFooterMeta: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  topbar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.slate,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topbarMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  topbarBrand: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
  },
  topbarProfileDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#28354d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  topbarProfileText: {
    color: "#d9e2f3",
    fontSize: 9,
    fontWeight: "800",
  },
  bottomTabBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    ...shadows.card,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bottomTabLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "700",
  },
  bottomTabLabelActive: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "800",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    margin: 16,
  },
  feedCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  routeBoard: {
    backgroundColor: colors.slate,
    borderRadius: 20,
    padding: 16,
    margin: 16,
    marginBottom: 10,
    ...shadows.card,
  },
  routeBoardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  routeBoardTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  routeBoardMeta: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    marginTop: 4,
  },
  routeSyncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: isDark ? "#e8edf7" : "rgba(255,255,255,0.95)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  routeSyncButtonText: {
    color: isDark ? "#1a2740" : colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  routeStats: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  routeStatCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
  },
  routeStatCardMuted: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 12,
  },
  routeStatLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  routeStatValue: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 6,
    letterSpacing: -0.8,
  },
  queueHint: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  queueHintText: {
    color: colors.danger,
    fontSize: 12.5,
    fontWeight: "700",
  },
  routeSectionHeader: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeSectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  routeSectionMeta: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  routeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  routeCardMain: {
    flex: 1,
    minWidth: 0,
  },
  routeCardCode: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  routeCardCustomer: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  routeCardBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  routeCardBadgeTransit: {
    backgroundColor: isDark ? "rgba(116, 200, 214, 0.22)" : colors.accentSoft,
  },
  routeCardBadgeNext: {
    backgroundColor: isDark ? "rgba(154, 140, 241, 0.3)" : colors.brandSoft,
  },
  routeCardBadgeArrived: {
    backgroundColor: isDark ? "#223452" : colors.slateSoft,
  },
  routeCardBadgeText: {
    color: isDark ? "#f3f6fb" : colors.text,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  routeCardInfoRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeLocationChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: isDark ? "#1b2c46" : colors.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  routeLocationText: {
    flex: 1,
    color: isDark ? "#b7c3d7" : colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  routeCardAmount: {
    color: isDark ? "#e7ecf8" : colors.slate,
    fontSize: 16,
    fontWeight: "800",
  },
  routeDistrictText: {
    color: isDark ? "#b6c2d7" : colors.textSoft,
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
  },
  routeCardFooterLabel: {
    color: isDark ? "#e9eef8" : colors.text,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 12,
  },
  shiftBalanceCard: {
    backgroundColor: colors.slate,
    borderRadius: 20,
    padding: 16,
    margin: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  shiftBalanceEyebrow: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  shiftBalanceHeader: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shiftBalanceTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  shiftBalanceIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  shiftBalanceValue: {
    color: colors.white,
    fontSize: 34,
    fontWeight: "800",
    marginTop: 16,
    letterSpacing: -0.8,
  },
  shiftBalanceMetaRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  shiftBalanceMetaLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  shiftBalanceMetaValue: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "800",
    marginRight: 10,
  },
  shiftSectionHeader: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shiftSectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  shiftSectionMeta: {
    color: isDark ? "#b6c2d7" : colors.textSoft,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shiftBreakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  shiftBreakdownTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  shiftBreakdownMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  shiftBreakdownIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: isDark ? "#1b2c46" : colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftBreakdownBody: {
    flex: 1,
    minWidth: 0,
  },
  shiftBreakdownTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  shiftBreakdownSub: {
    color: isDark ? "#a7b3c8" : colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  shiftBreakdownAmount: {
    color: isDark ? "#dbe6f7" : colors.slate,
    fontSize: 13,
    fontWeight: "800",
  },
  shiftBreakdownFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shiftBreakdownFooterLabel: {
    color: isDark ? "#c0cadb" : colors.textSoft,
    fontSize: 11,
    fontWeight: "700",
  },
  shiftBreakdownFooterValue: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  shiftVerificationCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    ...shadows.card,
  },
  shiftVerificationIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: isDark ? "rgba(154, 140, 241, 0.26)" : colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftVerificationBody: {
    flex: 1,
  },
  shiftVerificationTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  shiftVerificationText: {
    color: isDark ? "#aeb9cb" : colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  shiftPreviewToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shiftPreviewToggleText: {
    color: isDark ? "#b7a9ff" : colors.brand,
    fontSize: 13,
    fontWeight: "800",
  },
  shiftSubmitButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: colors.brand,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    ...shadows.card,
  },
  shiftSubmitButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
  },
  cashFlowNotice: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: isDark ? "#173042" : colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cashFlowNoticeInline: {
    marginTop: 0,
    marginBottom: 12,
  },
  cashFlowNoticeText: {
    color: isDark ? "#d8e8f3" : colors.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  cashFlowNoticeButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: isDark ? "#7f6cf0" : colors.slate,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cashFlowNoticeButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
  },
  profileHero: {
    backgroundColor: colors.slate,
    borderRadius: 18,
    padding: 14,
    margin: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  profileHeroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeroAvatarText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "800",
  },
  profileHeroBody: {
    flex: 1,
    minWidth: 0,
  },
  profileHeroName: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
  profileHeroMeta: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    marginTop: 2,
  },
  profileHeroBadges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  profileHeroBadge: {
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  profileHeroBadgeMuted: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  profileHeroBadgeText: {
    color: colors.slate,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  profileHeroBadgeTextMuted: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  profileHeroChevron: {
    width: 24,
    alignItems: "center",
  },
  profileSection: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  profileSectionLabel: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  profileMenuCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  profileMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  profileToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  profileMenuIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  profileMenuBody: {
    flex: 1,
    minWidth: 0,
  },
  profileMenuTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  profileMenuSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  profileSwitch: {
    width: 42,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    padding: 3,
  },
  profileSwitchActive: {
    backgroundColor: colors.brand,
  },
  profileSwitchThumb: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  profileSwitchThumbActive: {
    transform: [{ translateX: 18 }],
  },
  profileStaticChip: {
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  profileStaticChipText: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  profileLogoutButton: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: colors.dangerSoft,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  profileLogoutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  profileFooterText: {
    color: colors.textSoft,
    fontSize: 10.5,
    textAlign: "center",
    marginBottom: 4,
  },
  completedOverview: {
    backgroundColor: colors.slate,
    borderRadius: 20,
    padding: 16,
    margin: 16,
    marginBottom: 14,
    ...shadows.card,
  },
  completedOverviewEyebrow: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  completedOverviewHeader: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  completedOverviewMain: {
    flex: 1,
  },
  completedOverviewTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  completedOverviewIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  completedOverviewStats: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
  },
  completedOverviewStat: {
    flex: 1,
  },
  completedOverviewLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  completedOverviewValue: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  completedHistoryTools: {
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 12,
    gap: 10,
  },
  completedDatePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: isDark ? "#132239" : colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? "rgba(167, 185, 214, 0.18)" : colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.card,
  },
  completedDatePickerText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  completedHistoryReset: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.brandSoft,
  },
  completedHistoryResetText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  completedHistoryHeader: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  completedHistoryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  completedHistorySubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  completedSection: {
    marginHorizontal: 16,
    marginBottom: 14,
  },
  completedSectionTitle: {
    color: isDark ? "#b6c2d7" : colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
    textAlign: "center",
  },
  completedCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  completedCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: isDark ? "#1b2c46" : colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  completedCardBody: {
    flex: 1,
    minWidth: 0,
  },
  completedCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  completedCardCustomer: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  completedCardAmount: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: "800",
  },
  completedCardLocation: {
    color: isDark ? "#a7b3c8" : colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  completedCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  completedCardTime: {
    color: isDark ? "#c0cadb" : colors.textSoft,
    fontSize: 10.5,
    fontWeight: "700",
  },
  completedMethodBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: isDark ? "rgba(154, 140, 241, 0.34)" : colors.accentSoft,
  },
  completedMethodBadgeText: {
    color: isDark ? "#ffffff" : colors.slate,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  completedUnsynced: {
    color: colors.danger,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 19, 31, 0.35)",
    justifyContent: "flex-end",
    padding: 16,
  },
  datePickerSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    maxHeight: "65%",
    ...shadows.card,
  },
  datePickerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  datePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  datePickerOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  detailScroll: {
    paddingBottom: 32,
  },
  detailTopbarBack: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTopbarTitle: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
  },
  detailTopbarDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#28354d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  detailHero: {
    backgroundColor: colors.slate,
    borderRadius: 18,
    padding: 16,
    margin: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  detailHeroEyebrow: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  detailHeroTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 31,
    marginTop: 8,
  },
  detailHeroStats: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  detailHeroStat: {
    minWidth: 84,
  },
  detailHeroStatLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  detailHeroStatValue: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 5,
  },
  detailHeroBadge: {
    alignSelf: "flex-start",
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailHeroBadgeText: {
    color: colors.slate,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailMapCard: {
    height: 146,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#dbeab6",
    position: "relative",
  },
  detailMapGlowA: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    top: -30,
    left: 50,
  },
  detailMapGlowB: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    borderWidth: 18,
    borderColor: "rgba(109, 199, 221, 0.3)",
    top: -24,
    right: -40,
  },
  detailMapDestination: {
    position: "absolute",
    left: 20,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailMapDestinationText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
  },
  detailSectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  detailAddressTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  detailAddressSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  detailActionStack: {
    marginTop: 12,
  },
  detailActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: isDark ? "#15253c" : colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
  },
  detailActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: isDark ? "#223452" : colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  detailActionBody: {
    flex: 1,
  },
  detailActionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  detailActionText: {
    color: isDark ? "#b8c5d8" : colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  detailSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  detailSectionLabel: {
    color: isDark ? "#b4c1d5" : colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  detailSectionMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  detailListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailListIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  detailListBody: {
    flex: 1,
  },
  detailListTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  detailListSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  detailListMeta: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "700",
  },
  detailCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  detailCustomerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: isDark ? "#173042" : colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  detailCustomerBody: {
    flex: 1,
  },
  detailCustomerName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  detailCustomerMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  detailDualActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  detailGhostButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? "rgba(167, 185, 214, 0.2)" : colors.border,
    backgroundColor: isDark ? "#15253c" : colors.surfaceMuted,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexDirection: "row",
  },
  detailGhostButtonText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
  },
  detailGhostButtonTextAlt: {
    color: isDark ? "#e7ecf8" : colors.slate,
    fontSize: 12,
    fontWeight: "800",
  },
  detailEarnedTotal: {
    color: colors.textMuted,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
  },
  detailEarnedTotalValue: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: "800",
  },
  moneyInputCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
  },
  moneyInputLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  moneyInputHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  moneyInput: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: isDark ? "#0f1d31" : colors.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  detailFooterActions: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    gap: 10,
  },
  detailDangerButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  detailDangerButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  detailPrimaryButton: {
    flex: 1.2,
    borderRadius: 14,
    backgroundColor: colors.brand,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  detailPrimaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "800",
  },
  cardRow: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardRowMeta: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  cardRowAmount: {
    flexShrink: 1,
    maxWidth: "46%",
    textAlign: "right",
    color: colors.brand,
    fontWeight: "700",
    fontSize: 20,
    marginTop: 8,
  },
  heroGreen: {
    backgroundColor: colors.brand,
    borderRadius: 28,
    padding: 24,
    margin: 16,
  },
  heroRed: {
    backgroundColor: colors.slate,
    borderRadius: 28,
    padding: 24,
    margin: 16,
  },
  heroEyebrow: {
    color: colors.accentSoft,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroMetricBlock: {
    marginTop: 14,
  },
  heroMetricLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: "700",
  },
  heroMetricValue: {
    color: colors.white,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 6,
  },
  heroMetricSubValue: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 6,
  },
  heroSlate: {
    backgroundColor: colors.slate,
    borderRadius: 28,
    padding: 24,
    margin: 16,
  },
  heroTitle: { color: colors.white, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  heroValue: { color: colors.white, fontSize: 30, fontWeight: "700", marginTop: 8 },
  heroText: { color: "rgba(255,255,255,0.84)", marginTop: 8, fontSize: 16, lineHeight: 22 },
  heroButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heroActionRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  heroButtonText: { color: colors.text, fontWeight: "700" },
  heroSecondaryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heroSecondaryButtonText: { color: colors.white, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, lineHeight: 21 },
  metaLabel: {
    fontSize: 12,
    color: colors.textSoft,
    marginTop: 12,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  addressText: {
    fontSize: 15,
    color: colors.text,
    marginTop: 6,
    lineHeight: 22,
  },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 8, lineHeight: 18 },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
  money: { color: colors.brand, fontWeight: "700", fontSize: 20, marginTop: 8 },
  statusText: { color: colors.danger, marginTop: 8 },
  unsyncedText: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  paymentHint: { color: colors.textMuted, marginTop: 8, fontSize: 14 },
  paymentDue: { color: colors.brand, marginTop: 8, fontSize: 16, fontWeight: "700" },
  moneyBreakdown: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    padding: 12,
    rowGap: 8,
  },
  moneyBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moneyBreakdownLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  moneyBreakdownValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  optionChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  optionChipDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    opacity: 0.6,
  },
  optionChipText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  optionChipTextActive: {
    color: colors.white,
  },
  optionChipTextDisabled: {
    color: colors.textSoft,
  },
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
  buttonDisabled: {
    opacity: 0.7,
  },
  secondaryButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
    marginHorizontal: 16,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  failButton: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, marginTop: 10 },
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 10,
  },
  rowTitle: { color: colors.text, fontWeight: "600" },
  rowMeta: { color: colors.textMuted, marginTop: 4 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  previewWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  previewHeading: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewMeta: {
    flex: 1,
    paddingRight: 12,
  },
  previewTitle: {
    color: colors.text,
    fontWeight: "700",
  },
  previewSub: {
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
  previewAmount: {
    color: colors.brand,
    fontWeight: "800",
  },
  previewTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
    marginTop: 8,
  },
  previewTotalLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  previewTotalValue: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: "800",
  },
  historyCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  historyStatus: {
    color: colors.danger,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  historyItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  });
}
