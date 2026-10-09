<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { KIND_LABELS, STAGE_LABELS } from '@/lib/history/historyLabels'
import { historySearch } from '@/lib/history/historySearch'
import { historyStore, type HistoryKind, type HistorySummary } from '@/lib/history/historyStore'

const SEARCH_DEBOUNCE_MS = 150

const props = withDefaults(
  defineProps<{
    kind?: HistoryKind
    title: string
    sourceLabel?: string
  }>(),
  { kind: undefined, sourceLabel: 'نام' },
)

const router = useRouter()
const entries = ref<HistorySummary[]>([])
const query = ref('')
const appliedQuery = ref('')
const formatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
let searchTimer: ReturnType<typeof setTimeout> | null = null

const visible = computed(() => historySearch.filter(entries.value, appliedQuery.value))

async function refresh(): Promise<void> {
  entries.value = await historyStore.list(props.kind)
}

async function clearAll(): Promise<void> {
  if (!window.confirm('کل تاریخچه و فایل‌های ذخیره‌شده پاک شود؟')) return
  await historyStore.clear(props.kind)
}

async function removeEntry(entry: HistorySummary): Promise<void> {
  if (!window.confirm('این مورد و فایل‌های ذخیره‌شده‌اش پاک شود؟')) return
  await historyStore.remove(entry.id)
}

function open(entry: HistorySummary): void {
  void router.push({ name: entry.kind, query: { resume: String(entry.id) } })
}

watch(query, (value) => {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    appliedQuery.value = value
  }, SEARCH_DEBOUNCE_MS)
})

onMounted(refresh)
onBeforeUnmount(() => {
  if (searchTimer !== null) clearTimeout(searchTimer)
})
watch(() => historyStore.version.value, refresh)
watch(() => props.kind, refresh)
</script>

<template>
  <section class="mx-auto mt-6 w-full max-w-3xl space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-semibold">{{ title }}</h2>
      <button
        v-if="entries.length > 0"
        type="button"
        class="rounded-lg border border-red-400 px-3 py-1 text-xs text-red-600"
        @click="clearAll"
      >
        پاک‌کردن همه
      </button>
    </div>

    <input
      v-if="entries.length > 0"
      v-model="query"
      type="search"
      dir="auto"
      aria-label="جستجو در تاریخچه"
      placeholder="جستجو در تاریخچه..."
      class="w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700"
    />

    <p v-if="entries.length === 0" class="text-sm text-slate-500">هنوز چیزی ثبت نشده است.</p>
    <p v-else-if="visible.length === 0" class="text-sm text-slate-500">نتیجه‌ای پیدا نشد.</p>

    <ul v-else class="divide-y divide-slate-200 dark:divide-slate-800">
      <li v-for="entry in visible" :key="entry.id" class="space-y-1 py-3 text-sm">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span v-if="!kind" class="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                {{ KIND_LABELS[entry.kind] }}
              </span>
              <span
                v-if="entry.stage"
                class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              >
                {{ STAGE_LABELS[entry.stage] }}
              </span>
            </div>
            <p class="break-all">
              <span class="text-slate-500">{{ sourceLabel }} : </span>
              <span dir="auto"> {{ entry.sourceName }}</span>
            </p>
          </div>
          <div class="flex flex-none gap-2">
            <button
              v-if="entry.resumable"
              type="button"
              class="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-white"
              @click="open(entry)"
            >
              باز کردن / ادامه
            </button>
            <button
              type="button"
              class="rounded-lg border border-red-400 px-3 py-1 text-xs text-red-600"
              @click="removeEntry(entry)"
            >
              حذف
            </button>
          </div>
        </div>
        <ul class="space-y-0.5 text-slate-600 dark:text-slate-400">
          <li v-for="output in entry.outputs" :key="output" dir="ltr" class="break-all text-start">{{ output }}</li>
        </ul>
        <p class="text-xs text-slate-500">{{ formatter.format(entry.updatedAt) }}</p>
      </li>
    </ul>
  </section>
</template>
