"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerResponse, FollowUpStatus } from "@/lib/abandoned-orders-constants";
import { CUSTOMER_RESPONSE_LABELS, FOLLOW_UP_STATUS_LABELS } from "@/lib/abandoned-orders-constants";

export function AbandonedOrderFollowUpForm({
  initialFollowUpStatus,
  initialCustomerResponse,
  initialRemark,
  onSubmit,
  busy,
}: {
  initialFollowUpStatus: FollowUpStatus;
  initialCustomerResponse: CustomerResponse | null;
  initialRemark: string | null;
  busy: boolean;
  onSubmit: (values: {
    followUpStatus: FollowUpStatus;
    customerResponse: CustomerResponse | null;
    remark: string | undefined;
  }) => Promise<void>;
}) {
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>(initialFollowUpStatus);
  const [customerResponse, setCustomerResponse] = useState<CustomerResponse | null>(initialCustomerResponse);
  const [remark, setRemark] = useState<string>(initialRemark ?? "");

  const isClosing = followUpStatus === "closed";
  const [error, setError] = useState<string | null>(null);

  const responseRequiredError = useMemo(() => {
    if (!isClosing) return null;
    if (customerResponse) return null;
    return "Customer response is required when closing follow-up.";
  }, [customerResponse, isClosing]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);

        if (responseRequiredError) {
          setError(responseRequiredError);
          return;
        }

        void onSubmit({
          followUpStatus,
          customerResponse: isClosing ? customerResponse : customerResponse,
          remark: remark.trim() ? remark.trim() : undefined,
        }).catch((e) => {
          setError(e instanceof Error ? e.message : "Failed to save follow-up");
        });
      }}
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">Follow-up status</label>
        <Select value={followUpStatus} onValueChange={(v) => setFollowUpStatus(v as FollowUpStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FOLLOW_UP_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isClosing && (
        <div className="space-y-1">
          <label className="text-sm font-medium">Customer response</label>
          <Select
            value={customerResponse ?? undefined}
            onValueChange={(v) => setCustomerResponse(v as CustomerResponse)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a response" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CUSTOMER_RESPONSE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">Remark (optional)</label>
        <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add a call note or outcome detail..." />
      </div>

      {error && <div className="text-sm text-rose-700">{error}</div>}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

