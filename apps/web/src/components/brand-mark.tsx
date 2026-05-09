interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  version?: string;
}

const SIZE_CLASS = {
  sm: "size-7",
  md: "size-9",
  lg: "size-12",
};

export function BrandMark({
  size = "md",
  showWordmark = true,
  version,
}: BrandMarkProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`${SIZE_CLASS[size]} inline-flex shrink-0 items-center justify-center overflow-hidden border border-hairline-strong bg-bg-deep`}
      >
        <img
          src="/brand/warden-logo.png"
          alt=""
          className="size-full object-cover"
          width={48}
          height={48}
        />
      </span>
      {showWordmark && (
        <span className="inline-flex items-baseline gap-2.5">
          <span className="mono text-signal text-[15px] font-semibold">
            warden
          </span>
          {version ? <span className="label">{version}</span> : null}
        </span>
      )}
    </span>
  );
}
