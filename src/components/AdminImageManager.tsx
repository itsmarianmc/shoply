"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteImageAction, updateImageQuotaAction } from "@/app/admin/images/actions";
import { formatImageBytes, type ImageStorageUsage, type StoredImage } from "@/lib/image-policy";
import ItemImage from "./ItemImage";

export default function AdminImageManager({ usage, images }: { usage: ImageStorageUsage; images: StoredImage[] }) {
  const router = useRouter();
  const [limitMb, setLimitMb] = useState(usage.limitBytes / 1_000_000);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => { setLimitMb(usage.limitBytes / 1_000_000); }, [usage.limitBytes]);
  function mutate(operation: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if (result.error) setError(result.error);
        router.refresh();
      } catch { setError("Could not save changes. Please try again."); }
    });
  }
  return (
    <>
      <section className="spl-card">
        <div className="spl-card-header"><h1 className="spl-card-title">Image storage</h1></div>
        <div className="spl-image-storage">
          <p role="status">{formatImageBytes(usage.usedBytes)} used of {formatImageBytes(usage.limitBytes)} · {usage.fileCount} {usage.fileCount === 1 ? "image" : "images"}</p>
          <progress className="spl-storage-progress" max={usage.limitBytes} value={Math.min(usage.usedBytes, usage.limitBytes)} aria-label="Image storage used" />
          <label className="spl-detail-label" htmlFor="image-quota">Storage limit: {formatImageBytes(limitMb * 1_000_000)}</label>
          <input id="image-quota" className="spl-quota-slider" type="range" min={100} max={10000} step={100} value={limitMb}
            aria-valuetext={formatImageBytes(limitMb * 1_000_000)} disabled={pending} onChange={(event) => setLimitMb(Number(event.target.value))} />
          <div className="spl-quota-labels"><span>100 MB</span><span>10 GB</span></div>
          <button type="button" className="spl-btn spl-btn-primary spl-btn-sm" disabled={pending || limitMb * 1_000_000 === usage.limitBytes}
            onClick={() => mutate(() => updateImageQuotaAction(limitMb * 1_000_000))}>Save storage limit</button>
          <p className="spl-row-sub">Images stay on this server until shopping is finished. Existing images are kept when the limit is reduced; uploads pause until space is available.</p>
          {error && <div role="alert" className="spl-error">{error}</div>}
        </div>
      </section>
      <section className="spl-card">
        <div className="spl-card-header"><h2 className="spl-card-title">Images</h2><span className="spl-card-count">{images.length}</span></div>
        {images.length === 0 ? <div className="spl-list-empty">No images stored.</div> : <div className="spl-list">
          {images.map((image) => <div key={image.id} className="spl-row">
            <ItemImage imageId={image.id} itemName={image.itemName} />
            <div className="spl-row-body"><span className="spl-row-label">{image.itemName}</span><span className="spl-row-sub">{formatImageBytes(image.sizeBytes)}{image.pendingDeletion ? " · Cleanup pending; will retry automatically" : ""}</span></div>
            <button type="button" className="spl-btn spl-btn-danger spl-btn-sm" disabled={pending} aria-label={`Delete image for ${image.itemName}`} onClick={() => mutate(() => deleteImageAction(image.id))}>Delete</button>
          </div>)}
        </div>}
      </section>
    </>
  );
}
