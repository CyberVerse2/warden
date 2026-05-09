import { agents, receipts } from "@warden/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const encoder = new TextEncoder();
  let latest = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller closed; nothing to do
        }
      };

      const tick = async () => {
        try {
          const db = getDb();
          const where = and(
            eq(agents.userId, user.id),
            ...(latest > 0 ? [gt(receipts.createdAt, new Date(latest))] : []),
          );
          const rows = await db
            .select({
              id: receipts.id,
              agentId: receipts.agentId,
              decision: receipts.decision,
              amountUsd: receipts.amountUsd,
              host: receipts.host,
              url: receipts.url,
              createdAt: receipts.createdAt,
            })
            .from(receipts)
            .innerJoin(agents, eq(agents.id, receipts.agentId))
            .where(where)
            .orderBy(desc(receipts.createdAt))
            .limit(25);
          if (rows.length > 0) {
            latest = Math.max(...rows.map((r) => r.createdAt.getTime()));
            send("receipts", rows);
          } else {
            send("ping", { at: Date.now() });
          }
        } catch (error) {
          send("error", { message: (error as Error).message });
        }
      };

      interval = setInterval(tick, 1000);

      req.signal.addEventListener("abort", () => {
        if (interval) clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
