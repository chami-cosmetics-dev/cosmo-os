"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { LIMITS } from "@/lib/validation";

type SmsPortalConfigResponse = {
  id: string | null;
  username: string;
  authUrl: string;
  smsUrl: string;
  smsMask: string;
  campaignName: string;
  hasPassword?: boolean;
};

interface SmsPortalSettingsFormProps {
  canEdit: boolean;
}

export function SmsPortalSettingsForm({ canEdit }: SmsPortalSettingsFormProps) {
  const [loading, setLoading] = useState(true);
  const [noCompany, setNoCompany] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [smsUrl, setSmsUrl] = useState("");
  const [smsMask, setSmsMask] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState({
    username: "",
    authUrl: "",
    smsUrl: "",
    smsMask: "",
    campaignName: "",
  });

  const isBusy = busyKey !== null;
  const hasChanges =
    username.trim() !== lastSaved.username.trim() ||
    authUrl.trim() !== lastSaved.authUrl.trim() ||
    smsUrl.trim() !== lastSaved.smsUrl.trim() ||
    smsMask.trim() !== lastSaved.smsMask.trim() ||
    campaignName.trim() !== lastSaved.campaignName.trim() ||
    password.trim() !== "";

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/admin/company/sms-portal");
        if (res.status === 404) {
          setNoCompany(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          notify.error(data.error ?? "Failed to load SMS portal config");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as SmsPortalConfigResponse;
        setUsername(data.username);
        setAuthUrl(data.authUrl);
        setSmsUrl(data.smsUrl);
        setSmsMask(data.smsMask);
        setCampaignName(data.campaignName);
        setLastSaved({
          username: data.username,
          authUrl: data.authUrl,
          smsUrl: data.smsUrl,
          smsMask: data.smsMask,
          campaignName: data.campaignName,
        });
      } catch {
        notify.error("Failed to load SMS portal config");
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || isBusy) return;

    setBusyKey("save");
    try {
      const body: Record<string, string> = {
        username: username.trim(),
        authUrl: authUrl.trim(),
        smsUrl: smsUrl.trim(),
        smsMask: smsMask.trim(),
        campaignName: campaignName.trim(),
      };
      if (password.trim() !== "") {
        body.password = password.trim();
      }

      const res = await fetch("/api/admin/company/sms-portal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update SMS portal config");
        return;
      }

      notify.success("SMS portal config updated.");
      setPassword("");
      setLastSaved({
        username: username.trim(),
        authUrl: authUrl.trim(),
        smsUrl: smsUrl.trim(),
        smsMask: smsMask.trim(),
        campaignName: campaignName.trim(),
      });
    } catch {
      notify.error("Failed to update SMS portal config");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleTestSms(e?: React.FormEvent) {
    e?.preventDefault();
    if (isBusy) return;

    const phone = testPhoneNumber.trim();
    if (!phone) {
      notify.error("Enter a phone number to send test SMS");
      return;
    }

    setBusyKey("test");
    try {
      const res = await fetch("/api/admin/company/sms-portal/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to send test SMS");
        return;
      }

      notify.success("Test SMS sent successfully.");
    } catch {
      notify.error("Failed to send test SMS");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SMS Portal</CardTitle>
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

  if (noCompany) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SMS Portal</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No company is associated with your account. SMS portal config is
            configured per company.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS Portal</CardTitle>
        <p className="text-muted-foreground text-sm">
          Configure Hutch SMS API (bsms.hutch.lk) credentials. Sent messages are
          counted for tracking.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="sms-username" className="text-sm font-medium">
              Username
            </label>
            <Input
              id="sms-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="Sales@cosmetics.lk"
              maxLength={LIMITS.smsPortalUsername.max}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="sms-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="sms-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="Leave blank to keep current"
              maxLength={LIMITS.smsPortalPassword.max}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="sms-auth-url" className="text-sm font-medium">
              Auth URL
            </label>
            <Input
              id="sms-auth-url"
              type="url"
              value={authUrl}
              onChange={(e) => setAuthUrl(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="https://bsms.hutch.lk/api/login"
              maxLength={LIMITS.smsPortalUrl.max}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="sms-sms-url" className="text-sm font-medium">
              SMS URL
            </label>
            <Input
              id="sms-sms-url"
              type="url"
              value={smsUrl}
              onChange={(e) => setSmsUrl(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="https://bsms.hutch.lk/api/sendsms"
              maxLength={LIMITS.smsPortalUrl.max}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="sms-mask" className="text-sm font-medium">
              SMS Mask
            </label>
            <Input
              id="sms-mask"
              type="text"
              value={smsMask}
              onChange={(e) => setSmsMask(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="COSMETICSLK"
              maxLength={LIMITS.smsPortalMask.max}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="sms-campaign" className="text-sm font-medium">
              Campaign Name
            </label>
            <Input
              id="sms-campaign"
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="General"
              maxLength={LIMITS.smsPortalCampaign.max}
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-medium">Test SMS</h3>
            <p className="text-muted-foreground text-xs">
              Save your configuration first, then send a test SMS to verify it works.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-2 min-w-[200px] flex-1">
                <label htmlFor="sms-test-phone" className="text-sm font-medium sr-only">
                  Phone number for test SMS
                </label>
                <Input
                  id="sms-test-phone"
                  type="tel"
                  value={testPhoneNumber}
                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTestSms();
                    }
                  }}
                  disabled={isBusy}
                  placeholder="07XXXXXXXX or 94XXXXXXXXX"
                  maxLength={LIMITS.mobile.max}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestSms}
                disabled={isBusy}
              >
                {busyKey === "test" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Sending...
                  </>
                ) : (
                  "Send test SMS"
                )}
              </Button>
            </div>
          </div>

          {canEdit && (
            <Button type="submit" disabled={isBusy || !hasChanges}>
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
