"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useOffline } from "@/lib/offline/client";

export default function ItemImage({ imageId, itemName }: { imageId: string; itemName: string }) {
  const offline = useOffline();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const url = `/api/item-images/${imageId}`;
  useEffect(() => { setFailed(false); setOpen(false); }, [imageId, offline.connected]);
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);
  function close() { setOpen(false); triggerRef.current?.focus(); }

  if (failed || !offline.connected) return <span className="spl-image-placeholder" role="img" aria-label={`Image for ${itemName} unavailable offline`}>Photo<br />unavailable</span>;
  return (
    <>
      <button ref={triggerRef} type="button" className="spl-image-thumb" aria-label={`View image for ${itemName}`} onClick={() => setOpen(true)}>
        <Image unoptimized src={url} alt={`Image of ${itemName}`} width={48} height={48} onError={() => setFailed(true)} />
      </button>
      <dialog ref={dialogRef} className="spl-image-viewer" aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}
        onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        {open && <div className="spl-image-viewer-content">
          <div className="spl-sheet-header">
            <h2 id={titleId} className="spl-sheet-title">{itemName}</h2>
            <button autoFocus type="button" className="spl-icon-btn" aria-label="Close image" onClick={close}>×</button>
          </div>
          <Image unoptimized className="spl-image-large" src={url} alt={`Image of ${itemName}`} width={1200} height={1200} />
        </div>}
      </dialog>
    </>
  );
}
