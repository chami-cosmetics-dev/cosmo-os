"use client";

import { useState, useEffect } from "react";
import { Loader2, MessageSquare, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  const [forbidden, setForbidden] = useState(false);

  const isBusy = busyKey !== null;

  useEffect(() => {
    if (!canEdit) {
      setForbidden(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/sms-notifications");
        const data = (await res.json().catch(() => null)) as unknown;
        if (cancelled) return;

        if (res.status === 403) {
          setForbidden(true);
          setConfigs([]);
          setLastSaved([]);
          return;
        }

        if (!res.ok || !Array.isArray(data)) {
          setConfigs([]);
          setLastSaved([]);
          return;
        }

        setForbidden(false);
        setConfigs(data as SmsConfig[]);
        setLastSaved(data as SmsConfig[]);
      } catch {
        if (cancelled) return;
        setConfigs([]);
        setLastSaved([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canEdit]);

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
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
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

  if (forbidden) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Company settings are available to users with the appropriate
            permissions. Contact your administrator to update company
            information.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="space-y-4 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquare className="size-5 text-muted-foreground" />
          SMS Notifications
        </CardTitle>

        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-sm">
            Configure SMS messages for each order stage. Enable a trigger, edit
            the message, then save only that section.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLACEHOLDERS.map((placeholder) => (
              <span
                key={placeholder}
                className="rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-xs font-mono text-foreground shadow-xs"
              >
                {placeholder}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Customer SMS requires a phone number on the order. Use additional
            recipients for testing.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
              Triggers
            </p>
            <p className="mt-2 text-sm font-semibold">{configs.length} SMS stages</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Each order event can be configured independently.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
              Delivery
            </p>
            <p className="mt-2 text-sm font-semibold">Customer and rider messaging</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Choose whether each trigger should notify the customer or rider.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
              Saving
            </p>
            <p className="mt-2 text-sm font-semibold">One section at a time</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Update a template and save only that notification block.
            </p>
          </div>
        </div>
        {configs.map((config) => (
          <div
            key={config.trigger}
            className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs transition-colors md:p-5"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold leading-none">
                    {TRIGGER_LABELS[config.trigger] ?? config.trigger}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {TRIGGER_DESCRIPTIONS[config.trigger]}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    config.enabled
                      ? "border-emerald-300/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border/70 bg-background/70 text-muted-foreground"
                  }`}
                >
                  {config.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-background/70 p-3">
                {canEdit && (
                  <label
                    htmlFor={`enabled-${config.trigger}`}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Switch
                      id={`enabled-${config.trigger}`}
                      checked={config.enabled}
                      onCheckedChange={(checked) =>
                        updateConfig(config.trigger, { enabled: checked })
                      }
                      disabled={isBusy}
                    />
                    <span className="text-sm font-medium">Enable trigger</span>
                  </label>
                )}

                {config.trigger !== "rider_dispatched" && (
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
                )}

                {config.trigger === "rider_dispatched" && (
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
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`template-${config.trigger}`}
                      className="text-sm font-medium"
                    >
                      Message template
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {config.template.length}/1000
                    </span>
                  </div>
                  <Textarea
                    id={`template-${config.trigger}`}
                    value={config.template}
                    onChange={(e) =>
                      updateConfig(config.trigger, { template: e.target.value })
                    }
                    disabled={!canEdit || isBusy}
                    placeholder="Hi! Your order {orderNumber}..."
                    className="min-h-28 border-border/70 bg-background/90 font-mono text-sm"
                    maxLength={1000}
                  />
                </div>

                <div className="space-y-2 rounded-xl border border-border/70 bg-background/85 p-4 shadow-xs">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    Preview
                  </p>
                  <p className="text-sm leading-6">
                    {config.template.trim() || "No SMS message provided yet."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Placeholder values are replaced when the SMS is sent.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={`recipients-${config.trigger}`}
                  className="text-sm font-medium"
                >
                  Additional recipients
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
                  className="border-border/70 bg-background/90"
                />
                <p className="text-xs text-muted-foreground">
                  Enter comma-separated phone numbers for QA or internal
                  notifications.
                </p>
              </div>

              {canEdit && (
                <div className="flex items-center justify-end rounded-xl border border-border/70 bg-background/70 p-3">
                  <Button
                    size="sm"
                    onClick={() => saveConfig(config)}
                    disabled={isBusy || !hasChanges(config)}
                    className="min-w-24 shadow-[0_10px_24px_-18px_var(--primary)]"
                  >
                    {busyKey === config.trigger ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
