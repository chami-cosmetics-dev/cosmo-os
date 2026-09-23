"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

type ConfigResponse = {
  enabled: boolean;
  recipients: string[];
  lastSentReportDate: string | null;
  lastSendStatus: string | null;
  lastSendAt: string | null;
};

type PreviewResponse = {
  reportDate: string;
  pendingCount: number;
  rows: Array<{
    prNo: string;
    adjustmentNo: string;
    grnDate: string;
    supplier: string;
    status: string;
    tally: string;
  }>;
  subject?: string | null;
  sendTest?: {
    ok: boolean;
    skipped?: boolean;
    status?: string;
    errorSummary?: string;
    recipientCount?: number;
  };
  error?: string;
};

interface GrnPendingEmailSettingsFormProps {
  canEdit: boolean;
}

export function GrnPendingEmailSettingsForm({ canEdit }: GrnPendingEmailSettingsFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [recipientsText, setRecipientsText] = useState("");
  const [reportDate, setReportDate] = useState(() => formatAppIsoDate(new Date()));
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [lastSend, setLastSend] = useState<string | null>(null);

  const isBusy = saving || previewBusy || testBusy;

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/company/grn-pending-email", { cache: "no-store" });
      const data = (await res.json()) as ConfigResponse & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load GRN pending email settings");
        return;
      }
      setEnabled(data.enabled);
      setRecipientsText((data.recipients ?? []).join("\n"));
      if (data.lastSentReportDate) {
        setLastSend(
          `${data.lastSentReportDate} - ${data.lastSendStatus ?? "-"}${
            data.lastSendAt ? ` - ${formatAppDateTime(data.lastSendAt)}` : ""
          }`,
        );
      } else {
        setLastSend(null);
      }
    } catch {
      notify.error("Failed to load GRN pending email settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    try {
      const recipients = recipientsText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/company/grn-pending-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, recipients }),
      });
      const data = (await res.json()) as ConfigResponse & { error?: string };
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to save settings");
        return;
      }
      setEnabled(data.enabled);
      setRecipientsText((data.recipients ?? []).join("\n"));
      notify.success("GRN pending email settings saved.");
      await loadConfig();
    } catch {
      notify.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview(sendTest: boolean) {
    if (sendTest && !canEdit) return;
    if (sendTest) setTestBusy(true);
    else setPreviewBusy(true);
    try {
      const res = await fetch("/api/admin/company/grn-pending-email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, sendTest }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) {
        notify.error(data.error ?? "Preview failed");
        return;
      }
      const sampleRows = (data.rows ?? [])
        .slice(0, 10)
        .map(
          (row) =>
            `${row.prNo} | ${row.adjustmentNo || "-"} | ${row.grnDate || "-"} | ${row.supplier || "-"} | ${row.status} | ${row.tally}`,
        )
        .join("\n");
      setPreviewSummary(
        `Report ${data.reportDate} - ${data.pendingCount} pending GRN(s)\n${
          data.subject ? `Subject: ${data.subject}\n` : ""
        }${sampleRows || "No pending GRNs found."}`,
      );
      if (sendTest) {
        if (data.sendTest?.ok) {
          notify.success(
            `Test email sent (${data.sendTest.recipientCount ?? 0} recipient${
              (data.sendTest.recipientCount ?? 0) !== 1 ? "s" : ""
            })`,
          );
          await loadConfig();
        } else if (data.sendTest?.skipped) {
          notify.error(`Test skipped: ${data.sendTest.status ?? "skipped"}`);
        } else {
          notify.error(data.sendTest?.errorSummary ?? "Test email failed");
        }
      } else {
        notify.success(`Preview ready (${data.pendingCount} pending GRN${data.pendingCount === 1 ? "" : "s"})`);
      }
    } catch {
      notify.error(sendTest ? "Test email failed" : "Preview failed");
    } finally {
      if (sendTest) setTestBusy(false);
      else setPreviewBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading GRN pending email...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GRN pending email</CardTitle>
        <CardDescription>
          Daily midnight email for purchase receipts that are not marked GRN Received yet. The
          email includes a short summary and an Excel attachment with the pending GRN table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit || isBusy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled (cron will send at 12:00 AM Asia/Colombo when recipients are set)
        </label>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="grn-pending-recipients">
            Recipient email addresses
          </label>
          <Textarea
            id="grn-pending-recipients"
            value={recipientsText}
            disabled={!canEdit || isBusy}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder={"purchasing@example.com\nops@example.com"}
            rows={4}
            className="font-mono text-sm"
          />
        </div>

        {lastSend && <p className="text-xs text-muted-foreground">Last send log: {lastSend}</p>}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canEdit || isBusy} onClick={() => void handleSave()}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="grn-pending-report-date">
            Report date
          </label>
          <Input
            id="grn-pending-report-date"
            type="date"
            value={reportDate}
            disabled={isBusy}
            onChange={(e) => setReportDate(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={isBusy} onClick={() => void handlePreview(false)}>
              {previewBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Previewing...
                </>
              ) : (
                "Preview"
              )}
            </Button>
            <Button
              disabled={!canEdit || isBusy}
              className="bg-teal-700 text-white hover:bg-teal-800"
              onClick={() => void handlePreview(true)}
            >
              {testBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send test email"
              )}
            </Button>
          </div>
          {previewSummary && (
            <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {previewSummary}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
