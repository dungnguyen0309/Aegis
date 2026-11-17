"use client";

import { BookOpenIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Reference } from "@/lib/types";

// The long text is fetched when the dialog first opens, not with the page
const MethodologyBody = dynamic(() => import("@/components/methodology-body").then((m) => m.MethodologyBody), {
  loading: () => <p className="text-sm text-muted-foreground">Loading…</p>,
});

export function MethodologyDialog({ reference }: { reference: Reference | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-base max-sm:text-sm pointer-coarse:min-w-11"><BookOpenIcon /> <span className="max-[23.75rem]:sr-only">Methodology</span></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Methodology and limitations</DialogTitle>
        </DialogHeader>

        {/* The body scrolls, not the dialog, so the Close button stays in view */}
        <div tabIndex={0} role="region" aria-label="Methodology text" className="min-h-0 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <MethodologyBody reference={reference} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
