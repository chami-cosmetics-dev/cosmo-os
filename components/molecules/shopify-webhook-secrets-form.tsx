"use client";

import { useEffect, useState } from "react";
import { Clock3, Loader2, Plus, ShieldCheck, Store, Trash2 } from "lucide-react";

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
  initialSecrets?: WebhookSecret[];
}

export function ShopifyWebhookSecretsForm({
  canEdit,
  initialSecrets,
}: ShopifyWebhookSecretsFormProps) {
  const [secrets, setSecrets] = useState<WebhookSecret[]>(initialSecrets ?? []);
  const [loading, setLoading] = useState(initialSecrets === undefined);
  const [newSecret, setNewSecret] = useState("");
  const [newName, setNewName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  function formatDate(value: string) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

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
    if (initialSecrets !== undefined) {
      setLoading(false);
      return;
    }

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
  }, [initialSecrets]);

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
    if (!window.confirm("Delete this webhook secret? Webhooks using it will no longer be accepted.")) {
      return;
    }

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

      setSecrets((prev) => prev.filter((secret) => secret.id !== id));
      notify.success("Webhook secret deleted.");
    } catch {
      notify.error("Failed to delete secret");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Shopify Webhook Secrets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading webhook security settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <ShieldCheck className="size-3.5" aria-hidden />
          Webhook Security
        </div>
        <div>
          <CardTitle>Shopify Webhook Secrets</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add the signing secrets from each Shopify store so incoming webhooks can be verified
            before they are accepted.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Saved Secrets
            </p>
            <p className="mt-2 text-2xl font-semibold">{secrets.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Active signatures accepted by your webhook endpoint.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Store Coverage
            </p>
            <p className="mt-2 flex items-center gap-2 text-base font-semibold">
              <Store className="size-4 text-emerald-700" aria-hidden />
              Add one secret per Shopify store
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This keeps multi-store webhook validation explicit and easy to audit.
            </p>
          </div>
        </div>

        {canEdit ? (
          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Add New Secret
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Copy the signing key from Shopify under Settings, Notifications, Webhooks.
              </p>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="secret" className="block text-sm font-medium">
                    Signing secret
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
                <div className="w-full space-y-1.5 sm:w-52">
                  <label htmlFor="name" className="block text-sm font-medium">
                    Label
                  </label>
                  <Input
                    id="name"
                    placeholder="Main store"
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
                      Add Secret
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum length is 32 characters. Use a unique label if you manage more than one
                Shopify storefront.
              </p>
            </form>
          </div>
        ) : null}

        <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Saved Secrets
              </h3>
              <p className="text-sm text-muted-foreground">
                Keep old secrets only while Shopify is still sending webhooks signed with them.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {secrets.length === 0 ? "No active secrets" : `${secrets.length} active secrets`}
            </p>
          </div>

          <ul className="space-y-3">
            {secrets.map((secret) => (
              <li
                key={secret.id}
                className="flex flex-col gap-3 rounded-xl border bg-background/70 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {secret.name || "Unnamed store secret"}
                    </p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Verified secret
                    </span>
                  </div>
                  <p className="font-mono text-sm">{secret.secretMasked}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden />
                    Added {formatDate(secret.createdAt)}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(secret.id)}
                    disabled={isBusy}
                    aria-label="Delete secret"
                  >
                    {busyKey === `delete-${secret.id}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          {secrets.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">No webhook secrets added yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a secret from Shopify admin before enabling product or order webhooks.
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
