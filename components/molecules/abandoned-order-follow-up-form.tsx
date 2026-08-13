"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerResponse, FollowUpStatus, RemarkTemplateId } from "@/lib/abandoned-orders-constants";
import {
  CUSTOMER_RESPONSE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  MANUAL_CUSTOMER_RESPONSES,
  REMARK_TEMPLATES,
  matchRemarkTemplateId,
} from "@/lib/abandoned-orders-constants";

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
  const [customerResponse, setCustomerResponse] = useState<CustomerResponse | null>(() =>
    initialCustomerResponse &&
    (MANUAL_CUSTOMER_RESPONSES as readonly string[]).includes(initialCustomerResponse)
      ? initialCustomerResponse
      : null
  );
  const [remarkTemplateId, setRemarkTemplateId] = useState<RemarkTemplateId>(() =>
    matchRemarkTemplateId(initialRemark)
  );
  const [remark, setRemark] = useState<string>(initialRemark ?? "");

  const isClosing = followUpStatus === "closed";
  const [error, setError] = useState<string | null>(null);

  function applyRemarkTemplate(id: RemarkTemplateId) {
    setRemarkTemplateId(id);
    if (id === "custom") {
      setRemark("");
      return;
    }
    const template = REMARK_TEMPLATES.find((t) => t.id === id);
    setRemark(template?.label ?? "");
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);

        void onSubmit({
          followUpStatus,
          customerResponse: isClosing ? customerResponse : null,
          remark: remark.trim() ? remark.trim() : undefined,
        }).catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to save follow-up");
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
          <label className="text-sm font-medium">Customer response (optional)</label>
          <Select
            value={customerResponse ?? undefined}
            onValueChange={(v) => {
              const next = v as CustomerResponse;
              setCustomerResponse(next);
              if (remarkTemplateId !== "custom" || !remark.trim()) {
                applyRemarkTemplate(next as RemarkTemplateId);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a response" />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_CUSTOMER_RESPONSES.map((key) => (
                <SelectItem key={key} value={key}>
                  {CUSTOMER_RESPONSE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">Remark template</label>
        <Select
          value={remarkTemplateId}
          onValueChange={(v) => applyRemarkTemplate(v as RemarkTemplateId)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            {REMARK_TEMPLATES.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">
          Remark {remarkTemplateId === "custom" ? "(custom)" : "(optional)"}
        </label>
        <Textarea
          value={remark}
          onChange={(e) => {
            const next = e.target.value;
            setRemark(next);
            setRemarkTemplateId(matchRemarkTemplateId(next));
          }}
          placeholder={
            remarkTemplateId === "custom"
              ? "Type a custom remark..."
              : "Add a call note or outcome detail..."
          }
        />
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
