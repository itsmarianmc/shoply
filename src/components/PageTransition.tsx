"use client";

import { useEffect } from "react";
import { flushSync } from "react-dom";

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type StartViewTransitionFn = (updateCallback: () => void) => ViewTransitionLike;

export default function PageTransition() {
  useEffect(() => {
    const startViewTransition = (
      document as Document & { startViewTransition?: StartViewTransitionFn }
    ).startViewTransition;

    if (typeof startViewTransition !== "function") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let transitionRunning = false;

    const commitWithTransition = (commit: () => void) => {
      if (transitionRunning || reduceMotion.matches) {
        commit();
        return;
      }
      try {
        const transition = startViewTransition.call(document, () => {
          flushSync(commit);
        });
        transitionRunning = true;
        Promise.all([transition.ready, transition.finished])
          .catch(() => {})
          .finally(() => {
            transitionRunning = false;
          });
      } catch {
        commit();
      }
    };

    const wrapHistoryMethod =
      <Args extends unknown[]>(native: (...args: Args) => void) =>
      (...args: Args) => {
        const url = args[2] as string | URL | null | undefined;
        const target = url == null ? null : new URL(String(url), window.location.href);

        const isRouteChange =
          target !== null &&
          `${target.pathname}${target.search}` !==
            `${window.location.pathname}${window.location.search}`;

        if (!isRouteChange) {
          native(...args);
          return;
        }

        commitWithTransition(() => native(...args));
      };

    const nativePushState = window.history.pushState.bind(window.history);
    const nativeReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = wrapHistoryMethod(nativePushState);
    window.history.replaceState = wrapHistoryMethod(nativeReplaceState);

    return () => {
      window.history.pushState = nativePushState;
      window.history.replaceState = nativeReplaceState;
    };
  }, []);

  return null;
}
