"use client";

import { ArrowRightLeft, PhoneCall, UsersRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ContactAllocationPanel() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Contact Allocation</CardTitle>
          <CardDescription>
            Allocate contacts and review candidates to merchants separately from the review-capture workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <UsersRound className="size-4 text-primary" />
                Allocation Source
              </div>
              <p className="text-sm text-muted-foreground">
                Contacts, orders, or follow-up lists should be assigned to a merchant from this screen.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ArrowRightLeft className="size-4 text-primary" />
                Allocation Status
              </div>
              <p className="text-sm text-muted-foreground">
                This workflow will track which merchant owns the next customer follow-up workload.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <PhoneCall className="size-4 text-primary" />
                Review Handover
              </div>
              <p className="text-sm text-muted-foreground">
                After allocation is finished, merchants can work from the separate Merchant Reviews page.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-6">
            <p className="font-medium">Allocation logic is being kept separate on purpose.</p>
            <p className="text-muted-foreground mt-2 text-sm">
              The new review sheet is already available under <span className="font-medium">Merchant Reviews</span>.
              The proper contact allocation workflow will be built here next, so assignment and review do not get mixed together.
            </p>
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link href="/dashboard/contacts/reviews">Open Merchant Reviews</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
