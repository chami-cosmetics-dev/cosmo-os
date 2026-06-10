import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useAuth } from "@/src/providers/auth";
import type { MobileDeliveryDetailResponse, OldItemCollectionStatus, PaymentMethod } from "@/src/types";
import type { TenantId } from "@/src/tenants/config";
import { isTenantId } from "@/src/tenants/config";

export function useDeliveryDetail(tenantParam: string | undefined, id: string | undefined) {
  const { activeTenantIds } = useAuth();
  const tenant = isTenantId(tenantParam) ? tenantParam : undefined;
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
    if (!id || !tenant || !activeTenantIds.includes(tenant)) return;
    setLoading(true);
    try {
      const data = await apiClient.get<MobileDeliveryDetailResponse>(
        tenant,
        `/api/mobile/v1/deliveries/${id}`
      );
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
  }, [activeTenantIds, id, tenant]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    tenant: tenant as TenantId | undefined,
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
