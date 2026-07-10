"use client";

import { useEffect, useMemo, useState } from "react";
import { Code2, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

type PrintFormat = {
  id: string;
  name: string;
  html: string;
  isEnabled: boolean;
  updatedAt: string;
};

const STARTER_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice {{order.invoiceNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
    .top { display: flex; justify-content: space-between; border-bottom: 1px solid #111; padding-bottom: 14px; }
    .logo { max-height: 56px; max-width: 180px; object-fit: contain; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
    .right { text-align: right; }
    @media print { @page { size: A4; margin: 0; } body { margin: 40px; } }
  </style>
</head>
<body>
  {{#if print.isCopy}}<div style="text-align:center;font-weight:700;">COPY</div>{{/if}}
  <div class="top">
    <div>
      <h1>Sales Invoice</h1>
      <p><strong>{{company.name}}</strong></p>
      <p>{{company.address}}</p>
    </div>
    {{#if company.logoUrl}}<img class="logo" src="{{{company.logoUrl}}}" alt="{{company.name}}" />{{/if}}
  </div>

  <p>Invoice: <strong>{{order.invoiceNumber}}</strong></p>
  <p>Date: {{order.invoiceDate}} | Printed: {{print.printedDate}}</p>
  <p>Customer: <strong>{{customer.name}}</strong> | {{customer.phones}}</p>
  <p>Ship to: {{customer.shippingAddress}}</p>

  <table>
    <thead>
      <tr><th>#</th><th>SKU</th><th>Description</th><th class="right">Qty</th><th class="right">Net</th></tr>
    </thead>
    <tbody>
      {{#each lineItems}}
      <tr>
        <td>{{index}}</td>
        <td>{{sku}}</td>
        <td>{{description}}</td>
        <td class="right">{{quantity}}</td>
        <td class="right">{{lineTotalFormatted}}</td>
      </tr>
      {{/each}}
      {{#each sampleFreeIssues}}
      <tr>
        <td>{{index}}</td>
        <td>-</td>
        <td>{{name}} ({{type}})</td>
        <td class="right">{{quantity}}</td>
        <td class="right">-</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <h2 class="right">Grand Total: {{totals.grandTotalFormatted}}</h2>

  <script>
    if ({{print.autoPrint}}) window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

const VARIABLES = [
  "company.name, company.address, company.logoUrl",
  "location.name, location.logoUrl, location.invoicePhone",
  "order.invoiceNumber, order.invoiceDate, order.paymentMethod",
  "customer.name, customer.phones, customer.shippingAddress",
  "totals.productTotalFormatted, totals.discountTotalFormatted, totals.shippingTotalFormatted, totals.grandTotalFormatted",
  "lineItems loop: {{#each lineItems}} {{sku}} {{description}} {{quantity}} {{lineTotalFormatted}} {{/each}}",
  "files loop: {{#each files}} {{fileName}} {{{url}}} {{/each}}",
];

export function PrintFormatsSettingsForm() {
  const [formats, setFormats] = useState<PrintFormat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [html, setHtml] = useState(STARTER_HTML);
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selected = useMemo(
    () => formats.find((format) => format.id === selectedId) ?? null,
    [formats, selectedId],
  );

  async function fetchFormats() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings/print-formats");
      const data = (await res.json()) as { formats?: PrintFormat[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load print formats");
      setFormats(data.formats ?? []);
      if (!selectedId && data.formats?.[0]) selectFormat(data.formats[0]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load print formats");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchFormats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectFormat(format: PrintFormat) {
    setSelectedId(format.id);
    setName(format.name);
    setHtml(format.html);
    setIsEnabled(format.isEnabled);
  }

  function startNew() {
    setSelectedId(null);
    setName("");
    setHtml(STARTER_HTML);
    setIsEnabled(true);
  }

  async function saveFormat() {
    if (!name.trim() || !html.trim()) return;
    setSaving(true);
    try {
      const endpoint = selectedId
        ? `/api/admin/settings/print-formats/${selectedId}`
        : "/api/admin/settings/print-formats";
      const res = await fetch(endpoint, {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), html, isEnabled }),
      });
      const data = (await res.json()) as PrintFormat & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save print format");
      notify.success("Print format saved.");
      await fetchFormats();
      setSelectedId(data.id);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save print format");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFormat() {
    if (!selectedId || !selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/settings/print-formats/${selectedId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete print format");
      notify.success(`${selected.name} deleted.`);
      startNew();
      await fetchFormats();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete print format");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-base">Formats</CardTitle>
          <CardDescription>Enabled formats can be selected as a location default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" variant="outline" className="w-full gap-2" onClick={startNew}>
            <Plus className="size-4" />
            New format
          </Button>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : formats.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No print formats yet.</p>
          ) : (
            <div className="space-y-2">
              {formats.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => selectFormat(format)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedId === format.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-secondary/20"
                  }`}
                >
                  <span className="block font-medium">{format.name}</span>
                  <span className="text-xs text-muted-foreground">{format.isEnabled ? "Enabled" : "Disabled"}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <Code2 className="size-4 text-muted-foreground" />
            {selectedId ? "Edit Print Format" : "New Print Format"}
          </CardTitle>
          <CardDescription>Write the full HTML document used for order invoice printing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="format-name">Name</label>
              <Input id="format-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              Enabled
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="format-html">HTML</label>
            <Textarea
              id="format-html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="min-h-120 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/10 p-3">
            <p className="text-sm font-medium">Available placeholders</p>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              {VARIABLES.map((item) => (
                <code key={item} className="rounded bg-background/80 px-2 py-1">{item}</code>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedId || deleting || saving}
              onClick={deleteFormat}
              className="gap-2"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
            <Button type="button" disabled={!name.trim() || !html.trim() || saving || deleting} onClick={saveFormat} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save format
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
