import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function Ribbon({
  ctaHref,
  ctaLabel,
}: {
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-bg-base/85 backdrop-blur">
      <div className="max-w-[1200px] mx-auto px-8 h-14 flex items-center gap-6">
        <Link href="/" aria-label="Warden home">
          <BrandMark size="sm" />
        </Link>
        <nav className="hidden md:flex items-center gap-5 ml-auto">
          <a href="#flow" className="label text-t4 hover:text-t1 transition-colors">
            FLOW
          </a>
          <a href="/dashboard" className="label text-t4 hover:text-t1 transition-colors">
            CONSOLE
          </a>
          <a
            href={ctaHref}
            className="label px-3 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base transition-colors"
          >
            {ctaLabel}
          </a>
        </nav>
      </div>
    </header>
  );
}
