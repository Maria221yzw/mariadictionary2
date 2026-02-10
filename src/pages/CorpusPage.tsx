import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Filter, Search, Trash2 } from "lucide-react";
import { mockCorpus, type CorpusItem } from "@/lib/mockData";
import { useNavigate } from "react-router-dom";

const typeFilters = ["全部", "单词", "固定搭配", "语法点", "优美句式"] as const;
const categoryFilters = ["全部", "文学评论", "新闻翻译", "经济", "学术写作"] as const;

function MasteryBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-primary" : value >= 50 ? "bg-warm-gold" : "bg-soft-rose";
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

export default function CorpusPage() {
  const [typeFilter, setTypeFilter] = useState<string>("全部");
  const [catFilter, setCatFilter] = useState<string>("全部");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = mockCorpus.filter(item => {
    if (typeFilter !== "全部" && item.type !== typeFilter) return false;
    if (catFilter !== "全部" && item.category !== catFilter) return false;
    if (search && !item.content.toLowerCase().includes(search.toLowerCase()) && !item.meaning.includes(search)) return false;
    return true;
  });

  const stats = {
    total: mockCorpus.length,
    mastered: mockCorpus.filter(i => i.mastery >= 80).length,
    avgMastery: Math.round(mockCorpus.reduce((a, b) => a + b.mastery, 0) / mockCorpus.length),
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-2">
          <Library className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-display font-bold text-foreground">我的语料库</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          共 {stats.total} 条语料 · {stats.mastered} 条已掌握 · 平均掌握度 {stats.avgMastery}%
        </p>

        {/* Search + filters */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索语料..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card py-2.5 pl-10 pr-4 text-sm rounded-xl shadow-warm outline-none border focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex gap-4 mb-6 overflow-x-auto pb-1">
          <div className="flex gap-1.5 shrink-0">
            <Filter className="h-4 w-4 text-muted-foreground mt-1" />
            {typeFilters.map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${typeFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {categoryFilters.map(f => (
            <button
              key={f}
              onClick={() => setCatFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${catFilter === f ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Corpus items */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((item) => (
              <CorpusCard key={item.id} item={item} navigate={navigate} />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-12">没有匹配的语料</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function CorpusCard({ item, navigate }: { item: CorpusItem; navigate: any }) {
  const typeColors: Record<string, string> = {
    "单词": "bg-primary/10 text-primary",
    "固定搭配": "bg-warm-gold/15 text-warm-gold",
    "语法点": "bg-soft-rose/15 text-soft-rose",
    "优美句式": "bg-emerald-glow/15 text-emerald-glow",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-card rounded-xl p-4 shadow-warm cursor-pointer hover:shadow-warm-lg transition-shadow"
      onClick={() => item.type === "单词" && navigate(`/word/${item.content.toLowerCase()}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium ${typeColors[item.type] || "bg-muted text-muted-foreground"}`}>
            {item.type}
          </span>
          <h3 className="text-base font-semibold text-foreground mt-1">{item.content}</h3>
          <p className="text-sm text-muted-foreground">{item.meaning}</p>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.savedAt}</span>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <MasteryBar value={item.mastery} />
        <span className="text-[10px] text-muted-foreground w-8 text-right">{item.mastery}%</span>
      </div>
      <div className="flex gap-1.5 mt-2">
        {item.tags.slice(0, 3).map(tag => (
          <span key={tag} className="tag-chip text-[10px]">{tag}</span>
        ))}
      </div>
    </motion.div>
  );
}
