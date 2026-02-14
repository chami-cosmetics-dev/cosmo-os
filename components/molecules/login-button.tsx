"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function LoginButton() {
  return (
    <Button asChild size="lg">
      <Link href="/auth/login">Sign in</Link>
    </Button>
  );
}
