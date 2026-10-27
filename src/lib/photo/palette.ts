"use client";

import { useEffect, useState } from "react";

export type Rgb = [number, number, number];

/** Three colours taken from a photo: its left side, right side and most vivid tone. */
export type PhotoPalette = { left: Rgb; right: Rgb; vivid: Rgb };

function toHsl([r, g, b]: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Nudges a colour towards a pleasant, saturated mid-tone so it reads well as a soft backdrop. */
export function enrich(c: Rgb, boost = 1.35): Rgb {
  const avg = (c[0] + c[1] + c[2]) / 3;
  const out = c.map((v) => avg + (v - avg) * boost) as Rgb;
  // Keep it away from near-black and near-white.
  const { l } = toHsl(c);
  const shift = l < 0.3 ? 40 : l > 0.85 ? -30 : 0;
  return out.map((v) => Math.round(Math.min(245, Math.max(20, v + shift)))) as Rgb;
}

/** Pure part: picks the palette from raw RGBA pixels of a small, square image. */
export function paletteFromPixels(px: Uint8ClampedArray, size: number): PhotoPalette {
  const sum = () => ({ r: 0, g: 0, b: 0, n: 0 });
  const left = sum(), right = sum();
  let vivid: Rgb = [0, 0, 0];
  let vividScore = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (px[i + 3] < 128) continue;
      const c: Rgb = [px[i], px[i + 1], px[i + 2]];
      const bucket = x < size / 2 ? left : right;
      bucket.r += c[0]; bucket.g += c[1]; bucket.b += c[2]; bucket.n++;
      const { s, l } = toHsl(c);
      const score = s * (1 - Math.abs(l - 0.55) * 1.6);
      if (score > vividScore) { vividScore = score; vivid = c; }
    }
  }
  const avg = (b: typeof left): Rgb => (b.n ? [b.r / b.n, b.g / b.n, b.b / b.n].map(Math.round) as Rgb : [180, 170, 160]);
  return { left: enrich(avg(left), 1.8), right: enrich(avg(right), 1.8), vivid: enrich(vivid, 1.1) };
}

export const rgb = (c: Rgb, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

/** Reads a palette from an image URL. Returns null until loaded, or if the image can't be read. */
export function usePhotoPalette(url: string | null): PhotoPalette | null {
  const [state, setState] = useState<{ url: string; palette: PhotoPalette } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const palette = paletteFromPixels(ctx.getImageData(0, 0, size, size).data, size);
        if (alive) setState({ url, palette });
      } catch {
        // Image not readable (no CORS): fall back to theme colours.
      }
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return url && state?.url === url ? state.palette : null;
}
