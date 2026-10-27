"use client";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { PhotoEditor } from "@/components/photo-editor";
import { cx, useToast } from "@/components/ui";
import { rgb, type PhotoPalette } from "@/lib/photo/palette";
import { MAX_PHOTO_BYTES, useAvatarUrl, useProfile, useUploadAvatar, useUser } from "@/lib/data/hooks";

export function initials(name: string | null | undefined, email?: string | null) {
  const src = (name ?? "").trim() || (email ?? "").split("@")[0];
  const parts = src.split(/[\s._-]+/).filter((p) => /[a-z]/i.test(p));
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

/** Round profile picture; falls back to coloured initials. */
export function Avatar({ size = 40, className }: { size?: number; className?: string }) {
  const url = useAvatarUrl();
  const { data: profile } = useProfile();
  const { data: user } = useUser();
  return (
    <span
      className={cx("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary font-display font-semibold text-primary-ink", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(profile?.display_name, user?.email)
      )}
    </span>
  );
}

/** Large interactive avatar: tap to upload, with a remove button once a photo is set. */
export function AvatarUploader({ size = 112, palette }: { size?: number; palette?: PhotoPalette | null }) {
  const ring = size >= 160 ? 5 : 4;
  const gap = size >= 160 ? 5 : 4;
  const outer = size + 2 * (ring + gap);
  const badge = size >= 160 ? 44 : 36;
  // Badge centred on the ring at the 4:30 position.
  const badgeAt = outer / 2 + (outer / 2) * Math.SQRT1_2 - badge / 2 - ring / 2;
  const ringA = palette ? rgb(palette.left) : "var(--accent)";
  const ringB = palette ? rgb(palette.right) : "var(--good)";
  const ringV = palette ? rgb(palette.vivid) : "var(--info)";
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const toast = useToast();
  const { data: profile } = useProfile();

  const [editing, setEditing] = useState<File | null>(null);

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file.");
    if (f.size > MAX_PHOTO_BYTES) return toast.error("Photos must be under 40 MB.");
    setEditing(f); // crop & rotate first
  }

  async function save(f: File) {
    try {
      await upload.mutateAsync(f);
      setEditing(null);
      toast.success("Profile photo updated.");
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative shrink-0 rounded-full outline-offset-4 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
        style={{ width: outer, height: outer }}
        aria-label="Change profile photo"
      >
        {/* Soft glow in the photo's own colours. */}
        <span
          aria-hidden
          className="absolute inset-[6%] rounded-full opacity-70 blur-2xl transition-opacity group-hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${ringA}, ${ringB})` }}
        />
        {/* Even ring: gradient band, then a clean gap, then the photo — all concentric. */}
        <span
          className="absolute inset-0 rounded-full"
          style={{ padding: ring, background: `conic-gradient(from 210deg, ${ringA}, ${ringV}, ${ringB}, ${ringA})` }}
        >
          <span className="block size-full rounded-full bg-surface" style={{ padding: gap }}>
            <Avatar size={size} />
          </span>
        </span>
        <span
          className="absolute grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ inset: ring + gap }}
        >
          {upload.isPending ? <Loader2 className="size-7 animate-spin" /> : <Camera className="size-7" />}
        </span>
        <span
          className="absolute grid place-items-center rounded-full border-[3px] border-surface bg-primary text-primary-ink shadow-pop"
          style={{ width: badge, height: badge, left: badgeAt, top: badgeAt }}
        >
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }} />
      {editing && (
        <PhotoEditor file={editing} round title="Profile photo" maxSide={1024} busy={upload.isPending} onCancel={() => setEditing(null)} onDone={save} />
      )}
      <div className="flex items-center gap-4 text-[13px]">
        <button type="button" className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => fileRef.current?.click()}>
          {profile?.avatar_path ? "Change photo" : "Upload photo"}
        </button>
        {profile?.avatar_path && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted hover:text-accent"
            onClick={() => upload.mutateAsync(null).then(() => toast.success("Photo removed.")).catch(toast.error)}
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

export { ageOn as ageFrom } from "@/lib/domain/dates";
