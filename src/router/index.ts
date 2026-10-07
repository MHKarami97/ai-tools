import { createRouter, createWebHistory } from "vue-router";
import { features } from "@/config/features";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: features.map((feature) => ({
    path: feature.path,
    name: feature.name,
    component: feature.load as () => Promise<never>,
  })),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: "smooth" };
    return { top: 0 };
  },
});
