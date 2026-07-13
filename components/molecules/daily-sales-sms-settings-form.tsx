"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { formatAppIsoDate } from "@/lib/format-datetime";

type ConfigResponse = {
  enabled: boolean;
  recipients: string[];
  lastSentReportDate: string | null;
  lastSendStatus: string | null;
  lastSendAt: string | null;
};

type PreviewResponse = {
  reportDate: string;
  dayValue: number;
  dayCount: number;
  mtdValue: number;
  messageBody: string;
  sendTest?: { ok: boolean; skipped?: boolean; errorSummary?: string };
  error?: string;
};

interface DailySalesSmsSettingsFormProps {
  canEdit: boolean;
}

export function DailySalesSmsSettingsForm({ canEdit }: DailySalesSmsSettingsFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [recipientsText, setRecipientsText] = useState("");
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatAppIsoDate(d);
  });
  const [messageBody, setMessageBody] = useState("");
  const [lastSend, setLastSend] = useState<string | null>(null);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/company/daily-sales-sms", { cache: "no-store" });
      const data = (await res.json()) as ConfigResponse & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load daily sales SMS settings");
        return;
      }
      setEnabled(data.enabled);
      setRecipientsText((data.recipients ?? []).join("\n"));
      if (data.lastSentReportDate) {
        setLastSend(
          `${data.lastSentReportDate} · ${data.lastSendStatus ?? "—"}${data.lastSendAt ? ` · ${new Date(data.lastSendAt).toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}` : ""}`,
        );
      }
    } catch {
      notify.error("Failed to load daily sales SMS settings");
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
      const res = await fetch("/api/admin/company/daily-sales-sms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          recipients: recipientsText,
        }),
      });
      const data = (await res.json()) as ConfigResponse & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save");
        return;
      }
      setRecipientsText((data.recipients ?? []).join("\n"));
      notify.success("Daily sales SMS settings saved.");
    } catch {
      notify.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview(sendTest: boolean) {
    setPreviewBusy(true);
    try {
      const res = await fetch("/api/admin/company/daily-sales-sms/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, sendTest }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) {
        notify.error(data.error ?? "Preview failed");
        return;
      }
      setMessageBody(data.messageBody);
      if (sendTest) {
        if (data.sendTest?.skipped) {
          notify.error(data.sendTest.errorSummary ?? "No recipients — save numbers first");
        } else if (data.sendTest?.ok) {
          notify.success("Test SMS sent to configured recipients.");
          void loadConfig();
        } else {
          notify.error(data.sendTest?.errorSummary ?? "Test SMS failed");
        }
      } else {
        notify.success("Preview generated.");
      }
    } catch {
      notify.error("Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading daily sales SMS…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily sales SMS</CardTitle>
        <CardDescription>
          Nightly leadership SMS (day value/count + MTD by location). Add admin phones one per line
          (e.g. <span className="font-mono">0766713205</span>). Empty list skips live sends; preview
          still works. Failures appear on OGF logs with Resend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit || saving}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled (cron will send when recipients are set)
        </label>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="daily-sales-recipients">
            Recipient phone numbers
          </label>
          <Textarea
            id="daily-sales-recipients"
            value={recipientsText}
            disabled={!canEdit || saving}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder={"0766713205\n0771234567"}
            rows={4}
            className="font-mono text-sm"
          />
        </div>

        {lastSend && (
          <p className="text-xs text-muted-foreground">Last send log: {lastSend}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canEdit || saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="daily-sales-date">
                Report date
              </label>
              <Input
                id="daily-sales-date"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button
              variant="outline"
              disabled={previewBusy}
              onClick={() => void handlePreview(false)}
            >
              {previewBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Preview
            </Button>
            <Button
              variant="secondary"
              disabled={!canEdit || previewBusy}
              onClick={() => void handlePreview(true)}
            >
              Send test SMS
            </Button>
          </div>
          {messageBody ? (
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {messageBody}
            </pre>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
