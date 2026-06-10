import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/src/api/client";
import type { MobileDeliveryDetailResponse, OldItemCollectionStatus, PaymentMethod } from "@/src/types";

export function useDeliveryDetail(id: string | undefined) {
  const [detail, setDetail] = useState<MobileDeliveryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [collectedAmount, setCollectedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [oldItemCollectionStatus, setOldItemCollectionStatus] =
    useState<OldItemCollectionStatus>("pending");
  const [oldItemCollectionRemark, setOldItemCollectionRemark] = useState("");

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiClient.get<MobileDeliveryDetailResponse>(`/api/mobile/v1/deliveries/${id}`);
      setDetail(data);
      setCollectedAmount(data.delivery.payment?.collectedAmount ?? data.delivery.amount);
      setPaymentMethod(data.delivery.payment?.paymentMethod ?? data.delivery.expectedPaymentMethod ?? "cod");
      setPaymentReference(data.delivery.payment?.bankReference ?? data.delivery.payment?.cardReference ?? "");
      setPaymentNote(data.delivery.payment?.referenceNote ?? "");
      setOldItemCollectionStatus(data.delivery.oldItemCollectionStatus ?? "pending");
      setOldItemCollectionRemark(data.delivery.oldItemCollectionRemark ?? "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    detail,
    loading,
    reload,
    collectedAmount,
    setCollectedAmount,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    paymentNote,
    setPaymentNote,
    failureReason,
    setFailureReason,
    oldItemCollectionStatus,
    setOldItemCollectionStatus,
    oldItemCollectionRemark,
    setOldItemCollectionRemark,
  };
}
