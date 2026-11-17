"use client";

import { CheckIcon, LinkSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies the address bar, which always describes what is on screen. */
export function CopyLink({ size = "sm", className }: { size?: "xs" | "sm"; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      // Older browsers or blocked clipboard permission: copy through a temporary text field
      const field = Object.assign(document.createElement("textarea"), { value: window.location.href });
      field.style.cssText = "position:fixed;opacity:0";
      document.body.append(field);
      field.select();
      setState(document.execCommand("copy") ? "copied" : "failed");
      field.remove();
    }
    window.setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button variant="ghost" size={size} className={className} onClick={copy}>
      {state === "copied" ? <CheckIcon /> : <LinkSimpleIcon />}
      <span aria-live="polite">{state === "copied" ? "Link copied" : state === "failed" ? "Copy failed: use the address bar" : "Copy link"}</span>
    </Button>
  );
}
