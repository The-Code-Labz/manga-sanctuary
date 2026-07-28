import { Link, useLocation } from "react-router-dom";
import { Search, Library, User, Menu, X, PlusCircle, LogIn, LogOut, Shield } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/use-admin";
import LogoIcon from "./LogoIcon";

const navItems = [
  { to: "/", label: "Home", icon: null },
  { to: "/search", label: "Explore", icon: Search },
  { to: "/library", label: "Library", icon: Library },
  { to: "/profile", label: "Profile", icon: User },
];

export default function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-2xl">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <LogoIcon size={36} />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-base tracking-tight gradient-neon-text">
              MyMangaHub
            </span>
            <span className="text-[9px] text-muted-foreground/60 tracking-[0.2em] uppercase font-medium">
              Manga Library
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {item.icon && <item.icon className="h-4 w-4" />}
                {item.label}
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 gradient-neon rounded-full"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
              </Link>
            );
          })}
          {user && (
            <Link
              to="/submit"
              className="ml-2 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold gradient-neon text-white hover:opacity-90 transition-all duration-300 glow-purple"
            >
              <PlusCircle className="h-4 w-4" />
              Submit
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className="ml-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-golden hover:bg-golden/10 transition-all duration-300"
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
          {user ? (
            <button
              onClick={signOut}
              className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-300"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          ) : (
            <Link
              to="/auth"
              className="ml-2 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold gradient-neon text-white hover:opacity-90 transition-all duration-300 glow-purple"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </Link>
          )}
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-border/50 overflow-hidden bg-background/80 backdrop-blur-xl"
          >
            <div className="container py-3 flex flex-col gap-1">
              {navItems.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {item.icon && <item.icon className="h-4 w-4" />}
                    {item.label}
                  </Link>
                );
              })}
              {user ? (
                <>
                  <Link
                    to="/submit"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold gradient-neon text-white mt-1"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Submit Manga
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm text-golden"
                    >
                      <Shield className="h-4 w-4" />
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={() => { signOut(); setMobileOpen(false); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold gradient-neon text-white mt-1"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}