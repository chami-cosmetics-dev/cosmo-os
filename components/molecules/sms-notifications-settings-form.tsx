"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Loader2, MessageSquare, Save } from "lucide-react";

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
  dispatched: "When order is dispatched to customer",
  rider_dispatched: "When rider is assigned with delivery confirmation URL",
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

export function SmsNotificationsSettingsForm({ canEdit }: SmsNotificationsSettingsFormProps) {
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
    setConfigs((prev) => prev.map((c) => (c.trigger === trigger ? { ...c, ...updates } : c)));
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
      notify.success("SMS notification updated.");
      setLastSaved((prev) => prev.map((c) => (c.trigger === config.trigger ? { ...config } : c)));
    } catch {
      notify.error("Failed to save");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>SMS Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading SMS notification settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  const changedCount = configs.filter((config) => hasChanges(config)).length;
  const enabledCount = configs.filter((config) => config.enabled).length;

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-5" />
          SMS Notifications
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure SMS rules for each order lifecycle event. Customer delivery requires a phone
          number on the order.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trigger Rules
            </p>
            <p className="mt-2 text-2xl font-semibold">{configs.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Lifecycle events available for SMS notifications.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Enabled Rules
            </p>
            <p className="mt-2 text-2xl font-semibold">{enabledCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Notifications currently active.</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pending Changes
            </p>
            <p className="mt-2 text-2xl font-semibold">{changedCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {changedCount > 0 ? "Save updated cards before leaving." : "No unsaved changes."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick Placeholder Tokens
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLACEHOLDERS.map((placeholder) => (
              <span
                key={placeholder}
                className="inline-flex items-center rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-mono"
              >
                {placeholder}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {configs.map((config) => (
            <div
              key={config.trigger}
              className="space-y-4 rounded-xl border bg-background/80 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">{TRIGGER_LABELS[config.trigger] ?? config.trigger}</h3>
                  <p className="text-xs text-muted-foreground">
                    {TRIGGER_DESCRIPTIONS[config.trigger]}
                  </p>
                </div>
                {canEdit ? (
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
                ) : null}
              </div>

              <div className="flex flex-wrap gap-6">
                {config.trigger !== "rider_dispatched" ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch
                      checked={config.sendToCustomer}
                      onCheckedChange={(checked) =>
                        updateConfig(config.trigger, { sendToCustomer: checked })
                      }
                      disabled={!canEdit || isBusy}
                    />
                    <span className="text-sm">Send to customer</span>
                  </label>
                ) : null}
                {config.trigger === "rider_dispatched" ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch
                      checked={config.sendToRider}
                      onCheckedChange={(checked) =>
                        updateConfig(config.trigger, { sendToRider: checked })
                      }
                      disabled={!canEdit || isBusy}
                    />
                    <span className="text-sm">Send to rider</span>
                  </label>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor={`template-${config.trigger}`} className="text-sm font-medium">
                  Message template
                </label>
                <Input
                  id={`template-${config.trigger}`}
                  value={config.template}
                  onChange={(e) => updateConfig(config.trigger, { template: e.target.value })}
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

              {canEdit ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="sm"
                    onClick={() => saveConfig(config)}
                    disabled={isBusy || !hasChanges(config)}
                    className="min-w-32"
                  >
                    {busyKey === config.trigger ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        Save changes
                      </>
                    )}
                  </Button>
                  {!hasChanges(config) ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleCheck className="size-3.5" aria-hidden />
                      Up to date
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
