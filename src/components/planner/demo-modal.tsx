"use client";

import { ExternalLink, Loader2, PlayCircle, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet, cx } from "@/components/ui";
import type { CatalogExercise } from "@/lib/domain/planner";
import type { Exercise } from "@/lib/types";

/*
  YouTube Shorts demos, played with YouTube's official IFrame Player API so the user never leaves
  the page. Players start MUTED. Videos that can't be embedded (101/150), were removed (100) or
  fail to load fall back to a "Watch on YouTube" link.
*/

export interface Demo {
  title: string; // exercise / drill name
  videoId: string | null;
  videoUrl?: string | null;
  videoTitle?: string | null;
  creator?: string | null;
  instructions?: string | null;
}

export const demoFromCatalog = (e: CatalogExercise): Demo => ({
  title: e.name,
  videoId: e.video_status === "verified" ? e.video_id : null,
  videoUrl: e.video_url,
  videoTitle: e.video_title,
  creator: e.video_creator,
  instructions: e.instructions,
});
export const demoFromExercise = (e: Pick<Exercise, "name" | "video_id" | "video_url" | "video_title" | "video_creator" | "notes">): Demo => ({
  title: e.name,
  videoId: e.video_id,
  videoUrl: e.video_url,
  videoTitle: e.video_title,
  creator: e.video_creator,
  instructions: e.notes,
});

type YTPlayer = { destroy: () => void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: (e: { target: { mute?: () => void } }) => void; onError?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube player couldn't load"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const ERROR_TEXT: Record<number, string> = {
  2: "This video link looks invalid.",
  5: "This video can't be played here.",
  100: "This video was removed or made private.",
  101: "The creator doesn't allow this video to play inside other apps.",
  150: "The creator doesn't allow this video to play inside other apps.",
};

/** Inline 9:16 Shorts player. Muted by default; `autoplay` only plays muted. */
export function ShortPlayer({ demo, autoplay = false, className }: { demo: Demo; autoplay?: boolean; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | { error: string }>("loading");

  useEffect(() => {
    if (!demo.videoId || !host.current) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    const target = document.createElement("div");
    host.current.appendChild(target);
    const timeout = setTimeout(() => !cancelled && setState((s) => (s === "loading" ? { error: "The video is taking too long to load." } : s)), 15000);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          videoId: demo.videoId!,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: autoplay ? 1 : 0, mute: 1, playsinline: 1, rel: 0, modestbranding: 1, loop: 1, playlist: demo.videoId!, origin: window.location.origin },
          events: {
            onReady: (e) => {
              e.target.mute?.();
              if (!cancelled) setState("ready");
            },
            onError: (e) => !cancelled && setState({ error: ERROR_TEXT[e.data] ?? "The video couldn't be played." }),
          },
        });
      })
      .catch(() => !cancelled && setState({ error: "YouTube couldn't be reached. Check your connection." }));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      player?.destroy();
      target.remove();
    };
  }, [demo.videoId, autoplay]);

  if (!demo.videoId) {
    return (
      <div className={cx("grid aspect-[9/16] w-full place-items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-6 text-center", className)}>
        <VideoOff className="size-7 text-muted" />
        <p className="font-semibold">Demo coming soon</p>
        <p className="text-xs text-muted">No suitable Short yet — follow the cues meanwhile.</p>
      </div>
    );
  }
  const failed = typeof state === "object";
  return (
    <div className={cx("relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black", className)}>
      <div ref={host} className={failed ? "hidden" : "absolute inset-0 [&>iframe]:size-full"} />
      {state === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          <Loader2 className="size-7 animate-spin" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center gap-3 p-6 text-center text-white">
          <PlayCircle className="size-8 opacity-70" />
          <p className="text-sm">{state.error}</p>
          {demo.videoUrl && (
            <a href={demo.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black">
              Watch on YouTube <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Pop-up demo with the cues underneath. Accepts a catalog exercise or any `Demo`. */
export function DemoModal({ exercise, demo, onClose }: { exercise?: CatalogExercise | null; demo?: Demo | null; onClose: () => void }) {
  const d = demo ?? (exercise ? demoFromCatalog(exercise) : null);
  return (
    <Sheet open={!!d} onClose={onClose} title={d?.title ?? "Demo"} description={d?.creator ? `Demo by ${d.creator} · starts muted` : undefined}>
      {d && (
        <div key={d.videoId ?? d.title} className="space-y-4 pb-2">
          <ShortPlayer demo={d} autoplay className="mx-auto max-h-[62vh] max-w-[330px]" />
          {(d.instructions || d.videoTitle) && (
            <div className="rounded-xl bg-surface-2 p-4 text-sm">
              {d.instructions && (
                <>
                  <p className="font-semibold">How to do it</p>
                  <p className="mt-1 text-ink-2">{d.instructions}</p>
                </>
              )}
              {d.videoTitle && (
                <p className={cx("text-xs text-muted", d.instructions && "mt-3")}>
                  Video: “{d.videoTitle}” — {d.creator}.{" "}
                  {d.videoUrl && (
                    <a href={d.videoUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      Open on YouTube
                    </a>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
