"use client";

import { useEffect, useState } from "react";

export function LiveFeedStatus() {
  const [state, setState] = useState<"connecting" | "live" | "error">("connecting");
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("open", () => setState("live"));
    const onRows = (event: MessageEvent) => {
      setState("live");
      try {
        const rows = JSON.parse(event.data) as unknown[];
        setEventCount((count) => count + rows.length);
      } catch {
        setEventCount((count) => count + 1);
      }
    };
    events.addEventListener("replay", onRows);
    events.addEventListener("receipts", onRows);
    events.addEventListener("error", () => setState("error"));
    return () => {
      events.removeEventListener("replay", onRows);
      events.removeEventListener("receipts", onRows);
      events.close();
    };
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
          : `Live · replayed ${eventCount} ledger rows`}
      </span>
    </div>
  );
}
