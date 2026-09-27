import type { PushErrorCode } from "@/app/lib/push/client";
import { defineMessages } from "../define";

/** Grocery-list push notifications: settings, the first-run prompt, and the list button. */
export const notifications = defineMessages({
  en: {
    /** Why a change failed, or null when there's nothing more specific than "try again". */
    reason: {
      unsupported: "this browser doesn't support push notifications",
      denied: "notification permission was denied",
      unavailable: "the app hasn't finished loading. Reload the page",
      "not-configured": "notifications aren't set up on this server",
      failed: null,
    } satisfies Record<PushErrorCode, string | null>,
    updateFailed: (reason: string | null) =>
      reason ? `Couldn't update notifications: ${reason}.` : "Couldn't update notifications. Try again.",
    turnOnFailed: (reason: string | null) =>
      reason ? `Couldn't turn on notifications: ${reason}.` : "Couldn't turn on notifications. Try again.",
    alertsFailed: (turningOff: boolean, reason: string | null) => {
      const action = turningOff ? "turn off" : "turn on";
      return reason ? `Couldn't ${action} alerts: ${reason}.` : `Couldn't ${action} alerts. Try again.`;
    },
    checking: "Checking notification status…",
    unsupported: "This browser doesn't support notifications.",
    blockedTitle: "Notifications are blocked",
    blockedBody:
      "Your browser blocked notifications for amigo. Allow them in your browser's site settings to turn them back on.",
    groceryChanges: "Grocery list changes",
    groceryChangesHint: "Get a notification when someone else adds an item or marks one as bought.",
    iosHint:
      "On iPhone and iPad, notifications only work after you add amigo to your Home Screen and open it from there.",
    showInstallSteps: "Show install steps",
    promptTitle: "Get a notification when the grocery list changes",
    promptBody:
      "You'll get one when someone else in your household adds an item or marks one as bought.",
    iosTitle: "On iPhone and iPad, add amigo to your Home Screen first:",
    iosSteps: [
      "Tap the Share button in Safari.",
      "Choose “Add to Home Screen”.",
      "Open amigo from your Home Screen and turn on notifications.",
    ],
    promptDenied:
      "Notifications are blocked for amigo in this browser. Allow them in your browser's site settings, then try again.",
    notNow: "Not now",
    turningOn: "Turning on…",
    turningOff: "Turning off…",
    turnOn: "Turn on notifications",
    alertsBlocked: "Alerts are blocked. Allow notifications for this site in your browser settings.",
    alertsOffTitle: "Turn off grocery list alerts",
    alertsOn: "Alerts on",
    turnOnAlerts: "Turn on alerts",
  },
  es: {
    reason: {
      unsupported: "este navegador no admite notificaciones push",
      denied: "se negó el permiso de notificaciones",
      unavailable: "la app no ha terminado de cargar. Recarga la página",
      "not-configured": "las notificaciones no están configuradas en este servidor",
      failed: null,
    },
    updateFailed: (reason: string | null) =>
      reason
        ? `No se pudieron actualizar las notificaciones: ${reason}.`
        : "No se pudieron actualizar las notificaciones. Inténtalo de nuevo.",
    turnOnFailed: (reason: string | null) =>
      reason
        ? `No se pudieron activar las notificaciones: ${reason}.`
        : "No se pudieron activar las notificaciones. Inténtalo de nuevo.",
    alertsFailed: (turningOff: boolean, reason: string | null) => {
      const action = turningOff ? "desactivar" : "activar";
      return reason
        ? `No se pudieron ${action} las alertas: ${reason}.`
        : `No se pudieron ${action} las alertas. Inténtalo de nuevo.`;
    },
    checking: "Revisando el estado de las notificaciones…",
    unsupported: "Este navegador no admite notificaciones.",
    blockedTitle: "Las notificaciones están bloqueadas",
    blockedBody:
      "Tu navegador bloqueó las notificaciones de amigo. Permítelas en la configuración del sitio de tu navegador para volver a activarlas.",
    groceryChanges: "Cambios en la lista de compras",
    groceryChangesHint:
      "Recibe una notificación cuando alguien más agregue un artículo o lo marque como comprado.",
    iosHint:
      "En iPhone y iPad, las notificaciones solo funcionan después de agregar amigo a tu pantalla de inicio y abrirlo desde ahí.",
    showInstallSteps: "Ver cómo instalar",
    promptTitle: "Recibe una notificación cuando cambie la lista de compras",
    promptBody:
      "Te llegará una cuando alguien más de tu hogar agregue un artículo o lo marque como comprado.",
    iosTitle: "En iPhone y iPad, primero agrega amigo a tu pantalla de inicio:",
    iosSteps: [
      "Toca el botón Compartir en Safari.",
      "Elige “Agregar a pantalla de inicio”.",
      "Abre amigo desde tu pantalla de inicio y activa las notificaciones.",
    ],
    promptDenied:
      "Las notificaciones de amigo están bloqueadas en este navegador. Permítelas en la configuración del sitio de tu navegador e inténtalo de nuevo.",
    notNow: "Ahora no",
    turningOn: "Activando…",
    turningOff: "Desactivando…",
    turnOn: "Activar notificaciones",
    alertsBlocked:
      "Las alertas están bloqueadas. Permite las notificaciones de este sitio en la configuración de tu navegador.",
    alertsOffTitle: "Desactivar las alertas de la lista de compras",
    alertsOn: "Alertas activadas",
    turnOnAlerts: "Activar alertas",
  },
});
