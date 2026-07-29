import { Link, useLocation } from "react-router-dom";
import { Search, Library, User, Menu, X, Plus, LogIn, LogOut, Shield } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/use-admin";
import LogoIcon from "./LogoIcon";

const navItems = [
  { to: "/", label: "Discover", icon: null },
  { to: "/search", label: "Browse", icon: Search },
  { to: "/library", label: "My shelf", icon: Library },
  { to: "/profile", label: "Profile", icon: User },
];

export default function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();

  const closeMobileNav = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="container flex h-[4.5rem] items-center justify-between">
        <Link to="/" className="group flex items-center gap-3" aria-label="Manga Sanctuary home">
          <LogoIcon size={38} />
          <div className="flex flex-col leading-none">
            <span className="font-serif text-[1.05rem] font-bold tracking-[-0.03em] text-foreground">
              Manga Sanctuary
            </span>
            <span className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Read / track / return
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.icon && <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />}
                {item.label}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-x-3 -bottom-[0.94rem] h-0.5 bg-primary"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                  />
                )}
              </Link>
            );
          })}

          {user && (
            <Link to="/submit" className="ml-3 inline-flex min-h-11 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-[0.08em] text-foreground transition-colors hover:border-primary hover:text-primary">
              <Plus className="h-4 w-4" strokeWidth={1.8} />
              Submit
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="ml-1 inline-flex min-h-11 items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground">
              <Shield className="h-4 w-4" strokeWidth={1.8} />
              Admin
            </Link>
          )}
          {user ? (
            <button onClick={signOut} className="ml-1 inline-flex min-h-11 items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground">
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              Sign out
            </button>
          ) : (
            <Link to="/auth" className="ml-3 inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground transition-transform active:translate-y-px">
              <LogIn className="h-4 w-4" strokeWidth={1.8} />
              Sign in
            </Link>
          )}
        </nav>

        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            id="mobile-navigation"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border bg-background md:hidden"
            aria-label="Mobile navigation"
          >
            <div className="container flex flex-col py-3">
              {navItems.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link key={item.to} to={item.to} onClick={closeMobileNav} className={`flex min-h-12 items-center justify-between border-b border-border/60 px-1 text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                    {item.label}
                    {item.icon && <item.icon className="h-4 w-4" strokeWidth={1.8} />}
                  </Link>
                );
              })}
              {user ? (
                <>
                  <Link to="/submit" onClick={closeMobileNav} className="mt-3 flex min-h-12 items-center justify-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground">
                    <Plus className="h-4 w-4" /> Submit manga
                  </Link>
                  {isAdmin && <Link to="/admin" onClick={closeMobileNav} className="flex min-h-12 items-center gap-2 px-1 text-sm text-muted-foreground"><Shield className="h-4 w-4" /> Admin</Link>}
                  <button onClick={() => { signOut(); closeMobileNav(); }} className="flex min-h-12 items-center gap-2 px-1 text-sm text-muted-foreground"><LogOut className="h-4 w-4" /> Sign out</button>
                </>
              ) : (
                <Link to="/auth" onClick={closeMobileNav} className="mt-3 flex min-h-12 items-center justify-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground"><LogIn className="h-4 w-4" /> Sign in</Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
