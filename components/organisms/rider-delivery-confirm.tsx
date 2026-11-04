"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const CANCEL_REASONS = [
  "Customer not home / not answering",
  "Couldn't find address",
  "Customer refused delivery",
  "Package damaged",
];

interface RiderDeliveryConfirmProps {
  token: string;
}

type View = "confirm" | "cancel_reason";

type PaymentChangeOption = {
  key: string;
  label: string;
};

type PaymentChange = {
  enabled: boolean;
  current: PaymentChangeOption;
  options: PaymentChangeOption[];
};

export function RiderDeliveryConfirm({ token }: RiderDeliveryConfirmProps) {
  const [orderName, setOrderName] = useState<string | null>(null);
  const [paymentChange, setPaymentChange] = useState<PaymentChange | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"delivered" | "cancelled" | null>(null);
  const [view, setView] = useState<View>("confirm");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");

  useEffect(() => {
    fetch(`/api/public/rider-delivery/${token}`)
      .then((r) => r.json())
      .then((data: { orderName?: string; error?: string; paymentChange?: PaymentChange | null }) => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrderName(data.orderName ?? null);
          setPaymentChange(data.paymentChange ?? null);
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/rider-delivery/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          ...(paymentMethod ? { paymentMethod } : {}),
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      setResult("delivered");
    } catch {
      setError("Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    const reason =
      selectedReason === "Other"
        ? otherReason.trim()
        : selectedReason ?? "";

    if (!reason) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/rider-delivery/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: false, failureReason: reason }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      setResult("cancelled");
    } catch {
      setError("Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmitCancel =
    selectedReason !== null &&
    (selectedReason !== "Other" || otherReason.trim().length > 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-12 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid or Expired Link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              {result === "delivered" ? (
                <span className="flex items-center gap-2 text-green-600">
                  <Check className="size-5" />
                  Delivery Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-600">
                  <X className="size-5" />
                  Delivery Cancelled
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {result === "delivered"
                ? "Thank you. The delivery has been marked as complete."
                : "The order has been returned to the store. Staff have been notified."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "cancel_reason") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground mb-2 hover:text-foreground transition-colors"
              onClick={() => {
                setView("confirm");
                setSelectedReason(null);
                setOtherReason("");
              }}
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
            <CardTitle>Why couldn&apos;t you deliver?</CardTitle>
            <p className="text-muted-foreground text-sm">Order {orderName ?? ""}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedReason(reason)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    selectedReason === reason
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  {reason}
                </button>
              ))}
              <button
                onClick={() => setSelectedReason("Other")}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  selectedReason === "Other"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                Other
              </button>
            </div>

            {selectedReason === "Other" && (
              <Textarea
                placeholder="Describe the reason..."
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
            )}

            <Button
              variant="destructive"
              className="mt-1"
              disabled={!canSubmitCancel || submitting}
              onClick={handleCancel}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm Cancellation"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Delivery Confirmation</CardTitle>
          <p className="text-muted-foreground text-sm">
            Did you deliver order {orderName ?? ""} successfully?
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {paymentChange ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Change payment method to</span>
              <select
                className="border-input bg-background h-10 rounded-md border px-3"
                value={paymentMethod}
                disabled={submitting}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="">Keep {paymentChange.current.label}</option>
                {paymentChange.options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex gap-4">
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Check className="size-4" />
                  Yes, Delivered
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setView("cancel_reason")}
              disabled={submitting}
            >
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
