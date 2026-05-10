import type { ResponseArtifactRow } from "~/lib/queries";

export function ResponseArtifact({ artifact }: { artifact: ResponseArtifactRow }) {
  const imageUrls = collectMediaUrls(artifact.responseBody, "image");
  const videoUrls = collectMediaUrls(artifact.responseBody, "video");
  const audioSources = collectAudioSources(artifact.responseBody);
  const text = textResult(artifact.responseBody);
  const html = text && looksLikeHtml(text) ? summarizeHtml(text) : undefined;
  return (
    <div className="motion-panel motion-enter border border-hairline-strong bg-bg-base/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label">{artifact.title}</span>
        {artifact.operationId && (
          <code className="mono text-[10.5px] text-t4">{artifact.operationId}</code>
        )}
      </div>
      {imageUrls.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {imageUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="motion-panel block overflow-hidden border border-hairline bg-bg-deep"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="x402 response"
                className="max-h-[320px] w-full object-contain"
              />
            </a>
          ))}
        </div>
      )}
      {videoUrls.length > 0 && (
        <div className="space-y-2">
          {videoUrls.map((url) => (
            <video
              key={url}
              src={url}
              controls
              className="max-h-[320px] w-full border border-hairline bg-bg-deep"
            />
          ))}
        </div>
      )}
      {audioSources.length > 0 && (
        <div className="space-y-2">
          {audioSources.map((source) => (
            <div
              key={source.src}
              className="border border-hairline bg-bg-deep p-3"
            >
              <p className="label text-t4">Voice note</p>
              <audio
                src={source.src}
                controls
                className="mt-3 w-full"
              />
            </div>
          ))}
        </div>
      )}
      {html && (
        <div className="border border-hairline bg-bg-deep p-3">
          <p className="label text-t4">HTML response truncated</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-t2">
            {html}
          </p>
        </div>
      )}
      {text && !html && audioSources.length === 0 && (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-t2">
          {truncateText(text)}
        </p>
      )}
      {imageUrls.length === 0 && videoUrls.length === 0 && audioSources.length === 0 && !text && (
        <pre className="max-h-[260px] overflow-auto border border-hairline bg-bg-deep p-3 mono text-[11px] leading-relaxed text-t2">
          {truncateText(JSON.stringify(artifact.responseBody, null, 2))}
        </pre>
      )}
    </div>
  );
}

function collectAudioSources(value: unknown) {
  const sources = new Map<string, { src: string; contentType?: string }>();
  const visit = (item: unknown, parentKey?: string) => {
    if (typeof item === "string") {
      const source = audioSourceFromString(item, parentKey);
      if (source) sources.set(source.src, source);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, parentKey));
      return;
    }
    if (!isRecord(item)) return;

    const url = typeof item.url === "string" ? item.url : undefined;
    const contentType =
      typeof item.content_type === "string"
        ? item.content_type
        : typeof item.contentType === "string"
          ? item.contentType
          : undefined;
    if (url && (contentType?.startsWith("audio/") || isAudioUrl(url))) {
      sources.set(url, { src: url, ...(contentType ? { contentType } : {}) });
    }

    for (const [key, child] of Object.entries(item)) {
      visit(child, key);
    }
  };
  visit(value);
  return [...sources.values()];
}

function audioSourceFromString(value: string, key?: string) {
  if (value.startsWith("data:audio/")) return { src: value };
  if (isAudioUrl(value)) return { src: value };
  if (key && /audio(Content|_content)?|audio|voice/i.test(key) && looksLikeBase64(value)) {
    return { src: `data:audio/mpeg;base64,${value}` };
  }
  return undefined;
}

function collectMediaUrls(value: unknown, kind: "image" | "video") {
  const urls = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (isMediaUrl(item, kind)) urls.add(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!isRecord(item)) return;
    const url = typeof item.url === "string" ? item.url : undefined;
    const contentType =
      typeof item.content_type === "string"
        ? item.content_type
        : typeof item.contentType === "string"
          ? item.contentType
          : undefined;
    if (url && (matchesContentType(contentType, kind) || isMediaUrl(url, kind))) {
      urls.add(url);
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
  return [...urls];
}

function isMediaUrl(url: string, kind: "image" | "video") {
  if (!/^https?:\/\//i.test(url)) return false;
  return kind === "image"
    ? /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(url)
    : /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url);
}

function isAudioUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  return /\.(mp3|wav|ogg|opus|m4a|aac|flac)(?:[?#].*)?$/i.test(url);
}

function looksLikeBase64(value: string) {
  const compact = value.trim();
  return compact.length > 80 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function matchesContentType(contentType: string | undefined, kind: "image" | "video") {
  return kind === "image"
    ? contentType?.startsWith("image/")
    : contentType?.startsWith("video/");
}

function textResult(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  for (const key of ["text", "output", "answer", "summary", "result"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function looksLikeHtml(value: string) {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]/i.test(value);
}

function summarizeHtml(value: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(value)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(
    value,
  )?.[1];
  return [
    title ? `Title: ${title}` : undefined,
    description ? `Description: ${description}` : undefined,
    "The provider returned an HTML document instead of a structured API response.",
  ]
    .filter(Boolean)
    .join("\n");
}

function truncateText(value: string, max = 1_200) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}\n...[truncated]` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
