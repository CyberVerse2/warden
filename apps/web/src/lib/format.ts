export function fmtUsd(n: number, opts: { precise?: boolean } = {}): string {
  if (n === 0) return "$0.00";
  const decimals = opts.precise ? 4 : n < 1 ? 4 : 2;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtNetwork(network: string): string {
  if (network === "eip155:42220") return "Celo";
  if (network === "eip155:11142220") return "Celo Sepolia";
  return network;
}

export function shortKey(key: string, head = 4, tail = 4): string {
  if (key.length <= head + tail + 1) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

const TIME_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31536000_000],
  ["month", 2592000_000],
  ["week", 604800_000],
  ["day", 86400_000],
  ["hour", 3600_000],
  ["minute", 60_000],
  ["second", 1000],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function fmtRelative(date: Date | number): string {
  const ms = typeof date === "number" ? date : date.getTime();
  const diff = ms - Date.now();
  for (const [unit, msPerUnit] of TIME_UNITS) {
    if (Math.abs(diff) >= msPerUnit || unit === "second") {
      return rtf.format(Math.round(diff / msPerUnit), unit);
    }
  }
  return rtf.format(0, "second");
}

export function fmtTime(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function fmtDate(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
