<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { deleteModel, listModels, loadModel, saveModel, type ModelInfo } from '@/lib/modelCache'
import { estimateStorage, type StorageEstimateInfo } from '@/lib/storageEstimate'
import { formatBytes } from '@/lib/format'

const TEST_MODEL_NAME = 'test-model'
const TEST_MODEL_BYTES = 1024 * 1024

const models = ref<ModelInfo[]>([])
const storage = ref<StorageEstimateInfo | null>(null)
const message = ref('')

async function refresh(): Promise<void> {
  models.value = await listModels()
  storage.value = await estimateStorage()
}

async function run(action: () => Promise<string>): Promise<void> {
  try {
    message.value = await action()
  } catch (error) {
    message.value = `خطا: ${error instanceof Error ? error.message : String(error)}`
  }
  await refresh()
}

const save = () =>
  run(async () => {
    await saveModel(TEST_MODEL_NAME, new Blob([new Uint8Array(TEST_MODEL_BYTES)]))
    return 'مدل تستی ذخیره شد.'
  })

const load = () =>
  run(async () => {
    const blob = await loadModel(TEST_MODEL_NAME)
    return blob ? `مدل بارگذاری شد (${formatBytes(blob.size)}).` : 'مدلی با این نام پیدا نشد.'
  })

const remove = () =>
  run(async () => {
    await deleteModel(TEST_MODEL_NAME)
    return 'مدل تستی حذف شد.'
  })

onMounted(refresh)
</script>

<template>
  <div class="mt-6 space-y-4">
    <h2 class="font-semibold">آزمایش لایه کش مدل</h2>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white" @click="save">
        ذخیره مدل تستی (۱ مگابایت)
      </button>
      <button type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" @click="load">
        بارگذاری
      </button>
      <button type="button" class="rounded-lg border border-red-400 px-4 py-2 text-sm text-red-600" @click="remove">
        حذف
      </button>
    </div>
    <p v-if="message" role="status" class="text-sm text-slate-700 dark:text-slate-300">{{ message }}</p>
    <p v-if="storage" class="text-xs text-slate-500">
      مصرف حافظه: {{ formatBytes(storage.usage) }} از {{ formatBytes(storage.quota) }}
    </p>
    <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
      <li v-if="models.length === 0" class="p-3 text-slate-500">مدلی ذخیره نشده است.</li>
      <li v-for="model in models" :key="model.name" class="flex flex-wrap justify-between gap-2 p-3">
        <span dir="ltr">{{ model.name }}</span>
        <span class="text-slate-500">{{ formatBytes(model.size) }}</span>
      </li>
    </ul>
  </div>
</template>
