type Status = "allow" | "deny" | "failed" | "pending" | "active" | "revoked";

const MAP: Record<Status, { glyph: string; color: string; label: string }> = {
  allow: { glyph: "●", color: "text-allow", label: "ALLOW" },
  active: { glyph: "●", color: "text-allow", label: "ACTIVE" },
  deny: { glyph: "●", color: "text-deny", label: "DENY" },
  revoked: { glyph: "○", color: "text-deny", label: "REVOKED" },
  failed: { glyph: "✕", color: "text-deny", label: "FAILED" },
  pending: { glyph: "◐", color: "text-pending", label: "PENDING" },
};

export function StatusGlyph({
  status,
  showLabel = true,
}: {
  status: Status;
  showLabel?: boolean;
}) {
  const { glyph, color, label } = MAP[status];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`mono ${color}`} aria-hidden>
        {glyph}
      </span>
      {showLabel && <span className="label">{label}</span>}
    </span>
  );
}
