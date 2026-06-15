import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAgentRecord } from "../mutations";

export async function POST(request: Request) {
  const formData = await request.formData();
  const { agentId, rawToken } = await createAgentRecord(formData);

  revalidatePath("/agents");
  redirect(`/agents/${agentId}/token?token=${encodeURIComponent(rawToken)}`);
}
