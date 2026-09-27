import { defineMessages } from "../define";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

/** A monthly rule's day: a date, the last day (31 is clamped), or none. */
type MonthDay = number | "last" | null;

/** Recurring transactions: the list, the add and edit dialogs, and schedule labels. */
export const recurring = defineMessages({
  en: {
    add: "Add recurring",
    addTitle: "Add recurring transaction",
    editTitle: "Edit recurring transaction",
    save: "Save recurring",
    intro: "Each one posts automatically on its next date.",
    empty:
      "No recurring transactions yet. Add rent, pay, or a subscription and it will post on schedule.",
    pause: (title: string) => `Pause ${title}`,
    resume: (title: string) => `Resume ${title}`,
    editNamed: (title: string) => `Edit ${title}`,
    deleteNamed: (title: string) => `Delete ${title}`,
    next: "Next",
    paused: "Paused",
    deleteTitle: "Delete recurring transaction?",
    deleteBody: "It stops creating new transactions. Ones it already posted stay.",
    addAction: "add the recurring transaction",
    saveAction: "save the recurring transaction",
    updateAction: "update the recurring transaction",
    deleteAction: "delete the recurring transaction",
    schedule: "Schedule",
    presets: {
      daily: "Daily",
      weekly: "Weekly",
      biweekly: "Every 2 weeks",
      monthly1: "Monthly on the 1st",
      monthly15: "Monthly on the 15th",
      monthlyLast: "Monthly on the last day",
      monthlySame: "Monthly, same day as the start date",
      yearly: "Yearly",
      custom: "Custom",
    },
    frequency: "Frequency",
    repeatEvery: "Repeat every",
    units: { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months" },
    dayOfMonth: "Day of month",
    startDate: "Start date",
    endDateOptional: "End date (optional)",
    label: {
      daily: (interval: number) => (interval === 1 ? "Daily" : `Every ${interval} days`),
      weekly: (interval: number, day: string | null) => {
        if (interval === 1) return day ? `Every ${day}` : "Weekly";
        return day ? `Every ${interval} weeks on ${day}` : `Every ${interval} weeks`;
      },
      monthly: (interval: number, day: MonthDay) => {
        const dayLabel = day === "last" ? "Last day" : day === null ? null : ordinal(day);
        if (interval === 1) return dayLabel ? `${dayLabel} of every month` : "Monthly";
        return dayLabel ? `${dayLabel} every ${interval} months` : `Every ${interval} months`;
      },
      yearly: (interval: number) => (interval === 1 ? "Yearly" : `Every ${interval} years`),
    },
  },
  es: {
    add: "Agregar recurrente",
    addTitle: "Agregar movimiento recurrente",
    editTitle: "Editar movimiento recurrente",
    save: "Guardar recurrente",
    intro: "Cada uno se registra automáticamente en su próxima fecha.",
    empty:
      "Todavía no hay movimientos recurrentes. Agrega el arriendo, el sueldo o una suscripción y se registrará según lo programado.",
    pause: (title: string) => `Pausar ${title}`,
    resume: (title: string) => `Reanudar ${title}`,
    editNamed: (title: string) => `Editar ${title}`,
    deleteNamed: (title: string) => `Eliminar ${title}`,
    next: "Próximo",
    paused: "En pausa",
    deleteTitle: "¿Eliminar el movimiento recurrente?",
    deleteBody: "Deja de crear movimientos nuevos. Los que ya registró se quedan.",
    addAction: "agregar el movimiento recurrente",
    saveAction: "guardar el movimiento recurrente",
    updateAction: "actualizar el movimiento recurrente",
    deleteAction: "eliminar el movimiento recurrente",
    schedule: "Frecuencia",
    presets: {
      daily: "Diario",
      weekly: "Semanal",
      biweekly: "Cada 2 semanas",
      monthly1: "Mensual, el día 1",
      monthly15: "Mensual, el día 15",
      monthlyLast: "Mensual, el último día",
      monthlySame: "Mensual, el mismo día de la fecha de inicio",
      yearly: "Anual",
      custom: "Personalizado",
    },
    frequency: "Periodicidad",
    repeatEvery: "Repetir cada",
    units: { DAILY: "días", WEEKLY: "semanas", MONTHLY: "meses" },
    dayOfMonth: "Día del mes",
    startDate: "Fecha de inicio",
    endDateOptional: "Fecha de fin (opcional)",
    label: {
      daily: (interval: number) => (interval === 1 ? "Diario" : `Cada ${interval} días`),
      weekly: (interval: number, day: string | null) => {
        // "lunes"…"viernes" don't change in the plural; "sábado" and "domingo" add -s.
        if (interval === 1) return day ? `Todos los ${day.endsWith("o") ? `${day}s` : day}` : "Semanal";
        return day ? `Cada ${interval} semanas, el ${day}` : `Cada ${interval} semanas`;
      },
      monthly: (interval: number, day: MonthDay) => {
        const dayLabel = day === "last" ? "El último día" : day === null ? null : `El ${day}`;
        if (interval === 1) return dayLabel ? `${dayLabel} de cada mes` : "Mensual";
        return dayLabel ? `${dayLabel}, cada ${interval} meses` : `Cada ${interval} meses`;
      },
      yearly: (interval: number) => (interval === 1 ? "Anual" : `Cada ${interval} años`),
    },
  },
});
