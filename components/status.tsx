"use client";

import { CheckCircleIcon, FlagIcon, HourglassIcon, type Icon, InfoIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type Tone, toneVar, verdictSolid, verdictTone } from "@/lib/format";
import type { VerdictCode } from "@/lib/types";

const ICONS = {
  good: CheckCircleIcon,
  warning: WarningIcon,
  serious: WarningIcon,
  critical: WarningOctagonIcon,
  neutral: InfoIcon,
};

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = ICONS[tone];
  return <Icon weight="fill" className={cn("shrink-0", className)} style={{ color: toneVar[tone] }} aria-hidden />;
}

/** API codes such as "RED FLAG" read as "Red flag"; mixed-case text ("Tier 3.B") is left alone. */
export function sentenceCase(node: ReactNode): ReactNode {
  if (typeof node !== "string" || node !== node.toUpperCase() || !/[A-Z]{2}/.test(node)) return node;
  const lower = node.toLowerCase();
  const i = lower.search(/[a-z]/);
  return lower.slice(0, i) + lower[i].toUpperCase() + lower.slice(i + 1);
}

/** Status is never colour alone: icon + label. Solid badges mark decisions that block a shipment. */
export function StatusBadge({ tone, children, className, solid, large, icon }: {
  tone: Tone; children: ReactNode; className?: string; solid?: boolean; large?: boolean; icon?: Icon;
}) {
  const c = toneVar[tone];
  const Glyph = icon ?? ICONS[tone];
  // White on the critical red is 4.8:1; the lighter serious orange needs dark ink (7.2:1)
  const ink = tone === "critical" ? "var(--on-critical)" : "var(--on-serious)";
  return (
    <span
      className={cn(
        // Wraps rather than overflow when the reader's text size is large
        "inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-normal border text-left font-semibold",
        large ? "min-h-9 px-3 py-1 text-base" : "min-h-6 px-2 py-0.5 text-sm",
        !solid && "text-foreground",
        className,
      )}
      style={solid ? { borderColor: c, background: c, color: ink } : {
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
    >
      <Glyph weight="fill" aria-hidden className={cn("shrink-0", large ? "size-4.5" : "size-3.5")} style={solid ? undefined : { color: c }} />
      {Children.map(children, sentenceCase)}
    </span>
  );
}

/** Hold and Red flag share the orange: their own icons tell them apart without the word. */
const VERDICT_ICON: Partial<Record<VerdictCode, Icon>> = { HOLD: HourglassIcon, "RED FLAG": FlagIcon };

/** The action as a badge, the same everywhere: solid when it blocks the shipment. */
export function VerdictBadge({ code, children, large, className }: {
  code: VerdictCode; children?: ReactNode; large?: boolean; className?: string;
}) {
  return (
    <StatusBadge tone={verdictTone[code]} solid={verdictSolid(code)} icon={VERDICT_ICON[code]} large={large} className={className}>
      {children ?? code}
    </StatusBadge>
  );
}
