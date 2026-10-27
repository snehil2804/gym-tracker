"use client";

import { Crop, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button, Chip, Sheet, cx, useToast } from "@/components/ui";
import { cropImage } from "@/lib/photo/crop";

type AspectKey = "original" | "3:4" | "4:5" | "1:1" | "16:9";
const ASPECTS: { key: AspectKey; label: string; value?: number }[] = [
  { key: "3:4", label: "3:4", value: 3 / 4 },
  { key: "4:5", label: "4:5", value: 4 / 5 },
  { key: "1:1", label: "Square", value: 1 },
  { key: "16:9", label: "16:9", value: 16 / 9 },
  { key: "original", label: "Original" },
];

/**
 * Crop & rotate a photo before upload. `round` gives a circular crop for profile pictures.
 * Returns a JPEG File through `onDone`.
 */
export function PhotoEditor({
  file,
  round,
  title = "Edit photo",
  maxSide = 3000,
  onCancel,
  onDone,
  busy,
  allowOriginal,
}: {
  file: File;
  round?: boolean;
  title?: string;
  maxSide?: number;
  onCancel: () => void;
  onDone: (file: File) => void | Promise<void>;
  busy?: boolean;
  /** Offer uploading the file untouched (full resolution). */
  allowOriginal?: boolean;
}) {
  const toast = useToast();
  // One object URL per mount; revoked on unmount (safe with React's double-mount in development).
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let live = true;
    queueMicrotask(() => live && setSrc(url));
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [turns, setTurns] = useState(0); // quarter turns
  const [tilt, setTilt] = useState(0); // fine straighten, degrees
  const [aspectKey, setAspectKey] = useState<AspectKey>(round ? "1:1" : "3:4");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const rotation = turns * 90 + tilt;
  const sideways = Math.abs(turns % 2) === 1;
  const originalAspect = natural ? (sideways ? natural.h / natural.w : natural.w / natural.h) : 3 / 4;
  const aspect = round ? 1 : (ASPECTS.find((a) => a.key === aspectKey)?.value ?? originalAspect);

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setTurns(0);
    setTilt(0);
    if (!round) setAspectKey("3:4");
  }

  async function save() {
    if (!area || !src) return;
    setSaving(true);
    try {
      const blob = await cropImage(src, area, rotation, maxSide);
      const name = file.name.replace(/\.[^.]+$/, "") || "photo";
      await onDone(new File([blob], `${name}-edited.jpg`, { type: "image/jpeg" }));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      wide
      onClose={() => (saving || busy ? undefined : onCancel())}
      title={title}
      description="Drag to position · pinch or use the slider to zoom"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={reset} disabled={saving || busy}>
            Reset
          </Button>
          <div className="flex gap-2">
            {allowOriginal ? (
              <Button variant="secondary" onClick={() => onDone(file)} disabled={saving || busy}>
                Use original
              </Button>
            ) : (
              <Button variant="ghost" onClick={onCancel} disabled={saving || busy}>
                Cancel
              </Button>
            )}
            <Button variant="primary" icon={<Crop className="size-4" />} loading={saving || busy} disabled={!area || failed} onClick={save}>
              Use photo
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className={cx("relative w-full overflow-hidden rounded-2xl bg-[#111]", round ? "h-[min(60vh,420px)]" : "h-[min(62vh,480px)]")}>
          {!src ? null : failed ? (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-white/80">
              This image format can&apos;t be edited in your browser. Try a JPG or PNG.
            </div>
          ) : (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={round ? "round" : "rect"}
              showGrid={!round}
              minZoom={1}
              maxZoom={5}
              zoomSpeed={0.25}
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, px) => setArea(px)}
              onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
              mediaProps={{ onError: () => setFailed(true) }}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Zoom</p>
            <div className="flex items-center gap-2">
              <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} aria-label="Zoom out">
                <ZoomOut className="size-4" />
              </button>
              <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[var(--ink)]" aria-label="Zoom" />
              <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2" onClick={() => setZoom((z) => Math.min(5, z + 0.25))} aria-label="Zoom in">
                <ZoomIn className="size-4" />
              </button>
            </div>
          </div>
          <div>
            <p className="mb-1.5 flex justify-between text-[13px] font-medium text-ink-2">
              Rotate <span className="num text-muted">{((rotation % 360) + 360) % 360}°</span>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-strong hover:bg-surface-2" onClick={() => setTurns((t) => t - 1)} aria-label="Rotate left 90 degrees">
                <RotateCcw className="size-4" />
              </button>
              <input type="range" min={-45} max={45} step={0.5} value={tilt} onChange={(e) => setTilt(Number(e.target.value))} className="w-full accent-[var(--ink)]" aria-label="Straighten" />
              <button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-strong hover:bg-surface-2" onClick={() => setTurns((t) => t + 1)} aria-label="Rotate right 90 degrees">
                <RotateCw className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {!round && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Shape</p>
            <div className="flex flex-wrap gap-2">
              {ASPECTS.map((a) => (
                <Chip key={a.key} selected={aspectKey === a.key} onClick={() => setAspectKey(a.key)}>
                  {a.label}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
