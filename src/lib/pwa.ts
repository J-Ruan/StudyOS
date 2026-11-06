import { useCallback, useEffect, useState } from 'react';
export function usePWA() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>(),
    [needRefresh, setRefresh] = useState(false),
    [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let disposed = false,
      reg: ServiceWorkerRegistration | undefined,
      interval: ReturnType<typeof setInterval> | undefined;
    const changed = () => {
      if (!disposed) location.reload();
    };
    const check = () => {
      if (navigator.onLine)
        void reg?.update().catch(() => {
          /* Existing offline cache remains usable. */
        });
    };
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .then((r) => {
        if (disposed) return;
        reg = r;
        setRegistration(r);
        if (r.waiting) setRefresh(true);
        const observe = (worker: ServiceWorker | null) => {
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              if (navigator.serviceWorker.controller) setRefresh(true);
              else setOfflineReady(true);
            }
          });
        };
        observe(r.installing);
        r.addEventListener('updatefound', () => observe(r.installing));
        interval = setInterval(check, 3600000);
        window.addEventListener('online', check);
        document.addEventListener('visibilitychange', check);
      })
      .catch(() => {
        /* A failed initial cache installation must not claim offline readiness. */
      });
    // The first controller is an initial installation, not an update requiring reload.
    const controllerChanged = () => {
      if (navigator.serviceWorker.controller && sessionStorage.getItem('studyos-update')) {
        sessionStorage.removeItem('studyos-update');
        changed();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
    };
  }, []);
  const updateServiceWorker = useCallback(async () => {
    if (registration?.waiting) {
      sessionStorage.setItem('studyos-update', '1');
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    }
  }, [registration]);
  return {
    needRefresh: [needRefresh, setRefresh] as const,
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  };
}
