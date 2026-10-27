"use client";

import { useId, type CSSProperties } from "react";
import { cx } from "@/components/ui";

/**
 * Brand mark: a lifter on a graphite tile who dips, presses the barbell overhead (straining,
 * teeth gritted), drops it — dust flies and the tile jolts — then picks it up again.
 * Everything is CSS (`.lifter-*` in globals.css) and stops under "reduce motion".
 * One cycle lasts LIFT_CYCLE_MS; the bar lands LIFT_DROP_MS into it.
 * `startAt` starts the cycle part-way through (used to replay the drop when the logo is clicked).
 */
export const LIFT_CYCLE_MS = 5000;
export const LIFT_DROP_MS = 2050;

const SKIN = "#ffc94a";
const INK = "#16120e";
const EMBER = "#ff6a1a";

export function LiftLogo({ size = 32, className, still = false, startAt = 0 }: { size?: number; className?: string; still?: boolean; startAt?: number }) {
  const uid = useId().replace(/:/g, "");
  const bg = `lifter-bg-${uid}`;
  const glow = `lifter-glow-${uid}`;
  const steel = `lifter-steel-${uid}`;
  return (
    <span
      className={cx("lifter relative inline-grid shrink-0 place-items-center overflow-hidden", still && "lifter-still", className)}
      style={{ width: size, height: size, borderRadius: size * 0.28, ["--lift-delay" as string]: `${-startAt}ms` } as CSSProperties}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="size-full">
        <defs>
          <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34343a" />
            <stop offset="1" stopColor="#0c0c0f" />
          </linearGradient>
          <radialGradient id={glow} cx="0.5" cy="1" r="0.75">
            <stop offset="0" stopColor={EMBER} stopOpacity="0.55" />
            <stop offset="0.55" stopColor={EMBER} stopOpacity="0.08" />
            <stop offset="1" stopColor={EMBER} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={steel} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f6f8" />
            <stop offset="1" stopColor="#9aa3ad" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" fill={`url(#${bg})`} />
        <rect width="64" height="64" fill={`url(#${glow})`} />
        <rect className="lifter-flash" x="0" y="44" width="64" height="20" fill={`url(#${glow})`} opacity="0" />
        <rect x="0.5" y="0.5" width="63" height="63" rx="17.5" fill="none" stroke="#fff" strokeOpacity="0.08" />

        <g className="lifter-scene">
          <ellipse className="lifter-shadow" cx="32" cy="61.6" rx="15" ry="1.6" fill="#000" opacity="0.45" />

          <g className="lifter-body">
            {/* legs + shoes */}
            <rect x="24.6" y="55" width="5.4" height="6.2" rx="1.6" fill="#24242a" />
            <rect x="34" y="55" width="5.4" height="6.2" rx="1.6" fill="#24242a" />
            <rect x="23.4" y="60" width="7" height="2" rx="1" fill={EMBER} />
            <rect x="33.6" y="60" width="7" height="2" rx="1" fill={EMBER} />
            {/* arms scale from the shoulders as the bar goes up */}
            <rect className="lifter-arm" x="19.6" y="18.5" width="5.2" height="29" rx="2.6" fill={SKIN} />
            <rect className="lifter-arm" x="39.2" y="18.5" width="5.2" height="29" rx="2.6" fill={SKIN} />
            {/* neck, shoulders, tank top */}
            <rect x="29.2" y="40.5" width="5.6" height="4" fill="#e5ac2e" />
            <circle cx="22.4" cy="46.4" r="3.6" fill={SKIN} />
            <circle cx="41.6" cy="46.4" r="3.6" fill={SKIN} />
            <path d="M22.6 45.2 Q23 43.6 25.6 43.6 L38.4 43.6 Q41 43.6 41.4 45.2 L39.4 56.6 Q32 58 24.6 56.6Z" fill="#141418" />
            <path d="M27.4 48.6 L36.6 48.6" stroke={EMBER} strokeWidth="1.5" strokeLinecap="round" />
            {/* head */}
            <g className="lifter-face">
              <circle cx="32" cy="34" r="9.6" fill={SKIN} />
              <path d="M22.7 33.4 Q21.8 23.4 32 23.2 Q42.2 23.4 41.3 33.4 Q39.6 27.9 32 28.2 Q24.4 27.9 22.7 33.4Z" fill={INK} />
              <path d="M23.4 36 Q24.4 43.9 32 44 Q39.6 43.9 40.6 36 Q37.4 40.8 32 40.9 Q26.6 40.8 23.4 36Z" fill="#5a3b1c" opacity="0.5" />
              <path d="M26.3 30.9 L30.5 32.1" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
              <path d="M37.7 30.9 L33.5 32.1" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
              <g className="lifter-eyes">
                <ellipse cx="28.6" cy="34" rx="1.25" ry="1.35" fill={INK} />
                <ellipse cx="35.4" cy="34" rx="1.25" ry="1.35" fill={INK} />
              </g>
              <path className="lifter-smirk" d="M29.4 38.6 Q32.4 40 35 38.2" stroke={INK} strokeWidth="1.4" strokeLinecap="round" fill="none" />
              <rect className="lifter-grit" x="28.8" y="37.6" width="6.4" height="2.4" rx="1" fill="#fff" stroke={INK} strokeWidth="0.8" opacity="0" />
              <path className="lifter-sweat" d="M42 29.5 q1.2 1.8 0 2.8 q-1.2 -1 0 -2.8Z" fill="#7cc4ff" opacity="0" />
            </g>
          </g>

          {/* dust kicked up when the bar lands */}
          <g className="lifter-dust" fill="#cfc6b8">
            <circle cx="9" cy="60" r="1.3" />
            <circle cx="12" cy="61" r="0.9" />
            <circle cx="6" cy="61" r="1" />
            <circle cx="55" cy="60" r="1.3" />
            <circle cx="52" cy="61" r="0.9" />
            <circle cx="58" cy="61" r="1" />
          </g>

          {/* barbell, resting at chest height */}
          <g transform="translate(0 45.5)">
            <g className="lifter-bar">
              <rect x="4.5" y="-1.4" width="55" height="2.8" rx="1.4" fill={`url(#${steel})`} />
              <rect x="5.6" y="-7.5" width="5.4" height="15" rx="1.7" fill="#0b0b0d" stroke={EMBER} strokeWidth="0.9" />
              <rect x="11" y="-5" width="3" height="10" rx="1.2" fill="#1d1d22" />
              <rect x="53" y="-7.5" width="5.4" height="15" rx="1.7" fill="#0b0b0d" stroke={EMBER} strokeWidth="0.9" />
              <rect x="50" y="-5" width="3" height="10" rx="1.2" fill="#1d1d22" />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
