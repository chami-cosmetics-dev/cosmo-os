"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { NewItemRequestBrandHit, NewItemRequestView } from "@/lib/new-item-requests/types";
import { notify } from "@/lib/notify";

type NewItemRequestFormProps = {
  onCreated: (request: NewItemRequestView) => void;
  disabled?: boolean;
};

export function NewItemRequestForm({ onCreated, disabled = false }: NewItemRequestFormProps) {
  const [brandName, setBrandName] = useState("");
  const [description, setDescription] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [hits, setHits] = useState<NewItemRequestBrandHit[]>([]);
  const [picked, setPicked] = useState<NewItemRequestBrandHit | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null || disabled;
  const canSubmit = brandName.trim().length > 0 && description.trim().length > 0 && !isBusy;
  const isExisting = Boolean(picked && picked.name.trim().toLowerCase() === brandName.trim().toLowerCase());

  useEffect(() => {
    const q = brandName.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/new-item-requests/brands/suggest?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { hits?: NewItemRequestBrandHit[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not suggest brands");
        setHits(data.hits ?? []);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Could not suggest brands");
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [brandName]);

  async function submit() {
    if (!canSubmit) {
      notify.error("Brand and description are required.");
      return;
    }
    try {
      setBusyKey("create");
      const form = new FormData();
      form.set("brandName", brandName.trim());
      form.set("description", description.trim());
      if (storeUrl.trim()) form.set("storeUrl", storeUrl.trim());
      if (image) form.set("image", image);
      const response = await fetch("/api/new-item-requests", { method: "POST", body: form });
      const data = (await response.json()) as { request?: NewItemRequestView; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not submit request");
      if (!data.request) throw new Error("Could not submit request");
      setBrandName("");
      setDescription("");
      setStoreUrl("");
      setImage(null);
      setHits([]);
      setPicked(null);
      onCreated(data.request);
      notify.success("Request submitted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not submit request");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New item request</CardTitle>
        <CardDescription>Log a customer ask for an item we may not sell yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="new-item-brand">
            Brand
          </label>
          <Input
            id="new-item-brand"
            value={brandName}
            disabled={isBusy}
            autoComplete="off"
            onChange={(event) => {
              setBrandName(event.target.value);
              setPicked(null);
            }}
            placeholder="Type to search existing brands"
          />
          {hits.length > 0 && !isExisting ? (
            <ul className="border-border bg-background max-h-40 overflow-auto rounded-md border text-sm">
              {hits.map((hit) => (
                <li key={hit.name}>
                  <button
                    type="button"
                    className="hover:bg-secondary/40 w-full px-3 py-2 text-left"
                    disabled={isBusy}
                    onClick={() => {
                      setBrandName(hit.name);
                      setPicked(hit);
                      setHits([]);
                    }}
                  >
                    <span className="font-medium">{hit.name}</span>
                    {hit.priority ? (
                      <span className="text-muted-foreground ml-2">{hit.priority}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {isExisting
              ? `Existing brand${picked?.priority ? ` — ${picked.priority}` : ""}`
              : brandName.trim()
                ? "New brand"
                : "Pick a suggestion or type a new brand name"}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="new-item-description">
            Description
          </label>
          <Textarea
            id="new-item-description"
            value={description}
            disabled={isBusy}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={1000}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="new-item-link">
            Other-store link (optional)
          </label>
          <Input
            id="new-item-link"
            value={storeUrl}
            disabled={isBusy}
            onChange={(event) => setStoreUrl(event.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="new-item-image">
            Photo (optional)
          </label>
          <Input
            id="new-item-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={isBusy}
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
          {busyKey === "create" ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Submitting...
            </>
          ) : (
            "Submit request"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
