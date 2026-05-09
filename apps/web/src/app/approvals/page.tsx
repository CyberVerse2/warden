import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { ConfirmSubmitButton } from "~/components/confirm-submit-button";
import { fmtRelative, fmtTime, fmtUsd, shortKey } from "~/lib/format";
import { getAgents, getApprovals } from "~/lib/queries";
import { decideApproval } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [sorted, agents] = await Promise.all([getApprovals(), getAgents()]);

  return (
    <Shell active="/approvals">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <span className="mono text-t4 text-[11px]">CMD · 02 / APPROVALS</span>
        <div className="flex items-baseline justify-between">
          <h1 className="mt-2 text-[28px] tracking-[-0.025em] text-t1 font-medium">
            Approvals
          </h1>
          {sorted.length > 0 && (
            <span className="label-num text-pending text-[13px]">
              {sorted.length} awaiting · oldest{" "}
              {fmtRelative(sorted[0]!.createdAt)}
            </span>
          )}
        </div>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[58ch] leading-relaxed">
          Requests that passed every other policy check but crossed an explicit
          approval threshold. Until you decide, Warden holds.
        </p>
      </header>

      <Section
        code="02.00"
        title="Queue"
        meta="oldest first · auto-deny after 24h"
      >
        {sorted.length === 0 ? (
          <div className="py-20 text-center max-w-[40ch] mx-auto">
            <span className="mono text-allow text-[24px]">●</span>
            <p className="mt-3 text-t1 text-[14px]">Queue is empty.</p>
            <p className="mt-1 text-t3 text-[12.5px] leading-relaxed">
              Approvals appear here when an agent attempts a payment at or
              above its policy&apos;s approval threshold.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sorted.map((a) => {
              const agent = agents.find((ag) => ag.id === a.agentId);
              return (
                <article
                  key={a.id}
                  className="border border-hairline bg-bg-deep/40 hover:border-hairline-strong transition-colors"
                >
                  <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
                    <div className="flex items-baseline gap-3">
                      <span className="mono text-t4 text-[11px]">
                        {fmtTime(a.createdAt)}
                      </span>
                      <span className="text-t1 text-[14px]">{a.agentName}</span>
                      <span className="mono text-t4 text-[10.5px]">
                        {shortKey(a.id, 3, 5)}
                      </span>
                    </div>
                    <span className="label text-pending">
                      ◐ {a.triggeringRule.split(".").pop()}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-8 p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="label">REQUEST</span>
                        <span className="text-t1 text-[15px]">
                          <span className="text-t2">{a.provider}</span>
                          <span className="text-t4">
                            {" · "}
                            {new URL(a.url).pathname}
                          </span>
                        </span>
                        <span className="mono text-t3 text-[11px] truncate">
                          {a.url}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="label">RULE TRIGGERED</span>
                        <span className="mono text-t1 text-[12.5px]">
                          {a.triggeringRule}
                        </span>
                        <span className="text-t3 text-[12.5px] leading-relaxed max-w-[60ch]">
                          {a.reason}
                        </span>
                      </div>

                      {agent && (
                        <div className="flex flex-col gap-1">
                          <span className="label">AGENT BUDGET</span>
                          <span className="mono text-t2 text-[12.5px]">
                            {fmtUsd(agent.spentTodayUsd)} spent ·{" "}
                            {fmtUsd(
                              Math.max(
                                0,
                                agent.dailyCapUsd - agent.spentTodayUsd,
                              ),
                            )}{" "}
                            remaining today
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end justify-between gap-4 min-w-[200px]">
                      <div className="flex flex-col items-end">
                        <span className="label-num text-pending text-[42px] leading-[1] tracking-[-0.025em]">
                          {fmtUsd(a.amountUsd)}
                        </span>
                        <span className="label-num text-t4 text-[10.5px] mt-1">
                          USDC ·{" "}
                          {agent?.network.replace("solana-", "") ?? ""}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <form
                          action={async () => {
                            "use server";
                            await decideApproval(a.id, "denied");
                          }}
                        >
                          <ConfirmSubmitButton
                            confirm={`Deny ${fmtUsd(a.amountUsd)} request from ${a.agentName}?`}
                            className="label px-5 py-2.5 border border-hairline-strong text-t2 hover:text-deny hover:border-deny transition-colors cursor-pointer"
                          >
                            DENY
                          </ConfirmSubmitButton>
                        </form>
                        <form
                          action={async () => {
                            "use server";
                            await decideApproval(a.id, "approved");
                          }}
                        >
                          <ConfirmSubmitButton
                            confirm={`Approve and sign this ${fmtUsd(a.amountUsd)} payment for ${a.agentName}?`}
                            className="label px-5 py-2.5 bg-allow-dim text-t1 hover:bg-allow hover:text-bg-base transition-colors cursor-pointer"
                          >
                            APPROVE & SIGN
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </Shell>
  );
}
