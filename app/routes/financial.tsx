import { Link, Outlet, useLocation } from "react-router";
import { cn } from "@/app/lib/utils";

const tabs = [
  { href: "/financial", label: "Transactions", exact: true },
  { href: "/financial/recurring", label: "Recurring" },
  { href: "/financial/budgets", label: "Budgets" },
  { href: "/financial/accounts", label: "Accounts" },
  { href: "/financial/debts", label: "Debts" },
];

export default function FinancialLayout() {
  const location = useLocation();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="mb-6 animate-fade-in">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Financial
        </h1>
        <p className="mt-1 text-muted-foreground">
          Transactions, budgets, accounts, and debts for your household
        </p>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const active =
            "exact" in tab && tab.exact
              ? location.pathname === tab.href
              : location.pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              to={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </main>
  );
}
