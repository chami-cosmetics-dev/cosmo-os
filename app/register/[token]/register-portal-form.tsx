"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Status = "loading" | "ready" | "missing" | "saved" | "error";

export function RegisterPortalForm({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [locationLabel, setLocationLabel] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/register/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("missing");
          setMessage(
            typeof data.error === "string" ? data.error : "Link not found.",
          );
          return;
        }
        setLocationLabel(
          typeof data.locationLabel === "string" ? data.locationLabel : "",
        );
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("missing");
          setMessage("Unable to load this registration link.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/register/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phoneNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(
          typeof data.error === "string" ? data.error : "Save failed.",
        );
        return;
      }
      setStatus("saved");
      setMessage("Saved. Thank you.");
    } catch {
      setStatus("error");
      setMessage("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-start px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>
            {locationLabel
              ? `Location: ${locationLabel}`
              : "Enter your details."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : status === "missing" ? (
            <p className="text-sm text-destructive">{message}</p>
          ) : status === "saved" ? (
            <p className="text-sm text-foreground">{message}</p>
          ) : (
            <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Email</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Phone</span>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              {message ? (
                <p className="text-sm text-destructive">{message}</p>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Saving…" : "Save"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
