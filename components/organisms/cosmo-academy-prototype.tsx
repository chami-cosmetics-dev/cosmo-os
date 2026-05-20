"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  GraduationCap,
  ImageIcon,
  Loader2,
  Mic,
  PackageSearch,
  Pause,
  Play,
  Search,
  Square,
  Star,
  Trash2,
  UserRoundCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { getProductItemStatusMeta } from "@/lib/product-item-status";

type FamilySku = { sku: string; productTitle: string; variantTitle: string | null; itemStatusCategory: string; itemStatusLabel: string | null };

type ProductSearchItem = {
  id: string;
  shopifyProductId: string | null;
  productTitle: string;
  academyProductTitle?: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  vendor: { name: string } | null;
  category: { name: string } | null;
  priorityLabel?: string;
  brandPriority?: string;
  productPriority?: string;
  lifecycle?: string;
  hasExplanation: boolean;
  familySkus?: FamilySku[];
};

type Explanation = {
  id: string;
  productTitle: string;
  title: string | null;
  notes: string | null;
  createdAt: string;
  primaryProductItem: {
    sku: string | null;
    variantTitle: string | null;
    imageUrl: string | null;
  };
  media: Array<{
    id: string;
    mediaType: "voice" | "video" | "image" | "post";
    url: string;
    provider?: string | null;
    publicId?: string | null;
    fileName: string | null;
    mimeType: string | null;
  }>;
};

type SalesLesson = {
  id: string;
  productTitle: string;
  title: string | null;
  notes: string | null;
  createdAt: string;
  sku: string | null;
  imageUrl: string | null;
  vendorName: string | null;
  categoryName: string | null;
  priorityLabel: string;
  brandPriority: string;
  productPriority: string;
  lifecycle: string;
  progressStatus: "not_started" | "in_progress" | "completed";
  media: Array<{
    id: string;
    mediaType: "voice" | "video" | "image" | "post";
    url: string;
    mimeType: string | null;
  }>;
};

type SalesSummary = {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRecordingTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const WAVEFORM_LEFT  = [0.28, 0.48, 0.68, 0.88, 1.0,  0.82, 0.62, 0.42];
const WAVEFORM_RIGHT = [0.42, 0.62, 0.82, 1.0,  0.88, 0.68, 0.48, 0.28];

function fmtTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function RestrictedAudioPlayer({
  src,
  onPlay,
  onEnded,
}: {
  src: string;
  onPlay?: () => void;
  onEnded?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const maxReachedRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { void a.play(); }
  }

  function handleTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    const t = a.currentTime;
    if (t > maxReachedRef.current) {
      maxReachedRef.current = t;
      setMaxReached(t);
    }
    setCurrentTime(t);
  }

  function handleSeeking() {
    const a = audioRef.current;
    if (!a) return;
    if (a.currentTime > maxReachedRef.current) {
      a.currentTime = maxReachedRef.current;
    }
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = Math.min(ratio * duration, maxReachedRef.current);
  }

  const listenedPct = duration > 0 ? (maxReached / duration) * 100 : 0;
  const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onPlay={() => { setPlaying(true); onPlay?.(); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); onEnded?.(); }}
      />
      <button
        type="button"
        onClick={toggle}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90"
      >
        {playing
          ? <Pause className="size-3.5" />
          : <Play className="size-3.5 translate-x-px" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          className="relative h-2 cursor-pointer overflow-hidden rounded-full bg-muted"
          onClick={handleBarClick}
          title="You can only seek within the part you have already listened to"
        >
          {/* Listened range */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/35 transition-[width]"
            style={{ width: `${listenedPct}%` }}
          />
          {/* Current position */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
            style={{ width: `${currentPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{fmtTime(currentTime)}</span>
          <span className="text-[9px] opacity-50">cannot skip ahead</span>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export function CosmoAcademyPrototype() {
  const [activeWorkspace, setActiveWorkspace] = useState<"consultant" | "sales">("consultant");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ProductSearchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ProductSearchItem | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recentExplanations, setRecentExplanations] = useState<Explanation[]>([]);
  const [salesLessons, setSalesLessons] = useState<SalesLesson[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary>({
    total: 0,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
  });
  const [salesLoading, setSalesLoading] = useState(true);
  const [progressBusyId, setProgressBusyId] = useState<string | null>(null);
  const [deletingExplanationId, setDeletingExplanationId] = useState<string | null>(null);
  const [lessonEnded, setLessonEnded] = useState<Record<string, boolean>>({});
  const [lessonRating, setLessonRating] = useState<Record<string, number>>({});
  const [lessonReview, setLessonReview] = useState<Record<string, string>>({});
  const [lessonReviewSubmitting, setLessonReviewSubmitting] = useState<Record<string, boolean>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadRecentExplanations = useCallback(async () => {
    const res = await fetch("/api/admin/cosmo-academy/explanations");
    if (!res.ok) return;
    const data = (await res.json()) as { explanations: Explanation[] };
    setRecentExplanations(data.explanations ?? []);
  }, []);

  const loadSalesDashboard = useCallback(async () => {
    setSalesLoading(true);
    try {
      const res = await fetch("/api/admin/cosmo-academy/sales");
      if (!res.ok) return;
      const data = (await res.json()) as {
        lessons: SalesLesson[];
        summary: SalesSummary;
      };
      setSalesLessons(data.lessons ?? []);
      setSalesSummary(data.summary ?? {
        total: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
      });
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentExplanations();
    void loadSalesDashboard();
  }, [loadRecentExplanations, loadSalesDashboard]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setItems([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/cosmo-academy/product-search?search=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error("Failed to search products");
        }
        const data = (await res.json()) as { items: ProductSearchItem[] };
        setItems(data.items ?? []);
      } catch (error) {
        if (!controller.signal.aborted) {
          notify.error(error instanceof Error ? error.message : "Failed to search products");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [recordedUrl]);

  useEffect(() => {
    if (!recording) { setRecordingSeconds(0); return; }
    const interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);

  function selectItem(item: ProductSearchItem) {
    setSelectedItem(item);
    setTitle(`${item.academyProductTitle ?? item.productTitle} explanation`);
    setNotes("");
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error("Voice recording is not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      recorder.start();
      setRecording(true);
    } catch {
      notify.error("Microphone permission is required to record an explanation");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function attachUploadedVoice(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      notify.error("Please upload an audio file");
      return;
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(file);
    setRecordedUrl(URL.createObjectURL(file));
  }

  async function saveExplanation() {
    if (!selectedItem) {
      notify.error("Select a product item first");
      return;
    }
    if (!recordedBlob) {
      notify.error("Record a voice explanation first");
      return;
    }

    setSaving(true);
    const formData = new FormData();
    formData.set("productItemId", selectedItem.id);
    formData.set("title", title);
    formData.set("notes", notes);
    const isUploadedFile = recordedBlob instanceof File;
    formData.set("file", recordedBlob, isUploadedFile ? (recordedBlob as File).name : `voice-${selectedItem.id}.webm`);
    formData.set("isRecorded", isUploadedFile ? "false" : "true");

    try {
      const res = await fetch("/api/admin/cosmo-academy/explanations", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save explanation");
      }
      notify.success("Explanation saved");
      setSelectedItem((current) => current ? { ...current, hasExplanation: true } : current);
      setItems((current) =>
        current.map((item) =>
          (item.shopifyProductId || item.id) === (selectedItem.shopifyProductId || selectedItem.id)
            ? { ...item, hasExplanation: true }
            : item,
        ),
      );
      setRecordedBlob(null);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
      await loadRecentExplanations();
      await loadSalesDashboard();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save explanation");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExplanation(id: string) {
    setDeletingExplanationId(id);
    try {
      const res = await fetch(`/api/admin/cosmo-academy/explanations/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete explanation");
      notify.success("Explanation deleted");
      setRecentExplanations((current) => current.filter((e) => e.id !== id));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete explanation");
    } finally {
      setDeletingExplanationId(null);
    }
  }

  async function updateLessonProgress(lessonId: string, status: "in_progress" | "completed") {
    setProgressBusyId(lessonId);
    try {
      const res = await fetch("/api/admin/cosmo-academy/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explanationId: lessonId, status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update progress");
      }
      await loadSalesDashboard();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to update progress");
    } finally {
      setProgressBusyId(null);
    }
  }

  async function submitReview(lessonId: string) {
    const rating = lessonRating[lessonId];
    const review = lessonReview[lessonId]?.trim();
    if (!rating || !review) return;

    setLessonReviewSubmitting((s) => ({ ...s, [lessonId]: true }));
    try {
      const res = await fetch("/api/admin/cosmo-academy/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explanationId: lessonId, status: "completed", rating, reviewNotes: review }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save review");
      notify.success("Lesson completed!");
      setLessonEnded((e) => ({ ...e, [lessonId]: false }));
      await loadSalesDashboard();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save review");
    } finally {
      setLessonReviewSubmitting((s) => ({ ...s, [lessonId]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Product Education
        </p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <GraduationCap className="size-6 text-primary" />
              Cosmo Academy
            </h1>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
              Consultant workspace and sales-girl learning dashboard powered by real Cosmo OS product explanations.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2 text-sm">
            {recentExplanations.length} recent explanation(s)
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-border/70 bg-card p-2 shadow-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveWorkspace("consultant")}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              activeWorkspace === "consultant"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            }`}
          >
            Consultant Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspace("sales")}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              activeWorkspace === "sales"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            }`}
          >
            Sales Learning Dashboard
          </button>
        </div>
      </div>

      {activeWorkspace === "consultant" && (
      <>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <PackageSearch className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Search And Select Product</h2>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Search real items by product name, variant, or SKU. The saved mark is shared by items under the same Shopify product.
          </p>

          <div className="relative mt-5">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item, SKU, or product name..."
              className="bg-background/80 pl-9"
            />
            {searching && <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />}
          </div>

          <div className="mt-4 space-y-2">
            {items.map((item) => {
              const isMultiSku = (item.familySkus?.length ?? 0) > 1;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedItem?.id === item.id
                      ? "border-primary/70 bg-primary/8"
                      : "border-border/70 bg-background/60 hover:bg-accent/45"
                  }`}
                >
                  <div className={`flex gap-3 ${isMultiSku ? "items-center" : ""}`}>
                    {!isMultiSku && (
                      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="size-5 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.academyProductTitle ?? item.productTitle}</p>
                        {item.hasExplanation && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                            <CheckCircle2 className="size-3" />
                            Explanation created
                          </span>
                        )}
                      </div>
                      {isMultiSku ? (
                        <>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {item.familySkus!.length} SKUs · {item.vendor?.name ?? "No vendor"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.familySkus!.map((s) => {
                              const meta = getProductItemStatusMeta(s.itemStatusCategory);
                              return (
                                <span key={s.sku} className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-0.5 text-xs">
                                  <span className="font-medium">{s.sku}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-muted-foreground">{s.itemStatusLabel || meta.label}</span>
                                </span>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-muted-foreground mt-1 text-xs">
                            SKU: {item.sku ?? "-"} / Variant: {item.variantTitle ?? "-"}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {item.vendor?.name ?? "No vendor"} / {item.category?.name ?? "No category"}
                          </p>
                          <p className="mt-2 inline-flex rounded-full bg-secondary/60 px-2 py-1 text-xs text-secondary-foreground">
                            {item.priorityLabel ?? "Uncategorized"}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {search.trim().length >= 2 && !searching && items.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No items found.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Mic className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Create Voice Explanation</h2>
          </div>

          {selectedItem ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                <p className="text-sm font-medium">{selectedItem.academyProductTitle ?? selectedItem.productTitle}</p>
                {(!selectedItem.familySkus || selectedItem.familySkus.length <= 1) && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    SKU {selectedItem.sku ?? "-"} / {selectedItem.variantTitle ?? "Default variant"}
                  </p>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <span className="rounded-lg border border-border/70 bg-card px-2 py-1 text-xs">
                    {selectedItem.priorityLabel ?? "Uncategorized"}
                  </span>
                  <span className="rounded-lg border border-border/70 bg-card px-2 py-1 text-xs">
                    {selectedItem.brandPriority ?? "Standard"}
                  </span>
                  <span className="rounded-lg border border-border/70 bg-card px-2 py-1 text-xs">
                    {selectedItem.productPriority ?? "Not Set"}
                  </span>
                </div>
                {selectedItem.familySkus && selectedItem.familySkus.length > 1 && (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Product family — {selectedItem.familySkus.length} SKUs
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedItem.familySkus.map((s) => {
                        const meta = getProductItemStatusMeta(s.itemStatusCategory);
                        return (
                          <span
                            key={s.sku}
                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-0.5 text-xs"
                            title={s.variantTitle ?? s.productTitle}
                          >
                            <span className="font-medium">{s.sku}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{s.itemStatusLabel || meta.label}</span>
                          </span>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Voice will be saved to storage for all {selectedItem.familySkus.length} SKUs above.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="academy-title">Explanation title</label>
                <Input id="academy-title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="academy-notes">Consultant notes</label>
                <Textarea
                  id="academy-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Key benefits, skin type, usage order, warnings..."
                  className="min-h-24 bg-background/80"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70">
                <style>{`
                  @keyframes waveBar {
                    0%, 100% { transform: scaleY(0.22); opacity: 0.55; }
                    50%       { transform: scaleY(1);    opacity: 1; }
                  }
                `}</style>

                {/* Visualisation panel */}
                <div className={`flex flex-col items-center justify-center gap-4 px-4 py-7 transition-colors duration-300 ${
                  recording ? "bg-[#07071a]" : "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_14%,transparent))]"
                }`}>
                  {recording ? (
                    <>
                      {/* Waveform + mic */}
                      <div className="flex items-center gap-1.5">
                        {WAVEFORM_LEFT.map((scale, i) => (
                          <div
                            key={i}
                            className="w-1.5 rounded-full"
                            style={{
                              height: `${Math.round(scale * 52)}px`,
                              background: "linear-gradient(to top, #e879f9, #22d3ee)",
                              animation: `waveBar ${0.62 + (i % 4) * 0.13}s ease-in-out infinite`,
                              animationDelay: `${i * 75}ms`,
                              transformOrigin: "center",
                            }}
                          />
                        ))}

                        <div className="relative mx-3 flex size-[60px] shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_0_32px_10px_color-mix(in_srgb,var(--primary)_45%,transparent)]">
                          <Mic className="size-7 text-primary-foreground" />
                          <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
                        </div>

                        {WAVEFORM_RIGHT.map((scale, i) => (
                          <div
                            key={i}
                            className="w-1.5 rounded-full"
                            style={{
                              height: `${Math.round(scale * 52)}px`,
                              background: "linear-gradient(to top, #e879f9, #22d3ee)",
                              animation: `waveBar ${0.62 + (i % 4) * 0.13}s ease-in-out infinite`,
                              animationDelay: `${(i + 8) * 75}ms`,
                              transformOrigin: "center",
                            }}
                          />
                        ))}
                      </div>

                      {/* Timer */}
                      <span className="font-mono text-3xl font-bold tabular-nums tracking-[0.2em] text-white">
                        {formatRecordingTime(recordingSeconds)}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400/80">
                        Recording…
                      </span>
                    </>
                  ) : (
                    <>
                      <div className={`flex size-14 items-center justify-center rounded-full border-2 transition-colors ${
                        recordedBlob ? "border-primary/60 bg-primary/10" : "border-border/70 bg-background/60"
                      }`}>
                        <Mic className={`size-6 ${recordedBlob ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium">
                          {recordedBlob ? "Recording ready" : "Voice recorder"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {recordedBlob ? "Preview below or record again" : "Record or upload a consultant voice explanation"}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Controls bar */}
                <div className={`flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 ${
                  recording ? "bg-[#0b0b1e]" : "bg-background/60"
                }`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => attachUploadedVoice(event.target.files?.[0] ?? null)}
                  />
                  {recording ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={stopRecording}
                      className="mx-auto gap-2 px-8"
                    >
                      <Square className="size-4" />
                      Stop recording
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload voice
                      </Button>
                      <Button type="button" size="sm" onClick={startRecording}>
                        <Mic className="size-4" />
                        Record
                      </Button>
                    </>
                  )}
                </div>

                {/* Audio preview */}
                {recordedUrl && !recording && (
                  <div className="border-t border-border/70 bg-card px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Preview</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (recordedUrl) URL.revokeObjectURL(recordedUrl);
                          setRecordedBlob(null);
                          setRecordedUrl(null);
                        }}
                      >
                        <Trash2 className="size-3" />
                        Remove
                      </Button>
                    </div>
                    <audio src={recordedUrl} controls className="w-full" />
                  </div>
                )}
              </div>

              <Button className="w-full" disabled={saving || recording || !recordedBlob} onClick={saveExplanation}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Save explanation
              </Button>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              Select a product item to start recording.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <Play className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Recent Voice Explanations</h2>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recentExplanations.map((explanation) => {
            const voice = explanation.media.find((item) => item.mediaType === "voice");
            return (
              <div key={explanation.id} className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="flex gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card">
                    {explanation.primaryProductItem.imageUrl ? (
                      <img src={explanation.primaryProductItem.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{explanation.title ?? explanation.productTitle}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      SKU {explanation.primaryProductItem.sku ?? "-"} / {formatDate(explanation.createdAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={deletingExplanationId === explanation.id}
                    onClick={() => deleteExplanation(explanation.id)}
                  >
                    {deletingExplanationId === explanation.id
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Trash2 className="size-4" />}
                  </Button>
                </div>
                {voice && <audio src={`/api/admin/cosmo-academy/media/${voice.id}`} controls className="mt-3 w-full" />}
              </div>
            );
          })}
          {recentExplanations.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              No explanations saved yet.
            </div>
          )}
        </div>
      </section>
      </>
      )}

      {activeWorkspace === "sales" && (
        <section className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Available", salesSummary.total, "Published product lessons"],
              ["Completed", salesSummary.completed, "Lessons finished by me"],
              ["In progress", salesSummary.inProgress, "Started but not completed"],
              ["Not started", salesSummary.notStarted, "Waiting for me"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
                <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <UserRoundCheck className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">My Product Lessons</h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {salesLoading ? (
                <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                  Loading lessons...
                </div>
              ) : salesLessons.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                  No published explanations yet.
                </div>
              ) : (
                salesLessons.map((lesson) => {
                  const voice = lesson.media.find((item) => item.mediaType === "voice");
                  const isCompleted = lesson.progressStatus === "completed";
                  const isBusy = progressBusyId === lesson.id;
                  return (
                    <div key={lesson.id} className="rounded-2xl border border-border/70 bg-background/60 p-4">
                      <div className="flex gap-3">
                        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card">
                          {lesson.imageUrl ? (
                            <img src={lesson.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{lesson.title ?? lesson.productTitle}</p>
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                                <CheckCircle2 className="size-3" />
                                Completed
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs">
                            SKU {lesson.sku ?? "-"} / {lesson.vendorName ?? "No vendor"} / {lesson.categoryName ?? "No category"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs text-secondary-foreground">
                              {lesson.priorityLabel}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {lesson.progressStatus.replace("_", " ")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {lesson.notes && (
                        <p className="text-muted-foreground mt-3 line-clamp-3 text-sm">{lesson.notes}</p>
                      )}

                      {voice && (
                        <div className="mt-4">
                          {isCompleted ? (
                            <audio
                              src={`/api/admin/cosmo-academy/media/${voice.id}`}
                              controls
                              className="w-full"
                            />
                          ) : (
                            <RestrictedAudioPlayer
                              src={`/api/admin/cosmo-academy/media/${voice.id}`}
                              onPlay={() => {
                                if (lesson.progressStatus === "not_started") {
                                  void updateLessonProgress(lesson.id, "in_progress");
                                }
                              }}
                              onEnded={() =>
                                setLessonEnded((e) => ({ ...e, [lesson.id]: true }))
                              }
                            />
                          )}
                        </div>
                      )}

                      {/* Rating panel — appears only after audio finishes */}
                      {lessonEnded[lesson.id] && !isCompleted && (
                        <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                          <p className="text-sm font-semibold">Great job listening! Rate this explanation</p>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setLessonRating((r) => ({ ...r, [lesson.id]: star }))}
                                className="transition-transform hover:scale-110"
                              >
                                <Star
                                  className={`size-7 ${(lessonRating[lesson.id] ?? 0) >= star
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground/30"}`}
                                />
                              </button>
                            ))}
                          </div>
                          <Textarea
                            placeholder="Write what you learned about this product — key benefits, skin type, usage tips..."
                            value={lessonReview[lesson.id] ?? ""}
                            onChange={(e) =>
                              setLessonReview((r) => ({ ...r, [lesson.id]: e.target.value }))
                            }
                            className="min-h-24 bg-background/80 text-sm"
                          />
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={
                              !lessonRating[lesson.id] ||
                              !(lessonReview[lesson.id]?.trim()) ||
                              lessonReviewSubmitting[lesson.id]
                            }
                            onClick={() => submitReview(lesson.id)}
                          >
                            {lessonReviewSubmitting[lesson.id]
                              ? <Loader2 className="size-4 animate-spin" />
                              : <CheckCircle2 className="size-4" />}
                            Submit & mark complete
                          </Button>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        {!isCompleted && !lessonEnded[lesson.id] && (
                          <Button
                            type="button"
                            size="sm"
                            variant={lesson.progressStatus === "not_started" ? "default" : "outline"}
                            disabled={isBusy || isCompleted}
                            onClick={() => updateLessonProgress(lesson.id, "in_progress")}
                          >
                            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
                            {lesson.progressStatus === "not_started" ? "Start" : "Continue"}
                          </Button>
                        )}
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {formatDate(lesson.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
