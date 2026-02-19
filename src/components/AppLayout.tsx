import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Search, Library, Sparkles, Layers, BookOpen, User, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupaUser } from "@supabase/supabase-js";

const navItems = [
  { path: "/", icon: Search, label: "搜索" },
  { path: "/corpus", icon: Library, label: "语料仓库" },
  { path: "/review", icon: Sparkles, label: "回顾" },
  { path: "/combo-review", icon: Layers, label: "组合" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<SupaUser | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-6 w-6 text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-display font-semibold tracking-tight text-foreground">
            语境<span className="text-primary">·</span>Corpus
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink key={item.path} to={item.path} className="relative px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  {isActive && (
                    <motion.div layoutId="nav-pill" className="absolute inset-0 bg-primary/10 rounded-lg" transition={{ type: "spring", bounce: 0.15, duration: 0.5 }} />
                  )}
                  <span className={`relative z-10 flex items-center gap-1.5 ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </nav>
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted">
              <LogOut className="h-3.5 w-3.5" />
              退出
            </button>
          ) : (
            <button onClick={() => navigate("/auth")} className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity px-3 py-1.5 rounded-lg bg-primary/10">
              <User className="h-3.5 w-3.5" />
              登录
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t z-50 px-2 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink key={item.path} to={item.path} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
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
