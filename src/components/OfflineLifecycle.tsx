"use client";
import { useEffect, useState } from "react";
import { accountCookie, startOffline, useOffline } from "@/lib/offline/client";
import { cachePhotos } from "@/lib/offline/images";

export default function OfflineLifecycle() {
  const state = useOffline();
  const [photoError, setPhotoError] = useState("");
  useEffect(() => { startOffline(); }, []);
  useEffect(() => {
    const snapshot = state.account?.snapshot;
    if (!snapshot || !state.connected || state.locked) return;
    let alive = true;
    void cachePhotos(snapshot, () => alive && accountCookie() === snapshot.accountKey && navigator.onLine)
      .then(() => { if (alive) setPhotoError(""); })
      .catch(() => { if (alive) setPhotoError("Some photos could not be saved offline. Free device storage or reconnect; shopping changes are saved separately."); });
    return () => { alive = false; };
  }, [state.account?.snapshot, state.connected, state.locked]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let controlled = !!navigator.serviceWorker.controller;
    const changed = () => { if (controlled) location.reload(); else controlled = true; };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", changed);
  }, []);
  useEffect(() => {
    let active = true;
    const requested = new Set<string>();
    const update = () => {
      if (!active) return;
      const available = [...document.fonts].some(face => face.family.includes("Font Awesome") && face.status === "loaded");
      document.documentElement.dataset.localIcons = String(!state.connected || !available);
    };
    const loadOptionalFont = () => {
      if (!active) return;
      if (state.connected) for (const face of document.fonts) {
        if (!face.family.includes("Font Awesome") || requested.has(face.family)) continue;
        requested.add(face.family);
        const family = face.family.replace(/^["']|["']$/g, "");
        // The system fallback must not prevent the configured online font
        // from ever being requested. Failures simply retain local glyphs.
        void document.fonts.load(`900 12px ${JSON.stringify(family)}`, "\uf00c").then(update).catch(update);
      }
      update();
    };
    loadOptionalFont(); void document.fonts.ready.then(loadOptionalFont);
    document.addEventListener("load", loadOptionalFont, true);
    document.fonts.addEventListener("loadingdone", update);
    return () => { active = false; document.removeEventListener("load", loadOptionalFont, true); document.fonts.removeEventListener("loadingdone", update); };
  }, [state.connected]);
  return photoError && state.account ? <p className="spl-photo-status" role="status">{photoError}</p> : null;
}
