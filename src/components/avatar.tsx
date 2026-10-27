"use client";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRef } from "react";
import { cx, useToast } from "@/components/ui";
import { useAvatarUrl, useProfile, useUploadAvatar, useUser } from "@/lib/data/hooks";

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
export function AvatarUploader({ size = 112 }: { size?: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const toast = useToast();
  const { data: profile } = useProfile();

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file.");
    if (f.size > 5 * 1024 * 1024) return toast.error("Photos must be under 5 MB.");
    try {
      await upload.mutateAsync(f);
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
        className="group relative rounded-full outline-offset-4 transition-transform hover:scale-[1.03] active:scale-95"
        aria-label="Change profile photo"
      >
        <span className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-accent/70 via-accent/10 to-good/60 opacity-70 blur-[1px] transition-opacity group-hover:opacity-100" aria-hidden />
        <span className="relative block rounded-full bg-surface p-1">
          <Avatar size={size} />
        </span>
        <span className="absolute inset-1 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {upload.isPending ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
        </span>
        <span className="absolute right-1 bottom-1 grid size-9 place-items-center rounded-full border-2 border-surface bg-primary text-primary-ink shadow-pop">
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      <div className="flex items-center gap-3 text-xs">
        <button type="button" className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => fileRef.current?.click()}>
          {profile?.avatar_path ? "Change photo" : "Upload photo"}
        </button>
        {profile?.avatar_path && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted hover:text-accent"
            onClick={() => upload.mutateAsync(null).then(() => toast.success("Photo removed.")).catch(toast.error)}
          >
            <Trash2 className="size-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

export { ageOn as ageFrom } from "@/lib/domain/dates";
