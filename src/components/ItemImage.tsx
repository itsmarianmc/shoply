"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { accountCookie, useOffline } from "@/lib/offline/client";
import { privateImage } from "@/lib/offline/images";

export default function ItemImage({ imageId, itemName }: { imageId: string; itemName: string }) {
  const offline = useOffline();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<{ key: string; id: string; url: string }>();
  const key = offline.account?.snapshot.accountKey;
  const url = key && accountCookie() === key && photo?.key === key && photo.id === imageId ? photo.url : undefined;
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setFailed(false); setOpen(false);
    const update = async () => {
      if (!key) return;
      const current = () => alive && accountCookie() === key;
      try {
        const blob = await privateImage(key, imageId, current, offline.connected);
        if (!current() || !blob) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        setPhoto({ key, id: imageId, url: objectUrl }); setFailed(false);
      } catch { /* Optional photos cannot prevent shopping or local saves. */ }
    };
    void update(); window.addEventListener("shoply-photos", update);
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); window.removeEventListener("shoply-photos", update); };
  }, [imageId, key, offline.connected]);
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);
  function close() { setOpen(false); triggerRef.current?.focus(); }

  if (failed || !url) return <span className="spl-image-placeholder" role="img" aria-label={`Image for ${itemName} unavailable${offline.connected ? "" : " offline"}`}>Photo<br />unavailable</span>;
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
            <button autoFocus type="button" className="spl-icon-btn" aria-label="Close image" onClick={close}><i className="fa-solid fa-x" aria-hidden="true" /></button>
          </div>
          <Image unoptimized className="spl-image-large" src={url} alt={`Image of ${itemName}`} width={1200} height={1200} />
        </div>}
      </dialog>
    </>
  );
}
