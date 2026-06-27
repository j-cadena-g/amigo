import { registerSW } from "virtual:pwa-register";

export function initServiceWorkerRegistration() {
  return registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
  });
}
