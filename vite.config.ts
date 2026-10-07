import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";

const ortFilePattern = /^\/ort\/([\w.-]+\.(?:mjs|wasm))$/;

const ortContentTypes: Record<string, string> = {
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
};

const base = process.env.BASE_PATH ?? "/";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const ortAsyncifyPattern = /ort-wasm-simd-threaded\.asyncify.*\.wasm$/;

function dropBundledOrtWasm(): Plugin {
  return {
    name: "drop-bundled-ort-wasm",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (ortAsyncifyPattern.test(fileName)) {
          delete bundle[fileName];
        }
      }
    },
  };
}

function serveOrtRuntimeInDev(): Plugin {
  return {
    name: "serve-ort-runtime-in-dev",
    apply: "serve",
    configureServer(server) {
      const ortDirectory = join(server.config.publicDir, "ort");
      const basePath = server.config.base.replace(/\/$/, "");

      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? "").split("?")[0];
        const match = ortFilePattern.exec(pathname.slice(basePath.length));
        if (!match) return next();

        const filePath = join(ortDirectory, match[1]);
        if (!existsSync(filePath)) return next();

        for (const [name, value] of Object.entries(
          crossOriginIsolationHeaders,
        )) {
          response.setHeader(name, value);
        }

        const extension = match[1].slice(match[1].lastIndexOf("."));
        response.setHeader("Content-Type", ortContentTypes[extension]);
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        response.setHeader("Cache-Control", "no-cache");
        createReadStream(filePath).pipe(response);
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    serveOrtRuntimeInDev(),
    vue(),
    tailwindcss(),
    dropBundledOrtWasm(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: [
        "icon.svg",
        "favicon.ico",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        name: "ابزارهای هوش مصنوعی آفلاین",
        short_name: "AI Tools",
        description: "تبدیل متن به گفتار فارسی و جداسازی صدا، کاملا در مرورگر",
        lang: "fa",
        dir: "rtl",
        display: "standalone",
        start_url: base,
        scope: base,
        theme_color: "#059669",
        background_color: "#0f172a",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/ort\/.+\.(?:mjs|wasm)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "ort-runtime",
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { minify: false },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  worker: { format: "es" },
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
});
