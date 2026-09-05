"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ImportPreviewResult } from "@/lib/market-prices/import";
import { notify } from "@/lib/notify";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function ImportPricesDialog({ open, onOpenChange, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setPreviewing(false);
    setCommitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreview(null);
    }
  };

  const handleUploadPreview = async () => {
    if (!file) {
      notify.error("Please choose a CSV file to upload");
      return;
    }

    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/purchasing/market-prices/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse import preview");
      }

      setPreview(data);
      if (data.summary.validRows === 0 && data.errors.length > 0) {
        notify.error("CSV has errors that must be resolved before import");
      } else {
        notify.success(`Parsed ${data.summary.validRows} valid price updates`);
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Error uploading CSV");
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!preview?.commitToken) return;

    setCommitting(true);
    try {
      const res = await fetch("/api/admin/purchasing/market-prices/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitToken: preview.commitToken }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to commit import");
      }

      notify.success(`Successfully applied ${data.applied} competitor prices`);
      onSuccess?.();
      onOpenChange(false);
      resetState();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Error committing prices");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Import Competitor Prices</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet with competitor product prices. The system validates SKUs and
            snapshots historical changes automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Step 1: File Selection & Download Template */}
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <span className="text-xs font-semibold">CSV File</span>
              </div>
              <a
                href="/api/admin/purchasing/market-prices/template"
                download="market_prices_import_template.csv"
                className="inline-flex items-center text-xs text-primary hover:underline"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Download CSV Template
              </a>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={previewing || committing}
                className="text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleUploadPreview}
                disabled={!file || previewing || committing}
                className="text-xs shrink-0"
              >
                {previewing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Validate & Preview
              </Button>
            </div>
          </div>

          {/* Step 2: Validation Preview */}
          {preview && (
            <div className="space-y-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border p-2.5 text-center">
                  <div className="text-lg font-bold">{preview.summary.totalRows}</div>
                  <div className="text-[10px] text-muted-foreground">Total Rows</div>
                </div>
                <div className="rounded-md border p-2.5 text-center bg-emerald-500/5 border-emerald-500/30">
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {preview.summary.validRows}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Valid to Apply</div>
                </div>
                <div className="rounded-md border p-2.5 text-center">
                  <div className="text-lg font-bold">
                    {preview.summary.createCount} new / {preview.summary.updateCount} upd
                  </div>
                  <div className="text-[10px] text-muted-foreground">Operations</div>
                </div>
                <div
                  className={`rounded-md border p-2.5 text-center ${
                    preview.summary.errorCount > 0
                      ? "bg-rose-500/5 border-rose-500/30"
                      : ""
                  }`}
                >
                  <div
                    className={`text-lg font-bold ${
                      preview.summary.errorCount > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {preview.summary.errorCount}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Errors</div>
                </div>
              </div>

              {/* Error Review Table */}
              {preview.errors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <AlertCircle className="h-4 w-4" />
                    Row Validation Errors (will be skipped):
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-md border text-xs">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7 text-[11px]">
                          <TableHead className="w-16">Line</TableHead>
                          <TableHead className="w-24">Field</TableHead>
                          <TableHead>Error Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.errors.map((err, idx) => (
                          <TableRow key={idx} className="h-7 text-[11px]">
                            <TableCell className="font-mono">{err.line}</TableCell>
                            <TableCell className="font-medium text-rose-600">
                              {err.field}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {err.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Sample Changes Preview */}
              {preview.sampleChanges.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold">Sample Price Changes:</span>
                  <div className="max-h-36 overflow-y-auto rounded-md border text-xs">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7 text-[11px]">
                          <TableHead className="w-24">SKU</TableHead>
                          <TableHead className="w-28">Competitor</TableHead>
                          <TableHead className="w-20">Action</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.sampleChanges.map((change, idx) => (
                          <TableRow key={idx} className="h-7 text-[11px]">
                            <TableCell className="font-mono font-medium">
                              {change.sku}
                            </TableCell>
                            <TableCell className="capitalize">
                              {change.competitor.replace(/-/g, " ")}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  change.action === "create"
                                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                    : "bg-secondary text-secondary-foreground"
                                }`}
                              >
                                {change.action}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {change.oldPrice != null ? (
                                <span>
                                  <span className="text-muted-foreground line-through mr-1">
                                    Rs. {change.oldPrice}
                                  </span>
                                  Rs. {change.newPrice}
                                </span>
                              ) : (
                                <span>Rs. {change.newPrice}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={committing}
            className="text-xs"
          >
            Cancel
          </Button>

          {preview && preview.summary.validRows > 0 && (
            <Button
              onClick={handleCommit}
              disabled={committing}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {committing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Commit & Apply ({preview.summary.validRows} prices)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
