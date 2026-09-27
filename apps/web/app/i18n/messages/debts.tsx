import type { ReactNode } from "react";
import { defineMessages } from "../define";

type DebtKind = "LOAN" | "CREDIT_CARD";
type ByKind = Record<DebtKind, string>;

/** Debts: loans and credit cards. */
export const debts = defineMessages({
  en: {
    kinds: { LOAN: "Loan", CREDIT_CARD: "Credit card" } satisfies ByKind,
    add: "Add debt",
    empty: "No debts yet. Add a loan or credit card to track what's left to pay.",
    typeLabel: "Debt type",
    loanPlaceholder: "e.g. Car loan",
    cardPlaceholder: "e.g. Visa",
    loanAmount: "Loan amount",
    totalPaid: "Total paid",
    creditLimit: "Credit limit",
    availableCredit: "Available credit",
    addKind: { LOAN: "Add loan", CREDIT_CARD: "Add credit card" } satisfies ByKind,
    editKind: { LOAN: "Edit loan", CREDIT_CARD: "Edit credit card" } satisfies ByKind,
    saveKind: { LOAN: "Save loan", CREDIT_CARD: "Save credit card" } satisfies ByKind,
    deleteTitle: { LOAN: "Delete loan?", CREDIT_CARD: "Delete credit card?" } satisfies ByKind,
    addAction: { LOAN: "add the loan", CREDIT_CARD: "add the credit card" } satisfies ByKind,
    saveAction: { LOAN: "save the loan", CREDIT_CARD: "save the credit card" } satisfies ByKind,
    deleteAction: { LOAN: "delete the loan", CREDIT_CARD: "delete the credit card" } satisfies ByKind,
    shared: "Shared",
    personal: "Personal",
    creditCards: "Credit cards",
    loans: "Loans",
    percentUsed: (percent: string) => `${percent}% used`,
    usedAcross: (used: ReactNode, limit: ReactNode, cards: number) => (
      <>
        {used} used of {limit} across {cards} {cards === 1 ? "card" : "cards"}
      </>
    ),
    editNamed: (name: string) => `Edit ${name}`,
    paidOf: (paid: string, total: string) => `${paid} of ${total}`,
    left: (amount: string) => `${amount} left`,
    percentPaid: (percent: string) => `${percent}% paid`,
    unusedCredit: (amount: string) => `${amount} unused credit`,
    available: (amount: string) => `${amount} available`,
    utilization: (percent: string) => `${percent}% utilization`,
  },
  es: {
    kinds: { LOAN: "Préstamo", CREDIT_CARD: "Tarjeta de crédito" },
    add: "Agregar deuda",
    empty:
      "Todavía no hay deudas. Agrega un préstamo o una tarjeta de crédito para seguir lo que falta por pagar.",
    typeLabel: "Tipo de deuda",
    loanPlaceholder: "p. ej. Crédito del carro",
    cardPlaceholder: "p. ej. Visa",
    loanAmount: "Monto del préstamo",
    totalPaid: "Total pagado",
    creditLimit: "Cupo",
    availableCredit: "Cupo disponible",
    addKind: { LOAN: "Agregar préstamo", CREDIT_CARD: "Agregar tarjeta de crédito" },
    editKind: { LOAN: "Editar préstamo", CREDIT_CARD: "Editar tarjeta de crédito" },
    saveKind: { LOAN: "Guardar préstamo", CREDIT_CARD: "Guardar tarjeta de crédito" },
    deleteTitle: { LOAN: "¿Eliminar el préstamo?", CREDIT_CARD: "¿Eliminar la tarjeta de crédito?" },
    addAction: { LOAN: "agregar el préstamo", CREDIT_CARD: "agregar la tarjeta de crédito" },
    saveAction: { LOAN: "guardar el préstamo", CREDIT_CARD: "guardar la tarjeta de crédito" },
    deleteAction: { LOAN: "eliminar el préstamo", CREDIT_CARD: "eliminar la tarjeta de crédito" },
    shared: "Compartidas",
    personal: "Personales",
    creditCards: "Tarjetas de crédito",
    loans: "Préstamos",
    percentUsed: (percent: string) => `${percent}% usado`,
    usedAcross: (used: ReactNode, limit: ReactNode, cards: number) => (
      <>
        {used} usado de {limit} en {cards} {cards === 1 ? "tarjeta" : "tarjetas"}
      </>
    ),
    editNamed: (name: string) => `Editar ${name}`,
    paidOf: (paid: string, total: string) => `${paid} de ${total}`,
    left: (amount: string) => `quedan ${amount}`,
    percentPaid: (percent: string) => `${percent}% pagado`,
    unusedCredit: (amount: string) => `${amount} de saldo a favor`,
    available: (amount: string) => `${amount} disponible`,
    utilization: (percent: string) => `${percent}% de uso`,
  },
});
