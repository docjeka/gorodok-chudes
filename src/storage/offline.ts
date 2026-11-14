// Офлайн-режим: регистрация сервис-воркера, проверка, что весь контент действительно в кэше, и обновление по согласию.
export type OfflineState = 'unsupported' | 'preparing' | 'ready' | 'failed';

export class Offline {
  state: OfflineState = 'unsupported';
  updateReady = false;
  private reg: ServiceWorkerRegistration | null = null;
  constructor(private onChange: () => void) {}

  async start() {
    // сервис-воркер работает только в безопасном окружении (HTTPS или localhost) и только в собранной версии
    if (!('serviceWorker' in navigator) || !window.isSecureContext || import.meta.env.DEV) { this.onChange(); return; }
    this.state = 'preparing';
    this.onChange();
    try {
      this.reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const reg = this.reg;
      const watch = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) { this.updateReady = true; this.onChange(); }
          if (sw.state === 'activated') void this.verify();
          if (sw.state === 'redundant' && this.state === 'preparing') { this.state = 'failed'; this.onChange(); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { this.updateReady = true; }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      if (reg.active) await this.verify();
    } catch { this.state = 'failed'; this.onChange(); }
  }

  /** «Готово к игре без интернета» показывается только после проверки каждого файла в кэше. */
  private async verify() {
    try {
      const active = this.reg?.active;
      if (!active) return;
      const info = await new Promise<{ version: string; files: number } | null>((resolve) => {
        const t = setTimeout(() => resolve(null), 3000);
        const on = (e: MessageEvent) => { if (e.data?.version) { clearTimeout(t); navigator.serviceWorker.removeEventListener('message', on); resolve(e.data); } };
        navigator.serviceWorker.addEventListener('message', on);
        active.postMessage('VERSION');
      });
      if (!info) return;
      const cache = await caches.open('gorodok-' + info.version);
      const keys = await cache.keys();
      this.state = keys.length >= info.files ? 'ready' : 'failed';
    } catch { this.state = 'failed'; }
    this.onChange();
  }

  /** Вызывается только после сохранения и не во время переноса предмета. */
  applyUpdate() {
    const waiting = this.reg?.waiting;
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage('SKIP_WAITING');
  }
}

/** Запрос постоянного хранения — только если платформа умеет; гарантий это не даёт. */
export async function requestPersist(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try { return (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { return null; }
}
