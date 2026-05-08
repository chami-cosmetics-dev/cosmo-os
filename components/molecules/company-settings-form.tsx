"use client";

import { useState, useEffect } from "react";
import { Building2, ImageIcon, Loader2, MapPin, Save, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CloudinaryLogo } from "@/components/molecules/cloudinary-logo";
import { LogoUpload } from "@/components/molecules/logo-upload";
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
  logoUrl: string | null;
  faviconUrl: string | null;
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
  const [logoUrl, setLogoUrl] = useState<string | null>(initialCompany?.logoUrl ?? null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(initialCompany?.faviconUrl ?? null);
  const [employeeSize, setEmployeeSize] = useState(initialCompany?.employeeSize ?? "");
  const [address, setAddress] = useState(initialCompany?.address ?? "");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  const hasChanges =
    company &&
    (name.trim() !== (company.name ?? "").trim() ||
      employeeSize !== (company.employeeSize ?? "") ||
      address.trim() !== (company.address ?? "").trim() ||
      logoUrl !== (company.logoUrl ?? null) ||
      faviconUrl !== (company.faviconUrl ?? null));

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
        setLogoUrl(data.logoUrl ?? null);
        setFaviconUrl(data.faviconUrl ?? null);
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

  async function handleLogoChange(url: string | null) {
    setLogoUrl(url);
    if (!canEdit || !company) return;

    setBusyKey("save-logo");
    try {
      const res = await fetch("/api/admin/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          logoUrl: url,
          faviconUrl,
          employeeSize: employeeSize || undefined,
          address: address.trim() || undefined,
        }),
      });

      const data = (await res.json()) as Company & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to save logo");
        setLogoUrl(company.logoUrl ?? null);
        return;
      }

      setCompany(data);
    } catch {
      notify.error("Failed to save logo");
      setLogoUrl(company.logoUrl ?? null);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleFaviconChange(url: string | null) {
    setFaviconUrl(url);
    if (!canEdit || !company) return;

    setBusyKey("save-favicon");
    try {
      const res = await fetch("/api/admin/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          logoUrl,
          faviconUrl: url,
          employeeSize: employeeSize || undefined,
          address: address.trim() || undefined,
        }),
      });

      const data = (await res.json()) as Company & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to save favicon");
        setFaviconUrl(company.faviconUrl ?? null);
        return;
      }

      setCompany(data);
      // Update favicon in browser tab
      if (url) {
        const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
        if (link) link.href = url;
        else {
          const newLink = document.createElement("link");
          newLink.rel = "icon";
          newLink.href = url;
          document.head.appendChild(newLink);
        }
      }
    } catch {
      notify.error("Failed to save favicon");
      setFaviconUrl(company.faviconUrl ?? null);
    } finally {
      setBusyKey(null);
    }
  }

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
          logoUrl,
          faviconUrl,
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
      setLogoUrl(data.logoUrl ?? null);
      setFaviconUrl(data.faviconUrl ?? null);
      notify.success("Company information updated.");
    } catch {
      notify.error("Failed to update company");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
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
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
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
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" aria-hidden />
          Company Information
        </CardTitle>
        <CardDescription>
          Update your organization&apos;s details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {canEdit && (
            <section className="space-y-3 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
              <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                  Brand Assets
                </h3>
                <p className="text-muted-foreground text-xs">
                  Upload and manage your company logo and browser favicon.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <LogoUpload
                    value={logoUrl}
                    onChange={handleLogoChange}
                    uploadType="company"
                    disabled={isBusy}
                    label="Company logo"
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <LogoUpload
                    value={faviconUrl}
                    onChange={handleFaviconChange}
                    uploadType="favicon"
                    disabled={isBusy}
                    label="Favicon (browser tab icon)"
                  />
                </div>
              </div>
            </section>
          )}
          {!canEdit && (logoUrl || faviconUrl) && (
            <section className="space-y-3 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 shadow-xs">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                Brand Assets
              </h3>
              <div className="flex flex-wrap gap-6">
              {logoUrl && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company logo</label>
                  <div className="flex size-20 overflow-hidden rounded-xl border border-border/70 bg-background/70">
                    <CloudinaryLogo src={logoUrl} alt="Company logo" className="size-full object-contain" />
                  </div>
                </div>
              )}
              {faviconUrl && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Favicon</label>
                  <div className="flex size-12 overflow-hidden rounded-lg border border-border/70 bg-background/70">
                    <CloudinaryLogo src={faviconUrl} alt="Favicon" width={32} height={32} className="size-full object-contain" />
                  </div>
                </div>
              )}
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-muted-foreground" aria-hidden />
                Core Details
              </h3>
              <p className="text-muted-foreground text-xs">
                Keep core organization information up to date for internal users.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
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
                  className="rounded-lg border-border/80 bg-background/80"
                />
                <p className="text-muted-foreground text-xs">{name.length}/200 characters</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="employee-size" className="flex items-center gap-1.5 text-sm font-medium">
                  <Users className="size-3.5 text-muted-foreground" aria-hidden />
                  Employee size
                </label>
                <Select
                  value={employeeSize || "__none"}
                  onValueChange={(value) => setEmployeeSize(value === "__none" ? "" : value)}
                  disabled={!canEdit || isBusy}
                >
                  <SelectTrigger id="employee-size" className="w-full rounded-lg border-border/80 bg-background/80">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select size</SelectItem>
                    {EMPLOYEE_SIZE_OPTIONS.filter((opt) => opt.value).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="address" className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                  Address
                </label>
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={!canEdit || isBusy}
                  rows={3}
                  maxLength={500}
                  className="rounded-lg border-border/80 bg-background/80"
                />
                <p className="text-muted-foreground text-xs">{address.length}/500 characters</p>
              </div>
            </div>
          </section>

          {canEdit && (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                {hasChanges ? "You have unsaved changes." : "All changes are saved."}
              </p>
              <Button type="submit" disabled={isBusy || !hasChanges} className="sm:min-w-36">
                {busyKey === "save" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
