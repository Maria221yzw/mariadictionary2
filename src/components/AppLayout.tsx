import { NavLink, useLocation } from "react-router-dom";
import { Search, BookOpen, Library, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { path: "/", icon: Search, label: "搜索", labelEn: "Search" },
  { path: "/corpus", icon: Library, label: "语料库", labelEn: "Corpus" },
  { path: "/review", icon: Sparkles, label: "回顾", labelEn: "Review" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-6 w-6 text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-display font-semibold tracking-tight text-foreground">
            语境<span className="text-primary">·</span>Corpus
          </h1>
        </div>
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="relative px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-primary/10 rounded-lg"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <span className={`relative z-10 flex items-center gap-1.5 ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t z-50 px-2 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
