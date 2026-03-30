import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";

import { apiClient } from "@/src/api/client";
import { API_BASE_URL } from "@/src/config";
import { AuthProvider, useAuth } from "@/src/providers/auth";
import { SyncProvider, useSync } from "@/src/providers/sync";
import { queueAction } from "@/src/storage/offline-queue";

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

function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Rider phone");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password, deviceName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function testBackend() {
    setDiagnostic("Testing backend...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/mobile/v1/me`);
      const text = await response.text();
      setDiagnostic(`GET /me -> ${response.status}: ${text}`);
    } catch (err) {
      setDiagnostic(err instanceof Error ? err.message : "Unknown network error");
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6f1e7" />
      <ScrollView contentContainerStyle={styles.loginScroll}>
        <View style={styles.loginHero}>
          <Text style={styles.loginBrand}>Cosmo Rider</Text>
          <Text style={styles.loginCopy}>Delivery updates, cash tracking, and handover in one place.</Text>
        </View>

        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Sign in</Text>
          <Text style={styles.subtitle}>Use the same rider account you created from the invite link.</Text>
          <Text style={styles.meta}>API: {API_BASE_URL}</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor="#8c7b64"
          />
          <TextInput
            style={styles.input}
            secureTextEntry={true}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            placeholderTextColor="#8c7b64"
          />
          <TextInput
            style={styles.input}
            placeholder="Device name"
            value={deviceName}
            onChangeText={setDeviceName}
            placeholderTextColor="#8c7b64"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {diagnostic ? <Text style={styles.meta}>{diagnostic}</Text> : null}
          <Pressable style={styles.secondaryButton} onPress={testBackend}>
            <Text style={styles.secondaryButtonText}>Test backend</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? "Signing in..." : "Sign in"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MainView() {
  const { logout } = useAuth();
  const { flushQueue, pendingCount } = useSync();
  const [tab, setTab] = useState<"deliveries" | "completed" | "cash">("deliveries");
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
    return { mode: "queued" as const, message: params.queuedMessage };
  }

  function parseMoney(value: string | null | undefined) {
    const amount = Number.parseFloat(value ?? "");
    return Number.isFinite(amount) ? amount : 0;
  }

  function formatMoney(value: string | null | undefined, currency?: string | null) {
    const amount = parseMoney(value);
    return `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;
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

  function requiresReference(method: PaymentMethod) {
    return method === "bank_transfer" || method === "card";
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
    setCollectedAmount(data.delivery.payment?.collectedAmount ?? data.delivery.amount);
    setCustomerPaidAmount(data.delivery.payment?.collectedAmount ?? data.delivery.amount);
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

  if (selectedDelivery) {
    const expectedMethod = selectedDelivery.expectedPaymentMethod ?? "cod";
    const isCash = paymentMethod === "cod";
    const showReference = requiresReference(paymentMethod);
    const orderAmount = parseMoney(selectedDelivery.amount);
    const customerPaid = parseMoney(customerPaidAmount);
    const changeAmount = Math.max(0, customerPaid - orderAmount);

    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.topbar}>
            <Pressable onPress={() => setSelectedDelivery(null)}>
              <Text style={styles.topbarLink}>Back</Text>
            </Pressable>
            <Pressable onPress={async () => await logout()}>
              <Text style={styles.topbarLink}>Logout</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>{selectedDelivery.orderLabel}</Text>
            <Text style={styles.subtitle}>{selectedDelivery.customerName ?? "Unknown customer"}</Text>
            <Text style={styles.subtitle}>{selectedDelivery.customerPhone ?? "No phone"}</Text>
            <Text style={styles.subtitle}>{selectedDelivery.customerEmail ?? "No email"}</Text>
            <Text style={styles.metaLabel}>Delivery address</Text>
            <Text style={styles.addressText}>{getAddressText(selectedDelivery)}</Text>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={styles.subtitle}>{selectedDelivery.companyLocation?.name ?? "Unknown location"}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Items</Text>
            {(selectedDelivery.lineItems ?? []).map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.rowTitle}>{item.productTitle}</Text>
                <Text style={styles.rowMeta}>
                  {item.quantity} x {item.price}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <Text style={styles.paymentHint}>
              Expected method: {getPaymentMethodLabel(expectedMethod)}
            </Text>
            <Text style={styles.paymentDue}>
              Order amount: {formatMoney(selectedDelivery.amount, selectedDelivery.currency)}
            </Text>
            <View style={styles.optionGrid}>
              {([
                ["cod", "COD"],
                ["bank_transfer", "Bank"],
                ["card", "Card"],
                ["already_paid", "Online"],
              ] as Array<[PaymentMethod, string]>).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[
                    styles.optionChip,
                    paymentMethod === value ? styles.optionChipActive : null,
                  ]}
                  onPress={() => setPaymentMethod(value)}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      paymentMethod === value ? styles.optionChipTextActive : null,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {isCash ? (
              <>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={customerPaidAmount}
                  onChangeText={(value) => {
                    setCustomerPaidAmount(value);
                    setCollectedAmount(selectedDelivery.amount);
                  }}
                  placeholder="Customer gave"
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
              </>
            ) : (
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={collectedAmount}
                onChangeText={setCollectedAmount}
                placeholder="Amount"
              />
            )}
            {showReference ? (
              <TextInput
                style={styles.input}
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Invoice / reference number"
              />
            ) : null}
            {!showReference ? (
              <TextInput
                style={styles.input}
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="Note (optional)"
              />
            ) : null}
            <Pressable
              style={[styles.button, deliverySubmitting ? styles.buttonDisabled : null]}
              onPress={() => void queueDelivered()}
              disabled={deliverySubmitting}
            >
              <Text style={styles.buttonText}>
                {deliverySubmitting ? "Completing..." : "Save payment and complete"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Failed delivery</Text>
            <TextInput
              style={styles.input}
              value={failureReason}
              onChangeText={setFailureReason}
              placeholder="Reason"
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
      <StatusBar barStyle="dark-content" backgroundColor="#f6f1e7" />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.topbarBrand}>Cosmo Rider</Text>
          <Text style={styles.topbarSub}>Rider workspace</Text>
        </View>
        <Pressable onPress={async () => await logout()} style={styles.logoutPill}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.segmentWrap}>
        <View style={styles.segmentedControl}>
          <Pressable onPress={() => setTab("deliveries")}>
            <Text style={tab === "deliveries" ? styles.segmentActive : styles.segmentIdle}>Deliveries</Text>
          </Pressable>
          <Pressable onPress={() => setTab("completed")}>
            <Text style={tab === "completed" ? styles.segmentActive : styles.segmentIdle}>Completed</Text>
          </Pressable>
          <Pressable onPress={() => setTab("cash")}>
            <Text style={tab === "cash" ? styles.segmentActive : styles.segmentIdle}>Cash</Text>
          </Pressable>
        </View>
      </View>

      {tab === "deliveries" ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDeliveries} />}
          contentContainerStyle={styles.content}
        >
          <View style={styles.heroGreen}>
            <Text style={styles.heroTitle}>Today&apos;s route</Text>
            <Text style={styles.heroText}>{pendingCount} offline action(s) waiting to sync.</Text>
            <Pressable style={styles.heroButton} onPress={() => void flushQueue()}>
              <Text style={styles.heroButtonText}>Sync now</Text>
            </Pressable>
          </View>
          {deliveries
            .filter((delivery) => ACTIVE_DELIVERY_STATUSES.has(delivery.deliveryStatus))
            .map((delivery) => (
            <Pressable
              key={delivery.id}
              style={styles.feedCard}
              onPress={() => void loadDetail(delivery.id)}
            >
              <Text style={styles.sectionTitle}>{delivery.orderLabel}</Text>
              <Text style={styles.subtitle}>{delivery.customerName ?? "Unknown customer"}</Text>
              <Text style={styles.subtitle}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
              <Text style={styles.money}>{delivery.amount}</Text>
              <Text style={styles.meta}>
                Payment: {getPaymentMethodLabel(delivery.expectedPaymentMethod)}
              </Text>
              <Text style={styles.statusText}>
                {delivery.deliveryStatus}
                {delivery.payment ? ` | ${delivery.payment.collectionStatus}` : ""}
              </Text>
            </Pressable>
          ))}
          {deliveries.filter((delivery) => ACTIVE_DELIVERY_STATUSES.has(delivery.deliveryStatus)).length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>No active deliveries</Text>
              <Text style={styles.subtitle}>Completed orders will move to the Completed tab.</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : tab === "completed" ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDeliveries} />}
          contentContainerStyle={styles.content}
        >
          <View style={styles.heroSlate}>
            <Text style={styles.heroTitle}>Completed deliveries</Text>
            <Text style={styles.heroText}>Delivered orders with their completion time.</Text>
          </View>
          {deliveries.filter((delivery) => delivery.deliveryStatus === "completed").map((delivery) => (
            <View key={delivery.id} style={styles.feedCard}>
              <Text style={styles.sectionTitle}>{delivery.orderLabel}</Text>
              <Text style={styles.subtitle}>{delivery.customerName ?? "Unknown customer"}</Text>
              <Text style={styles.subtitle}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
              <Text style={styles.money}>{delivery.amount}</Text>
              <Text style={styles.meta}>
                Completed: {delivery.completedAt ? new Date(delivery.completedAt).toLocaleString("en-LK") : "Just now"}
              </Text>
              <Text style={styles.meta}>
                Payment: {getPaymentMethodLabel(delivery.payment?.paymentMethod ?? delivery.expectedPaymentMethod)}
              </Text>
            </View>
          ))}
          {deliveries.filter((delivery) => delivery.deliveryStatus === "completed").length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>No completed orders</Text>
              <Text style={styles.subtitle}>Completed deliveries will appear here automatically.</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroRed}>
            <Text style={styles.heroTitle}>Collected cash</Text>
            <Text style={styles.heroValue}>{summary?.totalCollectedCash ?? "0.00"}</Text>
            <Text style={styles.heroText}>Expected: {summary?.totalExpectedCash ?? "0.00"}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Handover preview</Text>
            <Text style={styles.subtitle}>
              Review invoice numbers and amounts before submitting the handover.
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => setShowHandoverPreview((current) => !current)}
            >
              <Text style={styles.buttonText}>
                {showHandoverPreview ? "Hide preview" : "Preview handover"}
              </Text>
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
                    <Text style={styles.previewAmount}>{order.collectedAmount}</Text>
                  </View>
                ))}
                <Text style={styles.previewHeading}>Location totals</Text>
                {(summary?.groups ?? []).map((group) => (
                  <View key={group.companyLocationId} style={styles.previewRow}>
                    <View style={styles.previewMeta}>
                      <Text style={styles.previewTitle}>{group.companyLocationName}</Text>
                      <Text style={styles.previewSub}>{group.orderCount} orders</Text>
                    </View>
                    <Text style={styles.previewAmount}>{group.cashAmount}</Text>
                  </View>
                ))}
                <View style={styles.previewTotalRow}>
                  <Text style={styles.previewTotalLabel}>Total handover</Text>
                  <Text style={styles.previewTotalValue}>{summary?.totalCollectedCash ?? "0.00"}</Text>
                </View>
                <Pressable
                  style={[styles.button, handoverSubmitting ? styles.buttonDisabled : null]}
                  onPress={() => void submitHandover()}
                  disabled={handoverSubmitting}
                >
                  <Text style={styles.buttonText}>
                    {handoverSubmitting ? "Submitting..." : "Confirm handover"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {(summary?.groups ?? []).map((group) => (
            <View key={group.companyLocationId} style={styles.cardRow}>
              <View>
                <Text style={styles.rowTitle}>{group.companyLocationName}</Text>
                <Text style={styles.rowMeta}>{group.orderCount} orders</Text>
              </View>
              <Text style={styles.money}>{group.cashAmount}</Text>
            </View>
          ))}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Handover history</Text>
            {handoverHistory.map((handover) => (
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
                  Total: {handover.totalHandedOverCash} | Variance: {handover.varianceAmount}
                </Text>
                {handover.items.map((item) => (
                  <View key={item.id} style={styles.historyItemRow}>
                    <Text style={styles.previewTitle}>{item.companyLocationName}</Text>
                    <Text style={styles.previewAmount}>{item.cashAmount}</Text>
                  </View>
                ))}
              </View>
            ))}
            {handoverHistory.length === 0 ? (
              <Text style={styles.subtitle}>No handover history yet.</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AppShell() {
  const { session, bootstrapped } = useAuth();

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
    <AuthProvider>
      <SyncProvider>
        <AppShell />
      </SyncProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f6f1e7",
    paddingTop: ANDROID_STATUSBAR_HEIGHT,
  },
  content: { padding: 16, paddingBottom: 28 },
  loginScroll: { padding: 20, paddingTop: 24, paddingBottom: 40 },
  loginHero: {
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 20,
  },
  loginBrand: {
    fontSize: 42,
    fontWeight: "800",
    color: "#2f261b",
    letterSpacing: -1,
  },
  loginCopy: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 23,
    color: "#6f5f4a",
    maxWidth: 320,
  },
  loginCard: {
    backgroundColor: "#fffaf2",
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: "#eadcc7",
    shadowColor: "#2f261b",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2f261b",
  },
  topbar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: "#fffaf2",
    borderBottomWidth: 1,
    borderBottomColor: "#eadcc7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topbarBrand: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2f261b",
  },
  topbarSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#7a6b56",
  },
  logoutPill: {
    backgroundColor: "#f2e2cf",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutText: {
    color: "#8a2f2f",
    fontWeight: "700",
  },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: "#f6f1e7",
  },
  segmentedControl: {
    backgroundColor: "#eadcc7",
    borderRadius: 999,
    padding: 6,
    flexDirection: "row",
    alignSelf: "flex-start",
    columnGap: 6,
  },
  segmentIdle: {
    color: "#6f5f4a",
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  segmentActive: {
    color: "#1d6b57",
    backgroundColor: "#fffaf2",
    fontWeight: "800",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    overflow: "hidden",
  },
  card: {
    backgroundColor: "#fffaf2",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eadcc7",
    margin: 16,
  },
  feedCard: {
    backgroundColor: "#fffaf2",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#eadcc7",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardRow: {
    backgroundColor: "#fffaf2",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eadcc7",
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroGreen: {
    backgroundColor: "#1d6b57",
    borderRadius: 28,
    padding: 24,
    margin: 16,
  },
  heroRed: {
    backgroundColor: "#8a2f2f",
    borderRadius: 28,
    padding: 24,
    margin: 16,
  },
  heroSlate: {
    backgroundColor: "#48556a",
    borderRadius: 28,
    padding: 24,
    margin: 16,
  },
  heroTitle: { color: "white", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  heroValue: { color: "white", fontSize: 30, fontWeight: "700", marginTop: 8 },
  heroText: { color: "#f6ecec", marginTop: 8, fontSize: 16, lineHeight: 22 },
  heroButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#f8d57e",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heroButtonText: { color: "#3d2f1d", fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "800", color: "#2f261b" },
  subtitle: { fontSize: 15, color: "#7d6a52", marginTop: 6, lineHeight: 21 },
  metaLabel: {
    fontSize: 12,
    color: "#8b7b65",
    marginTop: 12,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  addressText: {
    fontSize: 15,
    color: "#3d2f1d",
    marginTop: 6,
    lineHeight: 22,
  },
  meta: { fontSize: 12, color: "#7d6a52", marginTop: 8, lineHeight: 18 },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#2f261b" },
  money: { color: "#1d6b57", fontWeight: "700", fontSize: 20, marginTop: 8 },
  statusText: { color: "#8a2f2f", marginTop: 8 },
  paymentHint: { color: "#6f5f4a", marginTop: 8, fontSize: 14 },
  paymentDue: { color: "#1d6b57", marginTop: 8, fontSize: 16, fontWeight: "700" },
  moneyBreakdown: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#eadcc7",
    borderRadius: 14,
    backgroundColor: "#fff8d4",
    padding: 12,
    rowGap: 8,
  },
  moneyBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moneyBreakdownLabel: {
    color: "#6f5f4a",
    fontSize: 14,
    fontWeight: "600",
  },
  moneyBreakdownValue: {
    color: "#2f261b",
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
    borderColor: "#d5c2a4",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fffaf2",
  },
  optionChipActive: {
    backgroundColor: "#1d6b57",
    borderColor: "#1d6b57",
  },
  optionChipText: {
    color: "#6f5f4a",
    fontWeight: "700",
  },
  optionChipTextActive: {
    color: "#fffaf2",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d5c2a4",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff8d4",
    marginTop: 12,
    fontSize: 16,
    color: "#2f261b",
  },
  button: {
    backgroundColor: "#1d6b57",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
    marginHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  secondaryButton: {
    backgroundColor: "#efe2b7",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
    marginHorizontal: 16,
  },
  secondaryButtonText: { color: "#3d2f1d", fontWeight: "700" },
  failButton: { backgroundColor: "#8a2f2f" },
  buttonText: { color: "white", fontWeight: "700" },
  error: { color: "#b42318", marginTop: 10 },
  row: {
    borderTopWidth: 1,
    borderTopColor: "#f1e6d7",
    paddingTop: 10,
    marginTop: 10,
  },
  rowTitle: { color: "#3d2f1d", fontWeight: "600" },
  rowMeta: { color: "#7d6a52", marginTop: 4 },
  emptyCard: {
    backgroundColor: "#fffaf2",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#eadcc7",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  previewWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eadcc7",
    paddingTop: 12,
  },
  previewHeading: {
    color: "#6f5f4a",
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
    borderBottomColor: "#f1e6d7",
  },
  previewMeta: {
    flex: 1,
    paddingRight: 12,
  },
  previewTitle: {
    color: "#2f261b",
    fontWeight: "700",
  },
  previewSub: {
    color: "#7d6a52",
    marginTop: 2,
    fontSize: 12,
  },
  previewAmount: {
    color: "#1d6b57",
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
    color: "#2f261b",
    fontSize: 16,
    fontWeight: "800",
  },
  previewTotalValue: {
    color: "#8a2f2f",
    fontSize: 18,
    fontWeight: "800",
  },
  historyCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#eadcc7",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff8f0",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyTitle: {
    color: "#2f261b",
    fontSize: 16,
    fontWeight: "800",
  },
  historyStatus: {
    color: "#8a2f2f",
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
