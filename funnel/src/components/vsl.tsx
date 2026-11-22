import * as React from "react";
import { Volume2 } from "lucide-react";

import { sendEvent, type FunnelEvent } from "@/lib/funnel";
import { trackPixelCustom } from "@/lib/pixel";

const VSL_MILESTONES = [25, 50, 75, 95] as const;

/**
 * Daniel's video. It plays silently on a loop until they tap it, then starts
 * again from the top with sound and controls.
 *
 * /sprint reports plays and how far people watch (vsl_play, vsl_25...), which
 * is how that page's video is judged. Other pages pass `report={false}` so
 * their plays don't land in /sprint's numbers, and count their own with
 * `onPlay`.
 */
export function Vsl({
  src,
  poster,
  captions,
  report = true,
  onPlay,
}: {
  src: string;
  poster: string;
  captions: string;
  report?: boolean;
  onPlay?: () => void;
}) {
  const video = React.useRef<HTMLVideoElement>(null);
  const [withSound, setWithSound] = React.useState(false);
  const reported = React.useRef(new Set<number>());

  React.useEffect(() => {
    const element = video.current;
    if (!element) return;
    // Browsers only autoplay muted video, and iOS wants the attribute itself.
    element.muted = true;
    element.setAttribute("muted", "");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) element.play().catch(() => {});
  }, []);

  const playWithSound = () => {
    const element = video.current;
    if (!element) return;
    element.muted = false;
    element.currentTime = 0;
    element.controls = true;
    element.play().catch(() => {});
    setWithSound(true);
    onPlay?.();
    if (!report) return;
    sendEvent("vsl_play");
    trackPixelCustom("VSLPlay");
  };

  const onTimeUpdate = () => {
    const element = video.current;
    if (!report || !element || !withSound || !element.duration) return;
    const percent = (element.currentTime / element.duration) * 100;
    for (const milestone of VSL_MILESTONES) {
      if (percent >= milestone && !reported.current.has(milestone)) {
        reported.current.add(milestone);
        sendEvent(`vsl_${milestone}` as FunnelEvent);
        if (milestone === 50) trackPixelCustom("VSL50");
      }
    }
  };

  return (
    <div className="relative aspect-video overflow-hidden rounded-md bg-black">
      <video
        ref={video}
        playsInline
        loop={!withSound}
        preload="metadata"
        poster={poster || undefined}
        onTimeUpdate={onTimeUpdate}
        className="h-full w-full object-cover"
      >
        <source src={src} type="video/mp4" />
        {captions ? <track kind="captions" src={captions} srcLang="en" label="English" default /> : null}
      </video>
      {withSound ? null : (
        <button
          type="button"
          onClick={playWithSound}
          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/25"
        >
          <span className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg">
            <Volume2 className="h-5 w-5" aria-hidden="true" /> Tap to watch with sound
          </span>
        </button>
      )}
    </div>
  );
}
