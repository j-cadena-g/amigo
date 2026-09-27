import { Link, type MetaArgs, Outlet, useLocation } from "react-router";
import { cn } from "@/app/lib/utils";
import { type Messages, pageTitle, useT } from "@/app/i18n";

const tabs = [
  { href: "/financial", label: (t: Messages) => t.nav.transactions, exact: true },
  { href: "/financial/recurring", label: (t: Messages) => t.nav.recurring },
  { href: "/financial/budgets", label: (t: Messages) => t.nav.budgets },
  { href: "/financial/accounts", label: (t: Messages) => t.nav.accounts },
  { href: "/financial/debts", label: (t: Messages) => t.nav.debts },
];

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.money);
}

export default function FinancialLayout() {
  const t = useT();
  const location = useLocation();

  return (
    <main className="container mx-auto px-4 py-6 md:px-6 md:py-8">
      <h1 className="type-display mb-6 text-title-sm md:text-title">{t.nav.money}</h1>

      {/* The padding keeps focus outlines inside the scroll container's clip. */}
      <nav
        aria-label={t.nav.money}
        className="-mx-1 mb-5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full gap-6 border-b border-border">
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
                  "relative shrink-0 whitespace-nowrap py-2.5 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5",
                  active
                    ? "text-foreground after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label(t)}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="max-w-3xl">
        <Outlet />
      </div>
    </main>
  );
}
