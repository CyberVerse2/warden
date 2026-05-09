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
      className="label text-signal hover:text-t1 transition-colors cursor-pointer"
    >
      {copied ? "COPIED" : failed ? "COPY BLOCKED" : label}
    </button>
  );
}
