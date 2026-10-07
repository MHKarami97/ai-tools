<script setup lang="ts">
import { computed } from "vue";

type LockState = "no-file" | "file-selected" | "processing";

interface Props {
  readonly state: LockState;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (event: "pick-file"): void }>();

const STEPS = [
  { title: "جداسازی صدا", detail: "صدای خواننده از آهنگ جدا می‌شود." },
  {
    title: "استخراج متن",
    detail: "متن ترانه با Whisper و زمان‌بندی کلمه‌ها ساخته می‌شود.",
  },
  { title: "خروجی MP4", detail: "ویدئوی لیریک با استایل دلخواه ساخته می‌شود." },
] as const;

const MESSAGES: Record<LockState, string> = {
  "no-file": "برای فعال شدن، ابتدا یک آهنگ انتخاب کنید و جداسازی را اجرا کنید.",
  "file-selected":
    "آهنگ انتخاب شده است. بعد از پایان جداسازی، این بخش فعال می‌شود.",
  processing: "جداسازی در حال انجام است. بعد از پایان، این بخش فعال می‌شود.",
};

const message = computed(() => MESSAGES[props.state]);
const canPickFile = computed(() => props.state === "no-file");
</script>

<template>
  <section
    aria-labelledby="lyric-video-title"
    aria-disabled="true"
    class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/60"
  >
    <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2
        id="lyric-video-title"
        class="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200"
      >
        <svg
          class="h-5 w-5 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        ساخت ویدئوی لیریک از صدای خواننده
      </h2>
      <span
        class="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      >
        غیرفعال
      </span>
    </header>

    <ol class="grid gap-3 sm:grid-cols-3">
      <li
        v-for="(step, index) in STEPS"
        :key="step.title"
        class="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm opacity-60 dark:border-slate-800 dark:bg-slate-900/70"
      >
        <span class="mb-1 flex items-center gap-2 font-medium">
          <span
            class="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs dark:bg-slate-700"
          >
            {{ index + 1 }}
          </span>
          {{ step.title }}
        </span>
        <span
          class="block text-xs leading-6 text-slate-600 dark:text-slate-400"
          >{{ step.detail }}</span
        >
      </li>
    </ol>

    <p class="mt-4 text-sm text-slate-600 dark:text-slate-400" role="status">
      {{ message }}
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <button
        v-if="canPickFile"
        type="button"
        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
        @click="emit('pick-file')"
      >
        انتخاب آهنگ
      </button>
      <button
        type="button"
        disabled
        class="cursor-not-allowed rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-400 dark:border-slate-700"
      >
        شروع ساخت ویدئو
      </button>
    </div>
  </section>
</template>
