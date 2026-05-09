import { getReceipts } from "~/lib/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const decision = url.searchParams.get("decision");
  const receipts = await getReceipts({
    limit: 1000,
    decision:
      decision === "allow" || decision === "deny" || decision === "failed"
        ? decision
        : undefined,
  });

  return new Response(JSON.stringify(receipts, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="warden-receipts.json"`,
    },
  });
}
