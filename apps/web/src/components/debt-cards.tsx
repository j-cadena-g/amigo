"use client";

import { useTransition } from "react";
import { deleteDebt } from "@/actions/debts";
import type { Debt } from "@amigo/db";

interface DebtCardsProps {
  debts: Debt[];
}

function LoanCard({ debt }: { debt: Debt }) {
  const [isPending, startTransition] = useTransition();

  const loanAmount = parseFloat(debt.balanceInitial);
  const totalPaid = parseFloat(debt.balanceCurrent);
  const remaining = Math.max(0, loanAmount - totalPaid);
  const percentPaid = loanAmount > 0 ? (totalPaid / loanAmount) * 100 : 0;

  const handleDelete = () => {
    if (confirm(`Delete "${debt.name}"?`)) {
      startTransition(async () => {
        await deleteDebt(debt.id);
      });
    }
  };

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            Loan
          </span>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">
            {debt.name}
          </h3>
        </div>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-gray-400 hover:text-red-500 disabled:opacity-50"
          aria-label="Delete debt"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div className="mb-2 flex justify-between text-sm">
        <span className="text-gray-500">Loan Amount</span>
        <span className="font-medium">
          ${loanAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-gray-500">Total Paid</span>
        <span className="font-medium text-green-600">
          ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="mb-4 flex justify-between text-sm">
        <span className="text-gray-500">Remaining</span>
        <span className="font-medium text-gray-900">
          ${remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Progress Bar - Green (positive progress) */}
      <div className="mb-2">
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-300"
            style={{ width: `${Math.min(100, percentPaid)}%` }}
          />
        </div>
      </div>
      <p className="text-center text-sm font-medium text-green-600">
        Paid off: {percentPaid.toFixed(1)}%
      </p>
    </div>
  );
}

function CreditCardCard({ debt }: { debt: Debt }) {
  const [isPending, startTransition] = useTransition();

  const creditLimit = parseFloat(debt.balanceInitial);
  const availableCredit = parseFloat(debt.balanceCurrent);
  const usedAmount = Math.max(0, creditLimit - availableCredit);
  const utilization = creditLimit > 0 ? (usedAmount / creditLimit) * 100 : 0;

  const handleDelete = () => {
    if (confirm(`Delete "${debt.name}"?`)) {
      startTransition(async () => {
        await deleteDebt(debt.id);
      });
    }
  };

  // Utilization warning levels
  const getUtilizationColor = (util: number) => {
    if (util > 50) return "bg-red-500";
    if (util > 30) return "bg-orange-500";
    return "bg-red-400";
  };

  const getTextColor = (util: number) => {
    if (util > 30) return "text-red-600";
    return "text-gray-600";
  };

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
            Credit Card
          </span>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">
            {debt.name}
          </h3>
        </div>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-gray-400 hover:text-red-500 disabled:opacity-50"
          aria-label="Delete debt"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div className="mb-2 flex justify-between text-sm">
        <span className="text-gray-500">Credit Limit</span>
        <span className="font-medium">
          ${creditLimit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-gray-500">Available</span>
        <span className="font-medium text-green-600">
          ${availableCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="mb-4 flex justify-between text-sm">
        <span className="text-gray-500">Used</span>
        <span className={`font-medium ${getTextColor(utilization)}`}>
          ${usedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Utilization Bar - Red (risk indicator) */}
      <div className="mb-2">
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getUtilizationColor(utilization)}`}
            style={{ width: `${Math.min(100, utilization)}%` }}
          />
        </div>
      </div>
      <p className={`text-center text-sm font-medium ${getTextColor(utilization)}`}>
        Utilization: {utilization.toFixed(1)}%
        {utilization > 30 && (
          <span className="ml-1 text-xs text-orange-500">(High)</span>
        )}
      </p>
    </div>
  );
}

export function DebtCards({ debts }: DebtCardsProps) {
  const loans = debts.filter((d) => d.type === "LOAN");
  const creditCards = debts.filter((d) => d.type === "CREDIT_CARD");

  return (
    <div className="space-y-8">
      {loans.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-700">Loans</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loans.map((loan) => (
              <LoanCard key={loan.id} debt={loan} />
            ))}
          </div>
        </div>
      )}

      {creditCards.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-700">
            Credit Cards
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creditCards.map((cc) => (
              <CreditCardCard key={cc.id} debt={cc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
