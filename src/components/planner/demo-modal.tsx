"use client";

import { ExternalLink, Loader2, PlayCircle, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui";
import type { CatalogExercise } from "@/lib/domain/planner";

/*
  Plays an exercise's YouTube Shorts demo in a modal with YouTube's official IFrame Player API,
  so the user never leaves the Workouts page. Videos that can't be embedded (error 101/150),
  were removed (100) or fail to load fall back to a "Watch on YouTube" link.
*/

type YTPlayer = { destroy: () => void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void; onError?: (e: { data: number }) => void };
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

export function DemoModal({ exercise, onClose }: { exercise: CatalogExercise | null; onClose: () => void }) {
  return (
    <Sheet open={!!exercise} onClose={onClose} title={exercise?.name ?? "Demo"} description={exercise?.video_creator ? `Demo by ${exercise.video_creator}` : undefined}>
      {exercise && <DemoBody key={exercise.id} exercise={exercise} />}
    </Sheet>
  );
}

function DemoBody({ exercise }: { exercise: CatalogExercise }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | { error: string }>(exercise.video_id ? "loading" : { error: "pending" });

  useEffect(() => {
    if (!exercise.video_id || !host.current) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    const target = document.createElement("div");
    host.current.appendChild(target);
    const timeout = setTimeout(() => !cancelled && setState((s) => (s === "loading" ? { error: "The video is taking too long to load." } : s)), 15000);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          videoId: exercise.video_id!,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
          events: {
            onReady: () => !cancelled && setState("ready"),
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
  }, [exercise.video_id]);

  const failed = typeof state === "object";
  return (
    <div className="space-y-4 pb-2">
      {exercise.video_status === "pending" ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center">
          <VideoOff className="size-7 text-muted" />
          <p className="font-semibold">Demo coming soon</p>
          <p className="max-w-xs text-sm text-muted">Neither DeltaBolic nor TylerPath has a Short for this exercise yet, so it&apos;s marked pending. Use the cues below meanwhile.</p>
        </div>
      ) : (
        <div className="relative mx-auto aspect-[9/16] max-h-[65vh] w-full max-w-[340px] overflow-hidden rounded-2xl bg-black">
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
              {exercise.video_url && (
                <a href={exercise.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black">
                  Watch on YouTube <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl bg-surface-2 p-4 text-sm">
        <p className="font-semibold">How to do it</p>
        <p className="mt-1 text-ink-2">{exercise.instructions}</p>
        {exercise.video_title && (
          <p className="mt-3 text-xs text-muted">
            Video: “{exercise.video_title}” — {exercise.video_creator}.{" "}
            {exercise.video_url && (
              <a href={exercise.video_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                Open on YouTube
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
