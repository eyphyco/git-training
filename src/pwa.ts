// オフライン対応（service worker）の登録と、新しい版が届いたときのお知らせ。本番ビルドでだけ動く。
import { useSyncExternalStore } from 'react';

/** 待機中の新しい版。null ならお知らせを出さない */
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const setWaiting = (w: ServiceWorker | null) => {
  waiting = w;
  for (const l of listeners) l();
};

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('./sw.js');
    // 初めての登録（controller がない）ではお知らせを出さない
    if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
      });
    });
    // タブに戻ってきたときにも新しい版を確かめる
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update();
    });
  });
}

/** 新しい版に切り替えて読み直す（「更新」ボタン） */
export function applyUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waiting !== null,
  );
}

export function dismissUpdate() {
  setWaiting(null);
}
