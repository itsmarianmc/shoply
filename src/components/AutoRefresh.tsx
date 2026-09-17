"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getRevisionAction } from "@/app/list/actions";

const POLL_INTERVAL_MS = 5000;


export default function AutoRefresh() {
  const router = useRouter();
  const lastRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      let revision: number | null = null;
      try {
        revision = await getRevisionAction();
      } catch {
        return;
      }
      if (cancelled) return;

      if (lastRevisionRef.current === null) {
        lastRevisionRef.current = revision;
        return;
      }
      if (revision !== lastRevisionRef.current) {
        lastRevisionRef.current = revision;
        router.refresh();
      }
    }

    function schedule() {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await poll();
        }
        if (!cancelled) schedule();
      }, POLL_INTERVAL_MS);
    }

    poll().then(() => {
      if (!cancelled) schedule();
    });

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
