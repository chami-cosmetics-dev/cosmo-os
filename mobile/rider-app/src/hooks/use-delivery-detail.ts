import { useCallback, useEffect, useState } from "react";
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
        setPaymentLines([
          createDefaultPaymentLine(
            data.delivery.payment?.collectedAmount ?? data.delivery.amount,
            method
          ),
        ]);
      }
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
    paymentLines,
    setPaymentLines,
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
