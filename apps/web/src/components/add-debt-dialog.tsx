"use client";

import { useState, useTransition } from "react";
import { addDebt } from "@/actions/debts";

type DebtTab = "LOAN" | "CREDIT_CARD";

export function AddDebtDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DebtTab>("LOAN");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Loan fields
  const [loanName, setLoanName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [totalPaid, setTotalPaid] = useState("");

  // Credit card fields
  const [ccName, setCcName] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [availableCredit, setAvailableCredit] = useState("");

  const resetForm = () => {
    setLoanName("");
    setLoanAmount("");
    setTotalPaid("");
    setCcName("");
    setCreditLimit("");
    setAvailableCredit("");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        if (activeTab === "LOAN") {
          await addDebt({
            type: "LOAN",
            name: loanName,
            loanAmount: parseFloat(loanAmount),
            totalPaid: parseFloat(totalPaid) || 0,
          });
        } else {
          await addDebt({
            type: "CREDIT_CARD",
            name: ccName,
            creditLimit: parseFloat(creditLimit),
            availableCredit: parseFloat(availableCredit),
          });
        }
        resetForm();
        setIsOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add debt");
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Add Debt
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Add Debt</h2>
          <button
            onClick={() => {
              resetForm();
              setIsOpen(false);
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("LOAN")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === "LOAN"
                ? "bg-white text-blue-600 shadow"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Loan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CREDIT_CARD")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === "CREDIT_CARD"
                ? "bg-white text-purple-600 shadow"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Credit Card
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "LOAN" ? (
            <>
              <div>
                <label
                  htmlFor="loanName"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Loan Name
                </label>
                <input
                  id="loanName"
                  type="text"
                  value={loanName}
                  onChange={(e) => setLoanName(e.target.value)}
                  placeholder="e.g., Car Loan, Mortgage"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="loanAmount"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Loan Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    id="loanAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gray-300 py-2 pl-7 pr-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="totalPaid"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Total Paid
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    id="totalPaid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalPaid}
                    onChange={(e) => setTotalPaid(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gray-300 py-2 pl-7 pr-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  How much have you paid so far?
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label
                  htmlFor="ccName"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Card Name
                </label>
                <input
                  id="ccName"
                  type="text"
                  value={ccName}
                  onChange={(e) => setCcName(e.target.value)}
                  placeholder="e.g., Chase Sapphire, Amex Gold"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="creditLimit"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Credit Limit
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    id="creditLimit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gray-300 py-2 pl-7 pr-3 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="availableCredit"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Available Credit
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    id="availableCredit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={availableCredit}
                    onChange={(e) => setAvailableCredit(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gray-300 py-2 pl-7 pr-3 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  How much credit is currently available?
                </p>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsOpen(false);
              }}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                activeTab === "LOAN"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
