import { Ribbon } from "./ribbon";
import { Sidebar } from "./sidebar";
import { getCurrentUser } from "~/lib/auth";
import { getApprovals, getSummary } from "~/lib/queries";

export async function Shell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const [user, s, approvals] = await Promise.all([
    getCurrentUser(),
    getSummary(),
    getApprovals(),
  ]);
  return (
    <div className="flex min-h-dvh">
      <Sidebar active={active} approvalCount={approvals.length} user={user} />
      <div className="flex-1 flex flex-col min-w-0">
        <Ribbon
          network={s.network}
          treasuryPubkey={s.treasuryPubkey}
          treasuryUsd={s.totalBalance}
          spendTodayUsd={s.spendToday}
          pending={s.pending}
          blockedToday={s.blockedCount}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
