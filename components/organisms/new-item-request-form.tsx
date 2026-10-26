"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NewItemRequestVoteDialog } from "@/components/organisms/new-item-request-vote-dialog";
import {
  formatVoteCount,
  type NewItemRequestBrandHit,
  type NewItemRequestView,
} from "@/lib/new-item-requests/types";
import { notify } from "@/lib/notify";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type NewItemRequestFormProps = {
  onCreated: (request: NewItemRequestView) => void;
  onVoted?: (request: NewItemRequestView) => void;
  canVote?: boolean;
  disabled?: boolean;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isImageFile(file: File) {
  if (IMAGE_TYPES.has(file.type)) return true;
  return /\.(jpe?g|png|gif|webp)$/i.test(file.name);
}

function fileFromClipboard(event: ClipboardEvent) {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return event.clipboardData?.files?.[0] && isImageFile(event.clipboardData.files[0])
    ? event.clipboardData.files[0]
    : null;
}

export function NewItemRequestForm({
  onCreated,
  onVoted,
  canVote = true,
  disabled = false,
}: NewItemRequestFormProps) {
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [description, setDescription] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [productHits, setProductHits] = useState<NewItemRequestView[]>([]);
  const [brandHits, setBrandHits] = useState<NewItemRequestBrandHit[]>([]);
  const [pickedBrand, setPickedBrand] = useState<NewItemRequestBrandHit | null>(null);
  const [voting, setVoting] = useState<NewItemRequestView | null>(null);
  const [composing, setComposing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isBusy = busyKey !== null || disabled;
  const canSubmit =
    composing &&
    productName.trim().length > 0 &&
    brandName.trim().length > 0 &&
    storeUrl.trim().length > 0 &&
    !isBusy;
  const isExistingBrand = Boolean(
    pickedBrand && pickedBrand.name.trim().toLowerCase() === brandName.trim().toLowerCase(),
  );
  const exactProduct = productHits.some(
    (hit) => normalizeName(hit.productName) === normalizeName(productName),
  );
  const showCreateNew = productName.trim().length >= 2 && !exactProduct && !composing;

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    const q = productName.trim();
    if (q.length < 2) {
      setProductHits([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/new-item-requests/products/suggest?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { hits?: NewItemRequestView[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not search products");
        setProductHits(data.hits ?? []);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Could not search products");
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [productName]);

  useEffect(() => {
    if (!composing) {
      setBrandHits([]);
      return;
    }
    const q = brandName.trim();
    if (q.length < 2) {
      setBrandHits([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/new-item-requests/brands/suggest?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { hits?: NewItemRequestBrandHit[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not suggest brands");
        setBrandHits(data.hits ?? []);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Could not suggest brands");
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [brandName, composing]);

  useEffect(() => {
    if (!composing) return;
    function onPaste(event: ClipboardEvent) {
      const file = fileFromClipboard(event);
      if (!file || !isImageFile(file)) return;
      const target = event.target as HTMLElement | null;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      const text = event.clipboardData?.getData("text")?.trim();
      if (inField && text) return;
      event.preventDefault();
      setImage(file);
      notify.success("Photo pasted.");
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [composing]);

  function takeImage(file: File | undefined | null) {
    if (!file) return;
    if (!isImageFile(file)) {
      notify.error("Use a JPEG, PNG, GIF, or WebP photo.");
      return;
    }
    setImage(file);
  }

  function resetForm() {
    setProductName("");
    setBrandName("");
    setDescription("");
    setStoreUrl("");
    setCustomerName("");
    setCustomerPhone("");
    setImage(null);
    setProductHits([]);
    setBrandHits([]);
    setPickedBrand(null);
    setComposing(false);
  }

  function applyVoted(request: NewItemRequestView) {
    setProductHits((current) => current.map((row) => (row.id === request.id ? request : row)));
    onVoted?.(request);
  }

  async function unvote(id: string) {
    try {
      setBusyKey(`unvote-${id}`);
      const response = await fetch(`/api/new-item-requests/${id}/vote`, { method: "DELETE" });
      const data = (await response.json()) as { request?: NewItemRequestView; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not remove vote");
      if (!data.request) throw new Error("Could not remove vote");
      applyVoted(data.request);
      notify.success("Vote removed.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not remove vote");
    } finally {
      setBusyKey(null);
    }
  }

  async function submit() {
    if (!canSubmit) {
      notify.error("Product name, brand, and other-store link are required.");
      return;
    }
    try {
      setBusyKey("create");
      const form = new FormData();
      form.set("productName", productName.trim());
      form.set("brandName", brandName.trim());
      form.set("description", description.trim());
      form.set("storeUrl", storeUrl.trim());
      if (customerName.trim()) form.set("customerName", customerName.trim());
      if (customerPhone.trim()) form.set("customerPhone", customerPhone.trim());
      if (image) form.set("image", image);
      const response = await fetch("/api/new-item-requests", { method: "POST", body: form });
      const data = (await response.json()) as { request?: NewItemRequestView; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not submit request");
      if (!data.request) throw new Error("Could not submit request");
      resetForm();
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
        <CardDescription>
          Search the product name first. Vote if someone already asked. Create new only when it is not on the list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="new-item-product">
            Product name
          </label>
          <Input
            id="new-item-product"
            value={productName}
            disabled={isBusy}
            autoComplete="off"
            onChange={(event) => setProductName(event.target.value)}
            placeholder="Type the product the customer asked for"
          />
        </div>
        {productHits.length > 0 ? (
          <ul className="space-y-2">
            {productHits.map((hit) => (
              <li key={hit.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{hit.productName}</p>
                  <p className="text-muted-foreground text-xs">
                    {hit.brandName}
                    {` · ${formatVoteCount(hit)}`}
                  </p>
                  {hit.storeUrl ? (
                    <a
                      className="text-primary mt-1 block truncate text-xs underline"
                      href={hit.storeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {hit.storeUrl}
                    </a>
                  ) : null}
                </div>
                {canVote && hit.hasVoted ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void unvote(hit.id)}
                  >
                    {busyKey === `unvote-${hit.id}` ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden />
                        Removing...
                      </>
                    ) : (
                      "Remove vote"
                    )}
                  </Button>
                ) : canVote ? (
                  <Button type="button" size="sm" disabled={isBusy} onClick={() => setVoting(hit)}>
                    Vote
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : productName.trim().length >= 2 ? (
          <p className="text-muted-foreground text-xs">No open request matches this name.</p>
        ) : (
          <p className="text-muted-foreground text-xs">Type at least 2 characters to search existing asks.</p>
        )}
        {exactProduct ? (
          <p className="text-muted-foreground text-sm">This product is already requested. Vote instead of creating another.</p>
        ) : null}
        {showCreateNew ? (
          <Button type="button" variant="outline" disabled={isBusy} onClick={() => setComposing(true)}>
            Create new
          </Button>
        ) : null}
        {composing && !exactProduct ? (
          <>
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
                  setPickedBrand(null);
                }}
                placeholder="Type to search existing brands"
              />
              {brandHits.length > 0 && !isExistingBrand ? (
                <ul className="border-border bg-background max-h-40 overflow-auto rounded-md border text-sm">
                  {brandHits.map((hit) => (
                    <li key={hit.name}>
                      <button
                        type="button"
                        className="hover:bg-secondary/40 w-full px-3 py-2 text-left"
                        disabled={isBusy}
                        onClick={() => {
                          setBrandName(hit.name);
                          setPickedBrand(hit);
                          setBrandHits([]);
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
                {isExistingBrand
                  ? `Catalogue brand${pickedBrand?.priority ? ` — ${pickedBrand.priority}` : ""}`
                  : brandName.trim()
                    ? "New brand"
                    : "Pick a suggestion or type a new brand name"}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="new-item-description">
                Extra notes (optional)
              </label>
              <Textarea
                id="new-item-description"
                value={description}
                disabled={isBusy}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="new-item-link">
                Other-store link
              </label>
              <Input
                id="new-item-link"
                value={storeUrl}
                disabled={isBusy}
                onChange={(event) => setStoreUrl(event.target.value)}
                placeholder="https://"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="new-item-customer-name">
                  Customer name (optional)
                </label>
                <Input
                  id="new-item-customer-name"
                  value={customerName}
                  disabled={isBusy}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="new-item-customer-phone">
                  Customer phone (optional)
                </label>
                <Input
                  id="new-item-customer-phone"
                  value={customerPhone}
                  disabled={isBusy}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="0771234567"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Photo (optional)</p>
              <div
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 ${
                  dragOver ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  takeImage(event.dataTransfer.files?.[0] ?? null);
                }}
                role="button"
                tabIndex={0}
                aria-label="Add a photo. Drag and drop, click, or paste."
              >
                <ImagePlus className="text-muted-foreground size-8" aria-hidden />
                <p className="text-sm font-medium">
                  {dragOver ? "Drop photo here" : "Drag and drop, click, or paste"}
                </p>
                <p className="text-muted-foreground text-xs">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
                {image ? <p className="text-xs font-medium">{image.name || "Pasted photo"}</p> : null}
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="max-h-40 rounded-md" />
                ) : null}
              </div>
              <input
                ref={fileRef}
                id="new-item-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={isBusy}
                onChange={(event) => {
                  takeImage(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
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
          </>
        ) : null}
      </CardContent>
      <NewItemRequestVoteDialog
        request={voting}
        open={voting !== null}
        onOpenChange={(open) => {
          if (!open) setVoting(null);
        }}
        onVoted={applyVoted}
      />
    </Card>
  );
}
