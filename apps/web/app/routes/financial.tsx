import { Link, Outlet, useLocation } from "react-router";
import { cn } from "@/app/lib/utils";

const tabs = [
  { href: "/financial", label: "Transactions", exact: true },
  { href: "/financial/recurring", label: "Recurring" },
  { href: "/financial/budgets", label: "Budgets" },
  { href: "/financial/accounts", label: "Accounts" },
  { href: "/financial/debts", label: "Debts" },
];

export function meta() {
  return [{ title: "Financial · amigo" }];
}

export default function FinancialLayout() {
  const location = useLocation();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <h1 className="type-display mb-6 text-title-sm md:text-title">Financial</h1>

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
