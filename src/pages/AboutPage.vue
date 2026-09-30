<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
    <header class="mb-10 text-center sm:mb-14">
      <h1 class="mb-3 text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
        درباره ما
      </h1>
      <p class="text-base text-slate-600 dark:text-slate-400 sm:text-lg">
        ابزاری هوشمند برای پردازش و جداسازی صدا با شتاب GPU
      </p>
    </header>

    <section class="space-y-8 sm:space-y-10">
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100 sm:text-xl">
          داستان ما
        </h2>
        <p class="mb-3 text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-base">
          این پروژه با هدف ارائه ابزاری سریع و در دسترس برای پردازش صدا و جداسازی نویزه از محتوا ساخته شده. ما باور داریم که 
          هوش مصنوعی باید برای همه قابل استفاده باشه، نه فقط متخصصان.
        </p>
        <p class="text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-base">
          با استفاده از WebGPU و WASM، پردازش‌ها مستقیماً توی مرورگرت انجام می‌شن و نیازی به آپلود فایل‌هات روی سرور نیست. 
          این یعنی حریم خصوصی کامل و سرعت بالاتر.
        </p>
      </div>

      <div class="grid gap-6 sm:grid-cols-2">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            سرعت بالا
          </h3>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            استفاده از شتاب GPU برای پردازش‌های سنگین و کاهش زمان انتظار
          </p>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            حریم خصوصی
          </h3>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            پردازش کاملا سمت کاربر و بدون ارسال هیچ فایلی به سرور
          </p>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            دسترسی آسان
          </h3>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            کار مستقیم از مرورگر، بدون نیاز به نصب نرم‌افزار اضافی
          </p>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            متن‌باز
          </h3>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            کد منبع شفاف و قابل بررسی برای اطمینان از امنیت
          </p>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm dark:from-slate-800/50 dark:to-slate-900 dark:border-slate-800 sm:p-8">
        <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100 sm:text-xl">
          درباره توسعه‌دهنده
        </h2>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div class="flex-1">
            <p class="mb-3 text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-base">
              این پروژه توسط 
              <strong class="font-semibold text-slate-900 dark:text-slate-100">محمدحسین کرمی</strong>
              توسعه داده شده. من یه توسعه‌دهنده نرم‌افزار هستم.
            </p>
            <p class="text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-base">
              علاقه‌مند به تاریخ، کتاب، سفر و برنامه‌نویسی. همیشه در حال یادگیری و ساختن پروژه‌های جدید.
            </p>
          </div>
          <div class="flex-none">
            <a
              href="https://mhkarami97.ir"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-xl border border-emerald-500 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              mhkarami97.ir
            </a>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100 sm:text-xl">
          تماس و بازخورد
        </h2>
        <p class="mb-4 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
          سوال، پیشنهاد یا مشکلی داری؟ خوشحال می‌شم بشنوم. می‌تونی از طریق سایت شخصی با من در ارتباط باشی.
        </p>
        <div class="flex flex-wrap gap-3">
          <RouterLink
            to="/contact"
            class="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            صفحه تماس
          </RouterLink>
          <a
            href="https://github.com/mhkarami97"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
            </svg>
            گیت‌هاب
          </a>
        </div>
      </div>
    </section>
  </div>
</template>