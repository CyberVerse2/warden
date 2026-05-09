import { and, eq, spendWindows, sql, type Db } from "@warden/db";

export function dayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `day:${y}-${m}-${day}`;
}

export async function getDailySpend(
  db: Db,
  agentId: string,
  key = dayKey(),
): Promise<number> {
  const [row] = await db
    .select({ amountUsd: spendWindows.amountUsd })
    .from(spendWindows)
    .where(and(eq(spendWindows.agentId, agentId), eq(spendWindows.windowKey, key)));
  return row?.amountUsd ?? 0;
}

export async function incrementDailySpend(
  db: Db,
  agentId: string,
  amountUsd: number,
  key = dayKey(),
): Promise<void> {
  await db
    .insert(spendWindows)
    .values({ agentId, windowKey: key, amountUsd })
    .onConflictDoUpdate({
      target: [spendWindows.agentId, spendWindows.windowKey],
      set: {
        amountUsd: sql`${spendWindows.amountUsd} + ${amountUsd}`,
        updatedAt: new Date(),
      },
    });
}
