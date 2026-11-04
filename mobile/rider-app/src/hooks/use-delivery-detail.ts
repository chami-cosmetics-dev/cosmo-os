import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiClient } from "@/src/api/client";
import { createDefaultPaymentLine, type PaymentLineDraft } from "@/src/components/payment-form";
import { useAuth } from "@/src/providers/auth";
import type { MobileDeliveryDetailResponse, OldItemCollectionStatus, PaymentMethod } from "@/src/types";
import type { TenantId } from "@/src/tenants/config";
import { isTenantId } from "@/src/tenants/config";

export function useDeliveryDetail(tenantParam: string | undefined, id: string | undefined) {
  const { activeTenantIds } = useAuth();
  const tenant = isTenantId(tenantParam) ? tenantParam : undefined;
  const [detail, setDetail] = useState<MobileDeliveryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentLines, setPaymentLines] = useState<PaymentLineDraft[]>([
    createDefaultPaymentLine(""),
  ]);
  const [customerGaveAmount, setCustomerGaveAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [oldItemCollectionStatus, setOldItemCollectionStatus] =
    useState<OldItemCollectionStatus>("pending");
  const [oldItemCollectionRemark, setOldItemCollectionRemark] = useState("");
  const [cardSlipUri, setCardSlipUri] = useState<string | null>(null);
  const [cardSlipBase64, setCardSlipBase64] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id || !tenant || !activeTenantIds.includes(tenant)) return;
    setLoading(true);
    try {
      const data = await apiClient.get<MobileDeliveryDetailResponse>(
        tenant,
        `/api/mobile/v1/deliveries/${id}`
      );
      setDetail(data);
      const existingLines = data.delivery.payment?.lines;
      if (existingLines && existingLines.length > 0) {
        setPaymentLines(
          existingLines.map((line) => ({
            id: `existing-${line.paymentMethod}-${line.amount}`,
            paymentMethod: line.paymentMethod,
            amount: line.amount,
            reference: line.bankReference ?? line.cardReference ?? "",
          }))
        );
      } else {
        const method =
          (data.delivery.payment?.paymentMethod as PaymentMethod | undefined) ??
          (data.delivery.expectedPaymentMethod as PaymentMethod | undefined) ??
          "cod";
        const allowed = data.delivery.allowedPaymentMethods;
        const safeMethod =
          allowed?.length && !allowed.includes(method) ? allowed[0]! : method;
        setPaymentLines([
          createDefaultPaymentLine(
            data.delivery.payment?.collectedAmount ?? data.delivery.amount,
            safeMethod
          ),
        ]);
      }
      setPaymentNote(data.delivery.payment?.referenceNote ?? "");
      setCustomerGaveAmount(data.delivery.payment?.customerGaveAmount ?? "");
      setOldItemCollectionStatus(data.delivery.oldItemCollectionStatus ?? "pending");
      setOldItemCollectionRemark(data.delivery.oldItemCollectionRemark ?? "");
      setCardSlipUri(null);
      setCardSlipBase64(null);
    } finally {
      setLoading(false);
    }
  }, [activeTenantIds, id, tenant]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function pickCardSlip() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!library.granted) {
        Alert.alert("Permission needed", "Allow camera or photos to capture the card slip.");
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.55,
      base64: true,
      allowsEditing: true,
    }).catch(async () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.55,
        base64: true,
        allowsEditing: true,
      })
    );

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Photo failed", "Could not read the slip photo. Try again.");
      return;
    }
    setCardSlipUri(asset.uri);
    setCardSlipBase64(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`);
  }

  return {
    tenant: tenant as TenantId | undefined,
    detail,
    loading,
    reload,
    paymentLines,
    setPaymentLines,
    customerGaveAmount,
    setCustomerGaveAmount,
    paymentNote,
    setPaymentNote,
    failureReason,
    setFailureReason,
    oldItemCollectionStatus,
    setOldItemCollectionStatus,
    oldItemCollectionRemark,
    setOldItemCollectionRemark,
    cardSlipUri,
    cardSlipBase64,
    pickCardSlip,
  };
}
