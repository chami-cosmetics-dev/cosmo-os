"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PasswordChangeForm } from "@/components/molecules/password-change-form";

export function PasswordChangeModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" type="button">
          <KeyRound className="size-4" aria-hidden />
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Update your account password. Use a strong password with at least 8
            characters, including uppercase, lowercase, and a number.
          </DialogDescription>
        </DialogHeader>
        <PasswordChangeForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
