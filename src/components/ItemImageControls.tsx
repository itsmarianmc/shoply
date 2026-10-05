"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteImageAction } from "@/app/admin/images/actions";
import { IMAGE_QUOTA_MESSAGE, MAX_IMAGE_BYTES, type ImageStorageUsage } from "@/lib/image-policy";

interface Props {
  itemId: number;
  imageId: string | null;
  isAdmin: boolean;
  usage: ImageStorageUsage;
  onImageChange: (id: string | null) => void;
}

export default function ItemImageControls({ itemId, imageId, isAdmin, usage, onImageChange }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState(usage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => { setStorage(usage); }, [usage]);
  const full = storage.usedBytes >= storage.limitBytes;

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) { setError("Choose an image of 10 MB or smaller."); return; }
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("itemId", String(itemId));
        data.set("image", file);
        const response = await fetch("/api/item-images", { method: "POST", body: data });
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Could not upload the image.");
          router.refresh();
          return;
        }
        onImageChange(result.imageId);
        setStorage(result.usage);
        router.refresh();
      } catch { setError("Could not upload the image. Please try again."); }
      finally { if (inputRef.current) inputRef.current.value = ""; }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteImageAction(imageId!);
        if (result.error) { setError(result.error); return; }
        onImageChange(null);
        router.refresh();
      } catch { setError("Could not remove the image. Please try again."); }
    });
  }

  return (
    <div className="spl-detail-label">
      <span className="spl-detail-label-text">Image</span>
      <div className="spl-image-actions">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={pending || full}
          aria-label={imageId ? "Replace image" : "Upload image"} onChange={(event) => upload(event.target.files?.[0])} />
        <button type="button" className="spl-btn spl-btn-secondary spl-btn-sm" disabled={pending || full} onClick={() => inputRef.current?.click()}>
          {pending ? "Saving…" : imageId ? "Replace image" : "Upload image"}
        </button>
        {isAdmin && imageId && <button type="button" className="spl-btn spl-btn-danger spl-btn-sm" disabled={pending} onClick={remove}>Remove image</button>}
      </div>
      <span className="spl-row-sub">JPEG, PNG or WebP · up to 10 MB. Removed when shopping is finished.</span>
      {full && <span className="spl-error" role="status">{IMAGE_QUOTA_MESSAGE}</span>}
      {error && <span className="spl-error" role="alert">{error}</span>}
    </div>
  );
}
