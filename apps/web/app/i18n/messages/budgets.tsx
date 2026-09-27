import { defineMessages } from "../define";

/** Budgets: the list, alerts, and the add and edit dialog. */
export const budgets = defineMessages({
  en: {
    add: "Add budget",
    edit: "Edit budget",
    save: "Save budget",
    empty: "No budgets yet. Set a monthly limit for a category, like groceries.",
    shared: "Shared",
    personal: "Personal",
    linkingTitle: "Category → budget linking",
    linkingHint: "Pick the budget that's filled in when you log an expense in each category.",
    alerts: { warn: "75%+ used", critical: "90%+ used", over: "Over" },
    limit: "Limit",
    namePlaceholder: "e.g. Groceries",
    editNamed: (name: string) => `Edit ${name}`,
    deleteNamed: (name: string) => `Delete ${name}`,
    deleteTitle: "Delete budget?",
    deleteBody: (name: string) =>
      `This can't be undone. Transactions linked to "${name}" stay, but they won't count toward a budget anymore.`,
    addAction: "add the budget",
    saveAction: "save the budget",
    deleteAction: "delete the budget",
  },
  es: {
    add: "Agregar presupuesto",
    edit: "Editar presupuesto",
    save: "Guardar presupuesto",
    empty: "Todavía no hay presupuestos. Pon un límite mensual para una categoría, como el mercado.",
    shared: "Compartidos",
    personal: "Personales",
    linkingTitle: "Vincular categorías con presupuestos",
    linkingHint:
      "Elige el presupuesto que se asigna cuando registras un gasto en cada categoría.",
    alerts: { warn: "75%+ usado", critical: "90%+ usado", over: "Excedido" },
    limit: "Límite",
    namePlaceholder: "p. ej. Mercado",
    editNamed: (name: string) => `Editar ${name}`,
    deleteNamed: (name: string) => `Eliminar ${name}`,
    deleteTitle: "¿Eliminar el presupuesto?",
    deleteBody: (name: string) =>
      `Esto no se puede deshacer. Los movimientos vinculados a "${name}" se quedan, pero ya no contarán para un presupuesto.`,
    addAction: "agregar el presupuesto",
    saveAction: "guardar el presupuesto",
    deleteAction: "eliminar el presupuesto",
  },
});
