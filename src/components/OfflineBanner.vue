<script setup lang="ts">
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { isOnline } = useOnlineStatus()
</script>

<template>
  <div v-if="!isOnline" role="status" class="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
    اینترنت قطع است. مدل‌های دانلودشده همچنان کار می‌کنند.
    <RouterLink to="/offline" class="underline">جزئیات</RouterLink>
  </div>
</template>
