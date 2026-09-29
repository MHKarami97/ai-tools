import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker(): void {
  registerSW({ immediate: true })
}
