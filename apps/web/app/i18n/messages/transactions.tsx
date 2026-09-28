import type { ReactNode } from "react";
import { defineMessages } from "../define";

/** Transactions: the list, the add and edit form, and each row. */
export const transactions = defineMessages({
  en: {
    add: "Add transaction",
    adding: "Adding…",
    save: "Save transaction",
    exportCsv: "Export CSV",
    importJson: "Import JSON",
    manageCategories: "Manage categories",
    out: "out",
    in: "in",
    otherCurrencies: "Other currencies not included",
    showingOnly: (kind: "income" | "expense", clear: ReactNode) => (
      <>
        Showing {kind === "income" ? "income" : "expenses"} only · {clear}
      </>
    ),
    clearFilter: "Clear filter",
    emptyFiltered: (kind: "income" | "expense") =>
      kind === "income" ? "No income transactions yet." : "No expense transactions yet.",
    empty: "No transactions yet. Add one, or import a JSON file.",
    loadingMore: "Loading more transactions…",
    end: "That's everything.",
    deleteTitle: "Delete transaction?",
    addAction: "add the transaction",
    deleteAction: "delete the transaction",
    saveAction: "save the transaction",
    exportAction: "export transactions",
    typeLabel: "Transaction type",
    budgetOptional: "Budget (optional)",
    needSchedule: (link: ReactNode) => <>Need this on a schedule? {link}</>,
    setUpRecurring: "Set up a recurring transaction",
    noBudget: "No budget",
    sharedBudgets: "Shared",
    personalBudgets: "Personal",
    chargedLabel: (kind: "income" | "expense") =>
      kind === "income" ? "Amount received (optional)" : "Amount charged (optional)",
    chargedCurrencyLabel: (kind: "income" | "expense") =>
      kind === "income" ? "Currency received" : "Currency charged",
    /** `foreign`: the amount isn't in home currency, so a blank charge has no exact home figure. */
    chargedHint: (kind: "income" | "expense", foreign: boolean) =>
      (kind === "income"
        ? "What actually reached your account, after fees."
        : "What your card or bank actually took, fees included.") +
      (foreign ? " Without it, budgets use the market rate and list totals leave this out." : ""),
    charged: (kind: "income" | "expense") => (kind === "income" ? "Received" : "Charged"),
    overMarket: (difference: ReactNode) => <>{difference} over the market rate</>,
    underMarket: (difference: ReactNode) => <>{difference} under the market rate</>,
  },
  es: {
    add: "Agregar movimiento",
    adding: "Agregando…",
    save: "Guardar movimiento",
    exportCsv: "Exportar CSV",
    importJson: "Importar JSON",
    manageCategories: "Administrar categorías",
    out: "salidas",
    in: "entradas",
    otherCurrencies: "No incluye otras monedas",
    showingOnly: (kind: "income" | "expense", clear: ReactNode) => (
      <>
        Mostrando solo {kind === "income" ? "ingresos" : "gastos"} · {clear}
      </>
    ),
    clearFilter: "Quitar filtro",
    emptyFiltered: (kind: "income" | "expense") =>
      kind === "income" ? "Todavía no hay ingresos." : "Todavía no hay gastos.",
    empty: "Todavía no hay movimientos. Agrega uno o importa un archivo JSON.",
    loadingMore: "Cargando más movimientos…",
    end: "Eso es todo.",
    deleteTitle: "¿Eliminar el movimiento?",
    addAction: "agregar el movimiento",
    deleteAction: "eliminar el movimiento",
    saveAction: "guardar el movimiento",
    exportAction: "exportar los movimientos",
    typeLabel: "Tipo de movimiento",
    budgetOptional: "Presupuesto (opcional)",
    needSchedule: (link: ReactNode) => <>¿Lo necesitas programado? {link}</>,
    setUpRecurring: "Configura un movimiento recurrente",
    noBudget: "Sin presupuesto",
    sharedBudgets: "Compartidos",
    personalBudgets: "Personales",
    chargedLabel: (kind: "income" | "expense") =>
      kind === "income" ? "Monto recibido (opcional)" : "Monto cobrado (opcional)",
    chargedCurrencyLabel: (kind: "income" | "expense") =>
      kind === "income" ? "Moneda recibida" : "Moneda del cobro",
    chargedHint: (kind: "income" | "expense", foreign: boolean) =>
      (kind === "income"
        ? "Lo que realmente llegó a tu cuenta, después de comisiones."
        : "Lo que realmente cobró tu tarjeta o banco, con comisiones.") +
      (foreign
        ? " Sin esto, los presupuestos usan la tasa del mercado y los totales de la lista no lo incluyen."
        : ""),
    charged: (kind: "income" | "expense") => (kind === "income" ? "Recibido" : "Cobrado"),
    overMarket: (difference: ReactNode) => <>{difference} más que la tasa del mercado</>,
    underMarket: (difference: ReactNode) => <>{difference} menos que la tasa del mercado</>,
  },
});
