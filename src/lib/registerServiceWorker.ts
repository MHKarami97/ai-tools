import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

class PwaUpdater {
  readonly needRefresh = ref(false)
  private updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

  register(): void {
    if (this.updateServiceWorker) return
    this.updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this.needRefresh.value = true
      },
      onRegisteredSW: (_url, registration) => {
        if (!registration) return
        setInterval(() => {
          if (navigator.onLine) void registration.update()
        }, UPDATE_CHECK_INTERVAL_MS)
      },
    })
  }

  async apply(): Promise<void> {
    await this.updateServiceWorker?.(true)
  }

  dismiss(): void {
    this.needRefresh.value = false
  }
}

export const pwaUpdater = new PwaUpdater()

export function registerServiceWorker(): void {
  pwaUpdater.register()
}