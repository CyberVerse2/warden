"use client";

import { useState } from "react";

export function CopyButton({ text, label = "COPY" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setFailed(true);
          setTimeout(() => setFailed(false), 2000);
        }
      }}
      className={`motion-press label cursor-pointer text-signal transition-colors hover:text-t1 ${
        copied ? "motion-flash text-allow" : failed ? "text-deny" : ""
      }`}
    >
      {copied ? "COPIED" : failed ? "COPY BLOCKED" : label}
    </button>
  );
}
