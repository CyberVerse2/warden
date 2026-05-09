"use client";

import { useEffect, useState } from "react";

export function UtcClockClient() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = String(t.getUTCHours()).padStart(2, "0");
  const m = String(t.getUTCMinutes()).padStart(2, "0");
  const s = String(t.getUTCSeconds()).padStart(2, "0");
  return (
    <span className="label-num text-t1 text-[13px]" suppressHydrationWarning>
      {h}:{m}:{s}
    </span>
  );
}
