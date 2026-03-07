"use client";

import { useState, useEffect } from "react";
import { Loader2, MessageSquare, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/lib/notify";

const TRIGGER_LABELS: Record<string, string> = {
  order_received: "Order Received",
  package_ready: "Package Ready",
  dispatched: "Dispatched (Customer)",
  rider_dispatched: "Rider Dispatched",
  delivery_complete: "Delivery Complete",
};

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  order_received: "When a new order is received from Shopify",
  package_ready: "When package is marked ready to dispatch",
  dispatched: "When order is dispatched (to customer)",
  rider_dispatched: "When rider is assigned (includes delivery confirmation URL)",
  delivery_complete: "When delivery is confirmed",
};

type SmsConfig = {
  trigger: string;
  id: string | null;
  enabled: boolean;
  sendToCustomer: boolean;
  sendToRider: boolean;
  template: string;
  additionalRecipients: string[];
};

interface SmsNotificationsSettingsFormProps {
  canEdit: boolean;
}

const PLACEHOLDERS = [
  "{orderNumber}",
  "{customerName}",
  "{locationName}",
  "{deliveryUrl}",
  "{riderName}",
];

function configsEqual(a: SmsConfig, b: SmsConfig): boolean {
  const recipientsA = [...a.additionalRecipients].sort().join(",");
  const recipientsB = [...b.additionalRecipients].sort().join(",");
  return (
    a.enabled === b.enabled &&
    a.sendToCustomer === b.sendToCustomer &&
    a.sendToRider === b.sendToRider &&
    a.template === b.template &&
    recipientsA === recipientsB
  );
}

export function SmsNotificationsSettingsForm({
  canEdit,
}: SmsNotificationsSettingsFormProps) {
  const [configs, setConfigs] = useState<SmsConfig[]>([]);
  const [lastSaved, setLastSaved] = useState<SmsConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  useEffect(() => {
    fetch("/api/admin/settings/sms-notifications")
      .then((r) => r.json())
      .then((data) => {
        setConfigs(data);
        setLastSaved(data);
      })
      .catch(() => setConfigs([]))
      .finally(() => setLoading(false));
  }, []);

  function updateConfig(trigger: string, updates: Partial<SmsConfig>) {
    setConfigs((prev) =>
      prev.map((c) => (c.trigger === trigger ? { ...c, ...updates } : c))
    );
  }

  function hasChanges(config: SmsConfig): boolean {
    const saved = lastSaved.find((s) => s.trigger === config.trigger);
    return !saved || !configsEqual(config, saved);
  }

  async function saveConfig(config: SmsConfig) {
    if (!canEdit) return;
    setBusyKey(config.trigger);
    try {
      const res = await fetch("/api/admin/settings/sms-notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: config.trigger,
          enabled: config.enabled,
          sendToCustomer: config.sendToCustomer,
          sendToRider: config.sendToRider,
          template: config.template,
          additionalRecipients: config.additionalRecipients.join(", "),
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save");
        return;
      }
      notify.success("Saved.");
      setLastSaved((prev) =>
        prev.map((c) => (c.trigger === config.trigger ? { ...config } : c))
      );
    } catch {
      notify.error("Failed to save");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SMS Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-5" />
          SMS Notifications
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Configure SMS messages for order lifecycle. Use placeholders:{" "}
          {PLACEHOLDERS.join(", ")}. Enable each trigger and click Save. Customer SMS requires a phone number on the order—add additional recipients for testing.
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        {configs.map((config) => (
          <div
            key={config.trigger}
            className="rounded-lg border p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">
                  {TRIGGER_LABELS[config.trigger] ?? config.trigger}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {TRIGGER_DESCRIPTIONS[config.trigger]}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Enable</span>
                  <Switch
                    id={`enabled-${config.trigger}`}
                    checked={config.enabled}
                    onCheckedChange={(checked) =>
                      updateConfig(config.trigger, { enabled: checked })
                    }
                    disabled={isBusy}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-6">
              {config.trigger !== "rider_dispatched" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={config.sendToCustomer}
                    onCheckedChange={(checked) =>
                      updateConfig(config.trigger, { sendToCustomer: checked })
                    }
                    disabled={!canEdit || isBusy}
                  />
                  <span className="text-sm">Send to customer</span>
                </label>
              )}
              {config.trigger === "rider_dispatched" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={config.sendToRider}
                    onCheckedChange={(checked) =>
                      updateConfig(config.trigger, { sendToRider: checked })
                    }
                    disabled={!canEdit || isBusy}
                  />
                  <span className="text-sm">Send to rider</span>
                </label>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor={`template-${config.trigger}`} className="text-sm font-medium">Message template</label>
              <Input
                id={`template-${config.trigger}`}
                value={config.template}
                onChange={(e) =>
                  updateConfig(config.trigger, { template: e.target.value })
                }
                disabled={!canEdit || isBusy}
                placeholder="Hi! Your order {orderNumber}..."
                className="font-mono text-sm"
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={`recipients-${config.trigger}`} className="text-sm font-medium">
                Additional recipients (comma-separated phone numbers)
              </label>
              <Input
                id={`recipients-${config.trigger}`}
                value={config.additionalRecipients.join(", ")}
                onChange={(e) =>
                  updateConfig(config.trigger, {
                    additionalRecipients: e.target.value
                      .split(/[,\n]/)
                      .map((p) => p.trim())
                      .filter(Boolean),
                  })
                }
                disabled={!canEdit || isBusy}
                placeholder="0771234567, 0779876543"
              />
            </div>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => saveConfig(config)}
                disabled={isBusy || !hasChanges(config)}
              >
                {busyKey === config.trigger ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
