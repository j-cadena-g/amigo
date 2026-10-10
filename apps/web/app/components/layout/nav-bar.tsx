import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/react-router";
import {
  ChevronDown,
  House,
  Settings,
  ShoppingBasket,
  Wallet,
} from "lucide-react";
import { useT, type Messages } from "@/app/i18n";
import { cn } from "@/app/lib/utils";
import { Wordmark } from "@/app/components/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

const navLinks = [
  { href: "/dashboard", label: (t: Messages) => t.nav.home, icon: House },
  { href: "/groceries", label: (t: Messages) => t.nav.groceries, icon: ShoppingBasket },
  { href: "/financial", label: (t: Messages) => t.nav.money, icon: Wallet },
  { href: "/settings", label: (t: Messages) => t.nav.settings, icon: Settings },
];

function isNavLinkActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  if (href === "/financial") {
    return (
      pathname === "/financial" ||
      pathname.startsWith("/financial/") ||
      pathname === "/budget" ||
      pathname.startsWith("/budget/") ||
      pathname === "/assets" ||
      pathname === "/debts" ||
      pathname === "/accounts"
    );
  }

  return pathname.startsWith(href);
}

export function NavBar() {
  const t = useT();
  const location = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const displayName =
    user?.firstName || user?.emailAddresses[0]?.emailAddress || t.nav.account;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="container mx-auto flex h-14 items-stretch gap-8 px-4 md:px-6">
          <Link
            to="/dashboard"
            aria-label={t.nav.homeLink}
            className="flex items-center self-center rounded-sm"
          >
            <Wordmark />
          </Link>

          <nav aria-label={t.nav.main} className="hidden flex-1 items-stretch gap-6 md:flex">
            {navLinks.map((link) => {
              const active = isNavLinkActive(location.pathname, link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5",
                    active
                      ? "text-foreground after:bg-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {link.label(t)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-h-11 pointer-fine:min-h-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="max-w-40 truncate">{displayName}</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem asChild>
                  <Link to="/settings">{t.nav.settings}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  {t.nav.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <nav
        aria-label={t.nav.main}
        data-bottom-bar=""
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid h-16 grid-cols-4">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isNavLinkActive(location.pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors before:absolute before:inset-x-4 before:top-0 before:h-0.5",
                  active
                    ? "text-foreground before:bg-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {link.label(t)}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
