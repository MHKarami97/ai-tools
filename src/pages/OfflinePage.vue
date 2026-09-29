<script setup lang="ts">
import PageStub from '@/components/PageStub.vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { isOnline } = useOnlineStatus()
</script>

<template>
  <PageStub
    title="شما آفلاین هستید"
    description="برنامه بدون اینترنت باز می‌شود، اما مدلی که هنوز دانلود نشده نیاز به اتصال دارد. مدل‌های دانلودشده در حافظهٔ مرورگر ذخیره شده‌اند و آفلاین کار می‌کنند."
  >
    <p class="mt-4 text-sm">
      وضعیت شبکه:
      <strong :class="isOnline ? 'text-emerald-600' : 'text-amber-600'">
        {{ isOnline ? 'آنلاین' : 'آفلاین' }}
      </strong>
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <button type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white" @click="$router.go(0)">
        تلاش دوباره
      </button>
      <RouterLink to="/" class="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
        بازگشت به خانه
      </RouterLink>
    </div>
  </PageStub>
</template>
