"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ViewBoundary } from "@/components/view-boundary";
import { cn } from "@/lib/utils";

/** Each 3D view's height, shared by the view and its loading placeholder so they cannot drift apart. */
export const VIEW_H = {
  diorama: "h-57.5 sm:h-82.5",
  globe: "h-95 sm:h-130",
  cube: "h-90 sm:h-110",
  skyline: "h-70 sm:h-115",
  network: "h-90 sm:h-100",
  item: "h-75",
} as const;

/** Placeholder with the same size as the view it stands in for. */
export function Loading3D({ className, label = "Loading 3D view…" }: { className?: string; label?: string }) {
  return (
    <div className={cn("grid place-items-center bg-muted/40 text-sm text-muted-foreground border border-border", className)}>
      {label}
    </div>
  );
}

/**
 * A 3D view loaded on demand (three.js stays out of the initial bundle), shown with a placeholder
 * while it loads and isolated by an error boundary if it fails.
 */
export function lazy3D<P extends object>(load: () => Promise<ComponentType<P>>, label: string, className: string) {
  const View = dynamic(load, { ssr: false, loading: () => <Loading3D className={className} /> });
  function Lazy(props: P) {
    return (
      <ViewBoundary label={label} className={className}>
        <View {...props} />
      </ViewBoundary>
    );
  }
  Lazy.displayName = `Lazy(${label})`;
  return Lazy;
}
