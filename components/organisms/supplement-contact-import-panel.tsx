"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type RejectedRow = { rowNumber: number; reason: string };

type ImportSummary = {
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  contactsCreated: number;
  contactsMatched: number;
  purchaseLinesAdded: number;
  purchaseLinesUpdated: number;
  rejected: RejectedRow[];
};

type BusyKey = "template" | "codes" | "upload" | "draft";

async function errorMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function SupplementContactImportPanel({ vaultOs }: { vaultOs: boolean }) {
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null);
  const [itemCodeFile, setItemCodeFile] = useState<File | null>(null);
  const isBusy = busy !== null;

  async function downloadGet(path: string, fileName: string, key: BusyKey) {
    setBusy(key);
    try {
      const response = await fetch(path);
      if (!response.ok) {
        notify.error(await errorMessage(response, "Download failed"));
        return;
      }
      downloadBlob(await response.blob(), fileName);
      notify.success("File downloaded");
    } catch {
      notify.error("Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadPurchases() {
    if (!purchaseFile) {
      notify.error("Choose a Purchases workbook");
      return;
    }
    setBusy("upload");
    setSummary(null);
    try {
      const body = new FormData();
      body.set("file", purchaseFile);
      const response = await fetch("/api/admin/contacts/supplement-import", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as ImportSummary & { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Upload failed");
        return;
      }
      setSummary(data);
      notify.success(
        `Imported ${data.rowsAccepted} line${data.rowsAccepted === 1 ? "" : "s"}. ${data.rowsRejected} rejected.`,
      );
    } catch {
      notify.error("Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadDraft() {
    if (!itemCodeFile) {
      notify.error("Choose an item-code workbook");
      return;
    }
    setBusy("draft");
    try {
      const body = new FormData();
      body.set("file", itemCodeFile);
      const response = await fetch("/api/admin/contacts/supplement-import/draft", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        notify.error(await errorMessage(response, "Draft failed"));
        return;
      }
      downloadBlob(await response.blob(), "vault-supplement-contacts-draft.xlsx");
      notify.success("Draft downloaded");
    } catch {
      notify.error("Draft failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Supplement contact import</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {vaultOs
            ? "Download the template and item codes, then upload the edited Purchases file. Cosmetics lines stay out."
            : "Upload the Vault OS item-code file and download a Purchases draft. This does not change Cosmo contacts or orders."}
        </p>
      </div>

      {vaultOs ? (
        <div className="flex flex-wrap items-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() =>
              downloadGet(
                "/api/admin/contacts/supplement-import/template",
                "vault-supplement-contacts-template.xlsx",
                "template",
              )
            }
          >
            {busy === "template" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Downloading...
              </>
            ) : (
              "Download blank template"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() =>
              downloadGet(
                "/api/admin/contacts/supplement-import/item-codes",
                "vault-supplement-item-codes.xlsx",
                "codes",
              )
            }
          >
            {busy === "codes" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Downloading...
              </>
            ) : (
              "Download item codes"
            )}
          </Button>
          <label className="text-sm">
            <span className="text-muted-foreground mb-1 block">Purchases file</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isBusy}
              onChange={(event) => setPurchaseFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="button" disabled={isBusy} onClick={uploadPurchases}>
            {busy === "upload" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Uploading...
              </>
            ) : (
              "Upload purchases"
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground mb-1 block">Item-code file</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isBusy}
              onChange={(event) => setItemCodeFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="button" disabled={isBusy} onClick={downloadDraft}>
            {busy === "draft" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Building...
              </>
            ) : (
              "Download draft"
            )}
          </Button>
        </div>
      )}

      {summary ? (
        <div className="space-y-3">
          <p className="text-sm">
            Read {summary.rowsRead}. Accepted {summary.rowsAccepted}. Rejected {summary.rowsRejected}.
            Contacts created {summary.contactsCreated}. Matched {summary.contactsMatched}.
            Lines added {summary.purchaseLinesAdded}. Updated {summary.purchaseLinesUpdated}.
          </p>
          {summary.rejected.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rejected.map((row) => (
                    <tr key={`${row.rowNumber}-${row.reason}`} className="border-b last:border-0">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
