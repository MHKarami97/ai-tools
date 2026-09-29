import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { registerServiceWorker } from './lib/registerServiceWorker'
import './lib/pwaInstaller'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')
registerServiceWorker()
