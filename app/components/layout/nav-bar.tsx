import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/react-router";
import {
  LayoutDashboard,
  Wallet,
  ShoppingCart,
  CreditCard,
  Landmark,
  CalendarDays,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/app/lib/utils";
import { Button } from "@/app/components/ui/button";
import { ModeToggle } from "@/app/components/mode-toggle";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/groceries", label: "Groceries", icon: ShoppingCart },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/assets", label: "Assets", icon: Landmark },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center px-4 md:px-6">
        {/* Brand */}
        <Link
          to="/dashboard"
          className="group mr-8 flex items-center gap-2"
        >
          <img
            src="/icon-1024.png"
            alt="amigo"
            className="h-8 w-8 rounded-lg shadow-sm shadow-primary/20 transition-transform group-hover:scale-105"
          />
          <span className="font-display font-bold text-xl tracking-tight">
            amigo
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = link.href === "/budget"
              ? location.pathname.startsWith("/budget")
              : link.href === "/dashboard"
                ? location.pathname === "/dashboard"
                : location.pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{link.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>

        {/* User info + theme + sign out */}
        <div className="hidden md:flex items-center gap-3 ml-auto">
          <span className="text-sm font-medium text-muted-foreground">
            {user?.firstName || user?.emailAddresses[0]?.emailAddress}
          </span>
          <div className="h-5 w-px bg-border" />
          <ModeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden ml-auto"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl px-4 pb-4 pt-2 animate-fade-in">
          <div className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = link.href === "/budget"
                ? location.pathname.startsWith("/budget")
                : link.href === "/dashboard"
                  ? location.pathname === "/dashboard"
                  : location.pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
            <ModeToggle />
          </div>
        </div>
      )}
    </nav>
  );
}
