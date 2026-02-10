import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Bookmark, AlertTriangle, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchSuggestions, mockWords } from "@/lib/mockData";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    return searchSuggestions.filter(w =>
      w.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const handleSearch = (word?: string) => {
    const target = (word || query).trim().toLowerCase();
    if (target && mockWords[target]) {
      navigate(`/word/${target}`);
    }
  };

  const recentWords = ["Subtle", "Ameliorate", "Alleviate"];

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-65px)] px-4 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-xl text-center"
      >
        <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight mb-3 text-foreground">
          捕获每一个<br />
          <span className="text-gradient-primary">语言灵感</span>
        </h2>
        <p className="text-muted-foreground mb-10 text-base">
          搜索、标记、内化 — 构建你的专属语料库
        </p>

        <div className="relative">
          <div className={`relative flex items-center bg-card rounded-2xl shadow-warm transition-shadow duration-300 ${focused ? "shadow-warm-lg ring-2 ring-primary/20" : ""}`}>
            <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="输入英文或中文搜索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-transparent py-4 pl-12 pr-14 text-base font-body text-foreground placeholder:text-muted-foreground outline-none rounded-2xl"
            />
            <button
              onClick={() => handleSearch()}
              className="absolute right-3 p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <AnimatePresence>
            {focused && filtered.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-2 bg-card rounded-xl shadow-warm-lg border overflow-hidden z-30"
              >
                {filtered.map((word) => (
                  <button
                    key={word}
                    onMouseDown={() => handleSearch(word)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors text-sm"
                  >
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">{word}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Quick actions */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {recentWords.map((word, i) => (
            <motion.button
              key={word}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              onClick={() => handleSearch(word)}
              className="tag-chip cursor-pointer hover:opacity-80 transition-opacity"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              {word}
            </motion.button>
          ))}
        </div>

        {/* Feature hints */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-16 grid grid-cols-2 gap-4 text-left"
        >
          <div className="bg-card rounded-xl p-4 shadow-warm">
            <Bookmark className="h-5 w-5 text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">即时收藏</p>
            <p className="text-xs text-muted-foreground mt-1">查词后一键存入语料库</p>
          </div>
          <div className="bg-card rounded-xl p-4 shadow-warm">
            <AlertTriangle className="h-5 w-5 text-accent mb-2" />
            <p className="text-sm font-medium text-foreground">标记难点</p>
            <p className="text-xs text-muted-foreground mt-1">标注难词，集中攻克</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
