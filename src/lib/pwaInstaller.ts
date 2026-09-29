import { ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

class PwaInstaller {
  readonly canInstall = ref(false)
  readonly isInstalled = ref(window.matchMedia('(display-mode: standalone)').matches)
  private deferredPrompt: BeforeInstallPromptEvent | null = null

  constructor() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      this.deferredPrompt = event as BeforeInstallPromptEvent
      this.canInstall.value = true
    })
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null
      this.canInstall.value = false
      this.isInstalled.value = true
    })
  }

  async install(): Promise<boolean> {
    if (!this.deferredPrompt) return false
    await this.deferredPrompt.prompt()
    const { outcome } = await this.deferredPrompt.userChoice
    this.deferredPrompt = null
    this.canInstall.value = false
    return outcome === 'accepted'
  }
}

export const pwaInstaller = new PwaInstaller()
