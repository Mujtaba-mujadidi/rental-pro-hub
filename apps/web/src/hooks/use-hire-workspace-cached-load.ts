"use client";

import { useHireWorkspaceCache } from "@/app/(main)/rental/hires/[groupId]/hire-workspace-provider";
import type { HireWorkspaceCacheKey } from "@/lib/fleet/hire-workspace-tab-cache";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type LoadResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load a hire-workspace payload once per layout mount. Tab switches reuse the cache.
 * `useCache: false` always hits the server (driver workspace).
 * `skipLoad: true` does not fetch at all.
 */
export function useHireWorkspaceCachedLoad<T>(input: {
  key: HireWorkspaceCacheKey;
  skipLoad?: boolean;
  useCache?: boolean;
  load: () => Promise<LoadResult<T>>;
}): {
  data: T | null;
  error: string | null;
  pending: boolean;
  reload: () => void;
} {
  const cache = useHireWorkspaceCache();
  const skipLoad = Boolean(input.skipLoad);
  const cacheEnabled = input.useCache !== false && cache != null;
  const epoch = cacheEnabled ? cache.cacheEpoch : 0;
  const hireGroupId = cache?.shell.hireGroupId ?? "";
  const key = input.key;
  const loadRef = useRef(input.load);
  loadRef.current = input.load;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (force: boolean) => {
      if (skipLoad) {
        setData(null);
        setError(null);
        return;
      }
      if (cacheEnabled && cache && !force) {
        const hit = cache.readCache(key);
        if (hit !== undefined) {
          setData(hit as T);
          setError(null);
          return;
        }
      }

      startTransition(async () => {
        const res = await loadRef.current();
        if (!res.ok) {
          setError(res.error);
          setData(null);
          return;
        }
        if (cacheEnabled && cache) cache.writeCache(key, res.data);
        setData(res.data);
        setError(null);
      });
    },
    [skipLoad, cache, cacheEnabled, key],
  );

  useEffect(() => {
    run(false);
  }, [run, epoch, hireGroupId]);

  return {
    data,
    error,
    pending,
    reload: () => run(true),
  };
}
