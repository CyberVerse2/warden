import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { getAgents } from "~/lib/queries";
import { DryRunForm } from "./dry-run-form";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const agents = await getAgents();
  const options = agents.map((a) => ({ id: a.id, name: a.name }));

  return (
    <Shell active="/policy">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <span className="mono text-t4 text-[11px]">CMD · 04 / POLICY</span>
        <h1 className="mt-2 text-[28px] tracking-[-0.025em] text-t1 font-medium">
          Policy console
        </h1>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[58ch] leading-relaxed">
          Test what Warden would do for any agent and any request without
          spending a cent. Edit a policy from its agent detail page.
        </p>
      </header>

      <Section code="04.00" title="Dry run">
        {options.length === 0 ? (
          <p className="text-t3 text-[13px]">
            No agents yet. Create one from the Agents page.
          </p>
        ) : (
          <div className="-mx-8 -mb-8 border-t border-hairline">
            <DryRunForm agents={options} />
          </div>
        )}
      </Section>
    </Shell>
  );
}
