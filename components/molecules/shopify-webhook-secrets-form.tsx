"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type WebhookSecret = {
  id: string;
  name: string | null;
  secretMasked: string;
  createdAt: string;
};

interface ShopifyWebhookSecretsFormProps {
  canEdit: boolean;
}

export function ShopifyWebhookSecretsForm({ canEdit }: ShopifyWebhookSecretsFormProps) {
  const [secrets, setSecrets] = useState<WebhookSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSecret, setNewSecret] = useState("");
  const [newName, setNewName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchSecrets() {
    const res = await fetch("/api/admin/company/shopify-webhook-secrets");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load webhook secrets");
      return;
    }
    const data = (await res.json()) as WebhookSecret[];
    setSecrets(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await fetchSecrets();
      } catch {
        notify.error("Failed to load webhook secrets");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newSecret.trim()) return;
    if (newSecret.trim().length < 32) {
      notify.error("Secret must be at least 32 characters");
      return;
    }

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/company/shopify-webhook-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: newSecret.trim(),
          name: newName.trim() || undefined,
        }),
      });

      const data = (await res.json()) as WebhookSecret & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add secret");
        return;
      }

      setSecrets((prev) => [data, ...prev]);
      setNewSecret("");
      setNewName("");
      notify.success("Webhook secret added.");
    } catch {
      notify.error("Failed to add secret");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Delete this webhook secret? Webhooks using it will no longer be accepted."))
      return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/company/shopify-webhook-secrets/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete secret");
        return;
      }

      setSecrets((prev) => prev.filter((s) => s.id !== id));
      notify.success("Webhook secret deleted.");
    } catch {
      notify.error("Failed to delete secret");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shopify Webhook Secrets</CardTitle>
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
        <CardTitle>Shopify Webhook Secrets</CardTitle>
        <p className="text-muted-foreground text-sm">
          Add the webhook signing secrets from your Shopify store(s). Incoming webhooks are
          accepted if their signature matches any of these secrets. Add one per Shopify shop if you
          have multiple stores.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAdd} className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <label htmlFor="secret" className="text-muted-foreground block text-xs">
                  Secret (from Shopify: Settings → Notifications → Webhooks → &quot;Your webhooks
                  will be signed with&quot;)
                </label>
                <Input
                  id="secret"
                  type="password"
                  placeholder="Paste the 64-character hex secret"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  disabled={isBusy}
                  minLength={32}
                  maxLength={128}
                  className="font-mono text-sm"
                />
              </div>
              <div className="w-full space-y-1 sm:w-48">
                <label htmlFor="name" className="text-muted-foreground block text-xs">
                  Label (optional)
                </label>
                <Input
                  id="name"
                  placeholder="e.g. Main store"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isBusy}
                  maxLength={100}
                />
              </div>
              <Button type="submit" disabled={isBusy || newSecret.trim().length < 32}>
                {busyKey === "add" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="size-4" aria-hidden />
                    Add
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        <ul className="space-y-2">
          {secrets.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-mono text-sm">{s.secretMasked}</p>
                {s.name && (
                  <p className="text-muted-foreground mt-0.5 text-xs">{s.name}</p>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(s.id)}
                  disabled={isBusy}
                  aria-label="Delete secret"
                >
                  {busyKey === `delete-${s.id}` ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {secrets.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No webhook secrets yet. Add one from your Shopify admin to accept product webhooks.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
