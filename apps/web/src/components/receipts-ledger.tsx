"use client";

import { useMemo, useState } from "react";
import { ResponseArtifact } from "~/components/response-artifact";
import { StatusGlyph } from "~/components/status-glyph";
import { fmtRelative, fmtTime, fmtUsd, shortKey } from "~/lib/format";
import type { ReceiptRow } from "~/lib/queries";

export function ReceiptsLedger({ receipts }: { receipts: ReceiptRow[] }) {
  const [selectedId, setSelectedId] = useState(receipts[0]?.id);
  const selected = useMemo(
    () => receipts.find((receipt) => receipt.id === selectedId) ?? receipts[0],
    [receipts, selectedId],
  );

  if (receipts.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-t3">
        No receipts match this view.
      </div>
    );
  }

  return (
    <div className="grid min-h-[620px] min-w-0 grid-cols-1 divide-hairline xl:grid-cols-[minmax(0,1fr)_380px] xl:divide-x">
      <div className="min-w-0 overflow-x-auto text-[12.5px]">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[88px_22px_72px_150px_minmax(220px,1fr)_112px_92px_82px] gap-3 border-b border-hairline-strong px-3 pb-2">
            <span className="label">UTC</span>
            <span className="label" />
            <span className="label">Decision</span>
            <span className="label">Agent</span>
            <span className="label">Target</span>
            <span className="label text-right">Amount</span>
            <span className="label">Network</span>
            <span className="label text-right">Receipt</span>
          </div>
          {receipts.map((receipt) => {
            const selectedRow = receipt.id === selected?.id;
            return (
              <button
                type="button"
                key={receipt.id}
                onClick={() => setSelectedId(receipt.id)}
                className={`motion-row grid w-full grid-cols-[88px_22px_72px_150px_minmax(220px,1fr)_112px_92px_82px] items-center gap-3 border-b border-hairline/60 px-3 py-2.5 text-left transition-colors ${
                  selectedRow ? "bg-bg-row-hover" : "hover:bg-bg-row/40"
                }`}
              >
                <div className="flex flex-col">
                  <span className="mono text-t1 text-[11.5px]">
                    {fmtTime(receipt.createdAt)}
                  </span>
                  <span className="mono text-t4 text-[10.5px]">
                    {fmtRelative(receipt.createdAt)}
                  </span>
                </div>
                <StatusGlyph status={receipt.decision} showLabel={false} />
                <span className={`label ${decisionClass(receipt.decision)}`}>
                  {decisionLabel(receipt.decision)}
                </span>
                <div className="flex flex-col">
                  <span className="truncate text-t1">{receipt.agentName}</span>
                  <span className="mono text-t4 text-[10.5px]">
                    {shortKey(receipt.agentId, 4, 4)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="truncate text-t2">{receipt.provider}</span>
                  <span className="mono truncate text-t4 text-[10.5px]">
                    {receipt.method} {new URL(receipt.url).pathname}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="label-num text-t1 text-[13px]">
                    {fmtUsd(receipt.amountUsd)}
                  </span>
                  <span className="mono text-t4 text-[10.5px]">{receipt.currency}</span>
                </div>
                <span className="mono text-t3 text-[10.5px]">
                  {receipt.network.replace("solana-", "")}
                </span>
                <span className="mono text-right text-t4 text-[10.5px]">
                  {shortKey(receipt.id, 3, 5)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="min-w-0 border-t border-hairline bg-bg-deep/25 p-4 xl:border-t-0">
        {selected ? <ReceiptInspector key={selected.id} receipt={selected} /> : null}
      </aside>
    </div>
  );
}

function ReceiptInspector({ receipt }: { receipt: ReceiptRow }) {
  return (
    <div className="motion-enter sticky top-4 space-y-4">
      <div className="motion-panel border border-hairline-strong bg-bg-base p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="label">Actual receipt</span>
          <span className={`label ${decisionClass(receipt.decision)}`}>
            {decisionLabel(receipt.decision)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 border border-hairline">
          <ReceiptField label="Receipt" value={receipt.id} mono />
          <ReceiptField label="Agent" value={receipt.agentName} />
          <ReceiptField label="Amount" value={fmtUsd(receipt.amountUsd)} />
          <ReceiptField label="Currency" value={receipt.currency} mono />
          <ReceiptField label="Network" value={receipt.network} mono />
          <ReceiptField label="Status" value={String(receipt.responseStatus)} mono />
        </div>
        <div className="mt-4 space-y-3">
          <DetailLine label="Provider">{receipt.provider}</DetailLine>
          <DetailLine label="Request">
            <span className="mono break-all">
              {receipt.method} {receipt.url}
            </span>
          </DetailLine>
          <DetailLine label="Reason">{receipt.decisionReason}</DetailLine>
          {receipt.txSignature ? (
            <DetailLine label="Tx">
              <span className="mono break-all">{receipt.txSignature}</span>
            </DetailLine>
          ) : null}
          <DetailLine label="Created">{new Date(receipt.createdAt).toISOString()}</DetailLine>
        </div>
      </div>

      {receipt.artifacts?.length ? (
        <div className="space-y-3">
          {receipt.artifacts.map((artifact) => (
            <ResponseArtifact key={artifact.id} artifact={artifact} />
          ))}
        </div>
      ) : (
        <div className="border border-hairline-strong bg-bg-base p-4">
          <span className="label">Provider result</span>
          <p className="mt-2 text-[12.5px] leading-relaxed text-t3">
            No stored response artifact for this receipt.
          </p>
        </div>
      )}
    </div>
  );
}

function ReceiptField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-r border-hairline p-3 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <span className="label">{label}</span>
      <span className={`mt-1 block truncate text-[12px] text-t1 ${mono ? "mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function DetailLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[82px_1fr] gap-3 text-[12.5px]">
      <span className="label pt-px">{label}</span>
      <span className="min-w-0 text-t2">{children}</span>
    </div>
  );
}

function decisionLabel(decision: ReceiptRow["decision"]) {
  return decision === "allow" ? "ALLOW" : decision === "deny" ? "DENY" : "FAILED";
}

function decisionClass(decision: ReceiptRow["decision"]) {
  return decision === "allow"
    ? "text-allow"
    : decision === "deny"
      ? "text-deny"
      : "text-pending";
}
