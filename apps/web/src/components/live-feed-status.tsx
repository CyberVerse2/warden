"use client";

import { useEffect, useState } from "react";

export function LiveFeedStatus() {
  const [state, setState] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("open", () => setState("live"));
    events.addEventListener("receipts", () => setState("live"));
    events.addEventListener("error", () => setState("error"));
    return () => events.close();
  }, []);

  return (
    <div className="mt-4 flex items-center gap-2">
      <span
        className={`mono ${
          state === "error" ? "text-deny" : "text-signal animate-pulse"
        }`}
      >
        ●
      </span>
      <span className="label">
        {state === "connecting"
          ? "Connecting"
          : state === "error"
          ? "Stream interrupted"
          : "Live · Solana devnet + mainnet"}
      </span>
    </div>
  );
}
