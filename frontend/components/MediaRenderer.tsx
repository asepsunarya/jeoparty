"use client";

import type { Media } from "@jeoparty/shared";

/**
 * When the backend returns media URLs like `http://localhost:9000/...`
 * (MinIO in dev), a peer on the LAN that opens the app via the host's IP
 * can't resolve `localhost`. Rewrite the hostname to whatever the current
 * browser is looking at — the MinIO port is still reachable there.
 */
function localizeUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      u.hostname = window.location.hostname;
      return u.toString();
    }
  } catch {
    /* not a URL */
  }
  return url;
}

export function MediaRenderer({ media }: { media?: Media }) {
  if (!media) return null;
  if (media.kind === "youtube" && media.youtubeId) {
    return (
      <div className="w-full aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=1&modestbranding=1&rel=0`}
          className="w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title="Question video"
        />
      </div>
    );
  }
  const src = media.url ? localizeUrl(media.url) : undefined;
  if (media.kind === "image" && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={media.caption ?? ""}
        className="w-full max-h-[60vh] object-contain rounded-xl bg-black/30"
        loading="lazy"
      />
    );
  }
  if (media.kind === "video" && src) {
    return (
      <video
        src={src}
        controls
        autoPlay
        className="w-full max-h-[60vh] rounded-xl bg-black"
      />
    );
  }
  if (media.kind === "audio" && src) {
    return <audio src={src} controls autoPlay className="w-full" />;
  }
  return null;
}
