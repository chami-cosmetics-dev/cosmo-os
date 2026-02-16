"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

const EMPLOYEE_SIZE_OPTIONS = [
  { value: "", label: "Select size" },
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "500+", label: "500+" },
];

type Company = {
  id: string;
  name: string;
  employeeSize: string | null;
  address: string | null;
};

interface CompanySettingsFormProps {
  canEdit: boolean;
  initialCompany?: Company | null;
}

export function CompanySettingsForm({ canEdit, initialCompany }: CompanySettingsFormProps) {
  const [company, setCompany] = useState<Company | null>(initialCompany ?? null);
  const [loading, setLoading] = useState(initialCompany === undefined);
  const [name, setName] = useState(initialCompany?.name ?? "");
  const [employeeSize, setEmployeeSize] = useState(initialCompany?.employeeSize ?? "");
  const [address, setAddress] = useState(initialCompany?.address ?? "");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  useEffect(() => {
    if (initialCompany !== undefined) {
      setLoading(false);
      return;
    }
    async function fetchCompany() {
      try {
        const res = await fetch("/api/admin/company");
        if (res.status === 404) {
          setCompany(null);
          return;
        }
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          notify.error(data.error ?? "Failed to load company");
          return;
        }
        const data = (await res.json()) as Company;
        setCompany(data);
        setName(data.name);
        setEmployeeSize(data.employeeSize ?? "");
        setAddress(data.address ?? "");
      } catch {
        notify.error("Failed to load company");
      } finally {
        setLoading(false);
      }
    }
    fetchCompany();
  }, [initialCompany]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !company) return;

    setBusyKey("save");
    try {
      const res = await fetch("/api/admin/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          employeeSize: employeeSize || undefined,
          address: address.trim() || undefined,
        }),
      });

      const data = (await res.json()) as Company & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update company");
        return;
      }

      setCompany(data);
      notify.success("Company information updated.");
    } catch {
      notify.error("Failed to update company");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
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

  if (!company) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No company is associated with your account. Company information is
            set during Super Admin onboarding.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Information</CardTitle>
        <p className="text-muted-foreground text-sm">
          Update your organization&apos;s details.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="company-name" className="text-sm font-medium">
              Company name
            </label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!canEdit || isBusy}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="employee-size" className="text-sm font-medium">
              Employee size
            </label>
            <select
              id="employee-size"
              value={employeeSize}
              onChange={(e) => setEmployeeSize(e.target.value)}
              disabled={!canEdit || isBusy}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:text-sm"
            >
              {EMPLOYEE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value || "empty"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium">
              Address
            </label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canEdit || isBusy}
              rows={3}
              maxLength={500}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:text-sm"
            />
          </div>
          {canEdit && (
            <Button type="submit" disabled={isBusy}>
              {busyKey === "save" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
