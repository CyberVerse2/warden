import { fmtTime, fmtUsd, shortKey } from "~/lib/format";
import { StatusGlyph } from "./status-glyph";
import type { ReceiptRow } from "~/lib/queries";

export function FeedRow({ r }: { r: ReceiptRow }) {
  return (
    <div className="grid grid-cols-[78px_22px_140px_1fr_88px_72px] items-center gap-4 py-2 px-1 border-b border-hairline/60 hover:bg-bg-row/40 transition-colors text-[12.5px] group">
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
        {shortKey(r.id, 3, 5)}
      </span>
    </div>
  );
}
