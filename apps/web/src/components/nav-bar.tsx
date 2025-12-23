"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ShoppingCart,
  CreditCard,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { ModeToggle } from "./mode-toggle";

interface NavBarProps {
  userName: string | null;
  userEmail: string;
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/groceries", label: "Groceries", icon: ShoppingCart },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavBar({ userName, userEmail }: NavBarProps) {
  const pathname = usePathname();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const displayName = userName ?? userEmail;

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">amigo</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-6">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Theme Toggle & User Profile (Desktop) */}
          <div className="hidden md:flex md:items-center md:gap-2">
            <ModeToggle />
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[150px] truncate">{displayName}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    isProfileOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-md bg-popover shadow-lg ring-1 ring-border">
                    <div className="px-4 py-3 border-b">
                      <p className="text-sm font-medium text-foreground truncate">
                        {userName ?? "User"}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {userEmail}
                      </p>
                    </div>
                    <div className="py-1">
                      <a
                        href="/api/auth/logout"
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-accent"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t py-4">
            <div className="space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                      isActive
                        ? "bg-accent text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground truncate">
                    {userName ?? "User"}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
                </div>
                <ModeToggle />
              </div>
              <a
                href="/api/auth/logout"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
