"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

const MINIMUM_REFRESH_DURATION_MS = 1750;

interface PullToRefreshOptions {
  threshold?: number;
}

function setupPullToRefresh(
  indicator: HTMLElement,
  { threshold = 96 }: PullToRefreshOptions = {},
  onRefresh: () => Promise<void>
): () => void {
  let gesture: {
    startY: number;
    distance: number;
    recognized: boolean;
  } | null = null;
  let refreshing = false;

  const pageIsAtTop = () =>
    (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  const resetIndicator = () => {
    indicator.classList.remove("is-pulling", "is-ready", "is-refreshing");
    indicator.style.height = "0px";
  };

  const onTouchStart = (event: TouchEvent) => {
    if (refreshing || event.touches.length !== 1 || !pageIsAtTop()) return;

    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        '.spl-overlay, input, textarea, select, button, a, [contenteditable="true"]'
      )
    ) {
      return;
    }

    gesture = {
      startY: event.touches[0]!.clientY,
      distance: 0,
      recognized: false,
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 1) return;

    const distance = event.touches[0]!.clientY - gesture.startY;
    if (distance <= 0) {
      gesture = null;
      resetIndicator();
      return;
    }

    if (distance < 12) return;

    gesture.recognized = true;
    gesture.distance = distance;

    if (event.cancelable) event.preventDefault();

    const visibleDistance = Math.min(72, distance * 0.55);
    indicator.classList.add("is-pulling");
    indicator.style.height = `${visibleDistance}px`;
    indicator.classList.toggle("is-ready", distance >= threshold);
  };

  const onTouchEnd = async () => {
    const currentGesture = gesture;
    gesture = null;

    if (
      !currentGesture?.recognized ||
      currentGesture.distance < threshold
    ) {
      resetIndicator();
      return;
    }

    refreshing = true;
    const refreshStartedAt = Date.now();
    indicator.classList.remove("is-pulling", "is-ready");
    indicator.classList.add("is-refreshing");
    indicator.style.height = "56px";

    try {
      await onRefresh();
    } catch (error) {
      console.error("Pull-to-Refresh failed:", error);
    } finally {
      const elapsed = Date.now() - refreshStartedAt;
      const remaining = Math.max(
        0,
        MINIMUM_REFRESH_DURATION_MS - elapsed
      );
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
      refreshing = false;
      resetIndicator();
    }
  };

  const onTouchCancel = () => {
    gesture = null;
    resetIndicator();
  };

  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return () => {
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("touchcancel", onTouchCancel);
    resetIndicator();
  };
}

export default function PullToRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const refreshResolverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isPending) {
      refreshResolverRef.current?.();
      refreshResolverRef.current = null;
    }
  }, [isPending]);

  useEffect(() => {
    return () => {
      refreshResolverRef.current?.();
      refreshResolverRef.current = null;
    };
  }, []);

  const refreshPage = useCallback(() => {
    return new Promise<void>((resolve) => {
      refreshResolverRef.current = resolve;
      startTransition(() => router.refresh());
    });
  }, [router, startTransition]);

  useEffect(() => {
    const indicator = document.querySelector<HTMLElement>(
      "#pull-refresh-indicator"
    );
    if (!indicator) return;

    return setupPullToRefresh(indicator, undefined, refreshPage);
  }, [refreshPage]);

  return (
    <div
      id="pull-refresh-indicator"
      className="pull-refresh-indicator"
      role="status"
      aria-label="Ladeindikator"
    >
      <div className="r-spinner" aria-hidden="true">
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
        <div className="r-spinner-blade" />
      </div>
      <span className="ptr-actions" aria-hidden="true">
        <span className="pulling">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24"
            viewBox="0 -960 960 960"
            width="24"
            fill="currentColor"
          >
            <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
          </svg>
        </span>
      </span>
    </div>
  );
}
