"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RiderDeliveryConfirmProps {
  token: string;
}

export function RiderDeliveryConfirm({ token }: RiderDeliveryConfirmProps) {
  const [orderName, setOrderName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<"success" | "declined" | null>(null);

  useEffect(() => {
    fetch(`/api/public/rider-delivery/${token}`)
      .then((r) => r.json())
      .then((data: { orderName?: string; error?: string }) => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrderName(data.orderName ?? null);
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleConfirm(confirmed: boolean) {
    setConfirming(true);
    try {
      const res = await fetch(`/api/public/rider-delivery/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      setResult(confirmed ? "success" : "declined");
    } catch {
      setError("Failed to update");
    } finally {
      setConfirming(false);
    }
  }

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
        <Card className="max-w-md">
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
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>
              {result === "success" ? (
                <span className="flex items-center gap-2 text-green-600">
                  <Check className="size-5" />
                  Delivery Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-600">
                  <X className="size-5" />
                  Declined
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {result === "success"
                ? "Thank you. The delivery has been marked as complete."
                : "You declined the delivery. Staff can mark it complete manually if needed."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Delivery Confirmation</CardTitle>
          <p className="text-muted-foreground text-sm">
            Did you deliver order {orderName ?? ""} successfully?
          </p>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            className="flex-1"
            onClick={() => handleConfirm(true)}
            disabled={confirming}
          >
            {confirming ? (
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
            onClick={() => handleConfirm(false)}
            disabled={confirming}
          >
            <X className="size-4" />
            No
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
