// Browser-only helpers to apply a crop + rotation to an image file with <canvas>.

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image format can't be opened here. Try a JPG or PNG."));
    img.src = src;
  });
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Size of the bounding box of a w×h rectangle rotated by `rotation` degrees. */
export function rotatedSize(width: number, height: number, rotation: number) {
  const r = rad(rotation);
  return {
    width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
    height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
  };
}

/** Largest side, in pixels, that a crop is scaled down to (keeps uploads reasonable). */
export function fitWithin(area: { width: number; height: number }, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(area.width, area.height));
  return { width: Math.max(1, Math.round(area.width * scale)), height: Math.max(1, Math.round(area.height * scale)), scale };
}

/**
 * Renders `pixelCrop` (expressed in the rotated image's coordinates, as react-easy-crop reports it)
 * into a JPEG blob, scaled so the longest side is at most `maxSide`.
 */
export async function cropImage(src: string, pixelCrop: PixelArea, rotation: number, maxSide: number, quality = 0.9): Promise<Blob> {
  const image = await loadImage(src);
  const box = rotatedSize(image.naturalWidth, image.naturalHeight, rotation);

  // 1. Draw the whole image rotated into a canvas the size of its bounding box.
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = Math.round(box.width);
  rotatedCanvas.height = Math.round(box.height);
  const rctx = rotatedCanvas.getContext("2d");
  if (!rctx) throw new Error("Your browser couldn't process this photo.");
  rctx.translate(box.width / 2, box.height / 2);
  rctx.rotate(rad(rotation));
  rctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  // 2. Copy the crop out of it, scaled down if needed.
  const out = fitWithin(pixelCrop, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this photo.");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(rotatedCanvas, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, out.width, out.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't save the edited photo."))), "image/jpeg", quality),
  );
}
