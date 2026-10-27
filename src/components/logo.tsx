"use client";

import { useId } from "react";
import { cx } from "@/components/ui";

/**
 * Brand mark: a little lifter who presses the barbell overhead, drops it and picks it up again.
 * The whole cycle is CSS (see `.lifter-*` in globals.css), so it costs nothing at runtime and is
 * frozen for people who prefer reduced motion. One cycle lasts LIFT_CYCLE_MS; the bar hits the
 * floor at LIFT_DROP_MS into it (used to time the page "quake" after sign-in).
 */
export const LIFT_CYCLE_MS = 5000;
export const LIFT_DROP_MS = 2050;

export function LiftLogo({ size = 32, className, still = false }: { size?: number; className?: string; still?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const bg = `lifter-bg-${uid}`;
  const shine = `lifter-shine-${uid}`;
  return (
    <span
      className={cx("lifter relative inline-grid shrink-0 place-items-center overflow-hidden", still && "lifter-still", className)}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="size-full">
        <defs>
          <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff7a45" />
            <stop offset="0.55" stopColor="#f2456b" />
            <stop offset="1" stopColor="#7a5cff" />
          </linearGradient>
          <radialGradient id={shine} cx="0.3" cy="0.15" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" fill={`url(#${bg})`} />
        <rect width="64" height="64" fill={`url(#${shine})`} />
        {/* floor shadow */}
        <ellipse className="lifter-shadow" cx="32" cy="61" rx="13" ry="1.8" fill="#000" opacity="0.18" />

        <g className="lifter-body">
          {/* legs */}
          <rect x="25.5" y="53" width="4.6" height="8" rx="2.3" fill="#2b1f3a" />
          <rect x="33.9" y="53" width="4.6" height="8" rx="2.3" fill="#2b1f3a" />
          {/* arms (scale from the shoulders as the bar goes up) */}
          <rect className="lifter-arm" x="20.6" y="18.5" width="4" height="29" rx="2" fill="#ffd25a" />
          <rect className="lifter-arm" x="39.4" y="18.5" width="4" height="29" rx="2" fill="#ffd25a" />
          {/* shirt */}
          <rect x="22.5" y="44" width="19" height="12.5" rx="6" fill="#fff" />
          <rect x="22.5" y="50" width="19" height="2.4" fill="#2b1f3a" opacity="0.12" />
          {/* head */}
          <circle cx="32" cy="34.5" r="9.5" fill="#ffd25a" />
          <circle cx="26.6" cy="37.4" r="1.7" fill="#ff7a6b" opacity="0.65" />
          <circle cx="37.4" cy="37.4" r="1.7" fill="#ff7a6b" opacity="0.65" />
          <g className="lifter-eyes">
            <circle cx="28.8" cy="33.4" r="1.45" fill="#2b1f3a" />
            <circle cx="35.2" cy="33.4" r="1.45" fill="#2b1f3a" />
          </g>
          <path className="lifter-mouth" d="M29.2 37.6 Q32 40.4 34.8 37.6" stroke="#2b1f3a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {/* headband */}
          <rect x="22.8" y="27.4" width="18.4" height="2.6" rx="1.3" fill="#f2456b" />
        </g>

        {/* barbell, resting at chest height */}
        <g transform="translate(0 45.5)">
          <g className="lifter-bar">
            <rect x="7" y="-1.3" width="50" height="2.6" rx="1.3" fill="#fff" />
            <rect x="8.5" y="-6.5" width="4.4" height="13" rx="1.6" fill="#2b1f3a" />
            <rect x="12.9" y="-4.6" width="3" height="9.2" rx="1.2" fill="#2b1f3a" opacity="0.85" />
            <rect x="51.1" y="-6.5" width="4.4" height="13" rx="1.6" fill="#2b1f3a" />
            <rect x="48.1" y="-4.6" width="3" height="9.2" rx="1.2" fill="#2b1f3a" opacity="0.85" />
          </g>
        </g>
      </svg>
    </span>
  );
}
