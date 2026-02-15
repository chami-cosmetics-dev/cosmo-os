"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

export function SuperAdminInviteForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");

    try {
      const res = await fetch("/api/invite/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setStatus("error");
        notify.error(data.error ?? "Failed to send invite");
        return;
      }

      setStatus("success");
      notify.success("Check your email for the activation link.");
    } catch {
      setStatus("error");
      notify.error("Failed to send invite");
    }
  }

  if (status === "success") {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Didn&apos;t receive the email?{" "}
          <Link href="/invite/request" className="text-primary underline">
            Request a new invite
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email address
        </label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === "loading"}
        />
      </div>
      <Button type="submit" disabled={status === "loading"}>
        {status === "loading" ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Sending...
          </>
        ) : (
          "Request Super Admin Invite"
        )}
      </Button>
    </form>
  );
}
