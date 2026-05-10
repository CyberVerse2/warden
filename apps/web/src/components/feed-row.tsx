"use client";

import { fmtTime, fmtUsd, shortKey } from "~/lib/format";
import { StatusGlyph } from "./status-glyph";
import type { ReceiptRow } from "~/lib/queries";
import { ResponseArtifact } from "./response-artifact";
import { useState } from "react";

export function FeedRow({ r }: { r: ReceiptRow }) {
  const [open, setOpen] = useState(false);
  const hasArtifacts = Boolean(r.artifacts?.length);
  return (
    <div className="border-b border-hairline/60 text-[12.5px] group">
      <button
        type="button"
        onClick={() => hasArtifacts && setOpen((value) => !value)}
        className={`motion-row grid min-w-[680px] w-full grid-cols-[78px_22px_140px_1fr_88px_72px] items-center gap-4 py-2 px-1 text-left hover:bg-bg-row/40 transition-colors ${
          hasArtifacts ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="mono text-t4 text-[11px]">
          {fmtTime(r.createdAt)}
        </span>
        <StatusGlyph status={r.decision} showLabel={false} />
        <span className="text-t1 truncate">{r.agentName}</span>
        <span className="text-t3 truncate">
          <span className="text-t2">{r.provider}</span>
          <span className="text-t4">
            {" · "}
            {new URL(r.url).pathname}
          </span>
        </span>
        <span className="label-num text-t1 text-right text-[12.5px]">
          {fmtUsd(r.amountUsd)}
        </span>
        <span className="mono text-t4 text-[10.5px] text-right opacity-0 group-hover:opacity-100 transition-opacity">
          {hasArtifacts ? (open ? "CLOSE" : "OPEN") : shortKey(r.id, 3, 5)}
        </span>
      </button>
      {open && r.artifacts?.length ? (
        <div className="motion-enter space-y-3 px-1 pb-3 pt-1">
          {r.artifacts.map((artifact) => (
            <ResponseArtifact key={artifact.id} artifact={artifact} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
