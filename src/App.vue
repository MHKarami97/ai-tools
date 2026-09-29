<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import OfflineBanner from '@/components/OfflineBanner.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <OfflineBanner />
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
