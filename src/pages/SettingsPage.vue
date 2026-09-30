<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageStub from '@/components/PageStub.vue'
import { formatBytes } from '@/lib/format'
import { modelInventory, type ModelGroup } from '@/lib/storage/modelInventory'
import { estimateStorage, requestPersistentStorage, type StorageEstimateInfo } from '@/lib/storageEstimate'

const groups = ref<ModelGroup[]>([])
const storage = ref<StorageEstimateInfo | null>(null)
const persisted = ref<boolean | null>(null)
const loading = ref(true)
const errorMessage = ref('')

async function refresh(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    groups.value = await modelInventory.snapshot()
    storage.value = await estimateStorage()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function remove(group: ModelGroup): Promise<void> {
  if (!window.confirm(`«${group.label}» حذف شود؟`)) return
  await modelInventory.clear(group.id)
  await refresh()
}

async function keepStorage(): Promise<void> {
  persisted.value = await requestPersistentStorage()
}

onMounted(refresh)
</script>

<template>
  <PageStub title="تنظیمات" description="مدیریت مدل‌های دانلودشده و کش.">
    <div class="mt-4 space-y-4">
      <p v-if="loading" class="text-sm text-slate-500">در حال خواندن کش...</p>
      <p v-if="errorMessage" role="alert" class="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
        {{ errorMessage }}
      </p>

      <div
        v-for="group in groups"
        :key="group.id"
        class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">{{ group.label }}</h2>
          <span class="text-sm text-slate-500">{{ formatBytes(group.totalSize) }}</span>
        </div>

        <p v-if="group.models.length === 0" class="mt-2 text-sm text-slate-500">چیزی ذخیره نشده است.</p>
        <ul v-else class="mt-2 divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <li v-for="model in group.models" :key="model.name" class="flex flex-wrap justify-between gap-2 py-1.5">
            <span dir="ltr" class="break-all">{{ model.name }}</span>
            <span class="text-slate-500">{{ formatBytes(model.size) }}</span>
          </li>
        </ul>

        <button
          v-if="group.models.length > 0"
          type="button"
          class="mt-3 rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-600"
          @click="remove(group)"
        >
          حذف از کش
        </button>
      </div>

      <div class="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        <p v-if="storage">
          فضای استفاده‌شده: {{ formatBytes(storage.usage) }} از {{ formatBytes(storage.quota) }}
        </p>
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700"
          @click="keepStorage"
        >
          جلوگیری از پاک‌شدن خودکار مدل‌ها
        </button>
        <p v-if="persisted !== null">
          {{ persisted ? 'ذخیره‌سازی پایدار فعال شد.' : 'مرورگر درخواست ذخیرهٔ پایدار را نپذیرفت.' }}
        </p>
      </div>
    </div>
  </PageStub>
</template>
