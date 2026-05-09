interface SectionProps {
  id?: string;
  code: string;
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ id, code, title, meta, action, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-hairline first:border-t-0">
      <header className="flex items-baseline gap-4 px-8 pt-8 pb-4">
        <span className="mono text-t4 text-[11px]">{code}</span>
        <h2 className="text-[14px] tracking-[-0.005em] text-t1 font-medium">
          {title}
        </h2>
        {meta && <span className="label ml-auto">{meta}</span>}
        {action && <div className={meta ? "" : "ml-auto"}>{action}</div>}
      </header>
      <div className="px-8 pb-8">{children}</div>
    </section>
  );
}
