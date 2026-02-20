import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Search, Trash2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CorpusWordModal from "@/components/CorpusWordModal";

interface CorpusEntry {
  id: string;
  application_scenario: string;
  source_text: string | null;
  personal_notes: string | null;
  custom_tags: string[] | null;
  difficulty_level: string;
  created_at: string;
  vocab_table: {
    id: string;
    word: string;
    phonetic: string | null;
    chinese_definition: string;
    mastery_level: number;
  } | null;
}

// Thematic categories with tag mappings
const THEMATIC_CATEGORIES = [
  {
    key: "exams",
    label: "考试专项",
    icon: "📝",
    tags: ["雅思", "托福", "四六级", "考研", "GRE", "SAT", "TOEFL", "IELTS", "专四", "专八"],
    scenarios: [] as string[],
  },
  {
    key: "academic",
    label: "学术领域",
    icon: "🎓",
    tags: ["医学", "法律", "生物", "地质", "物理", "化学", "计算机", "经济", "心理学", "哲学", "历史", "文学"],
    scenarios: ["专业课笔记"],
  },
  {
    key: "writing",
    label: "翻译与写作",
    icon: "✍️",
    tags: ["翻译练习", "写作词汇", "正式表达", "学术写作", "论文"],
    scenarios: ["学术写作", "翻译练习"],
  },
  {
    key: "general",
    label: "日常与通用",
    icon: "💬",
    tags: ["口语", "日常生活", "旅行", "社交"],
    scenarios: ["日常口语"],
  },
];

export default function CorpusPage() {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [modalWord, setModalWord] = useState<{ word: string; vocabId: string; tags?: string[] } | null>(null);
  const navigate = useNavigate();

  const fetchEntries = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("corpus_entries")
      .select("*, vocab_table(id, word, phonetic, chinese_definition, mastery_level)")
      .order("created_at", { ascending: false });

    if (error) { console.error(error); toast.error("加载语料失败"); }
    setEntries((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  // Categorize entries
  const categorized = useMemo(() => {
    const result: Record<string, { entries: CorpusEntry[]; matchedTags: Set<string> }> = {};
    const uncategorized: CorpusEntry[] = [];

    THEMATIC_CATEGORIES.forEach(cat => {
      result[cat.key] = { entries: [], matchedTags: new Set() };
    });

    entries.forEach(entry => {
      let matched = false;
      const entryTags = (entry.custom_tags || []).map(t => t.toLowerCase());

      for (const cat of THEMATIC_CATEGORIES) {
        // Check by tag
        for (const tag of cat.tags) {
          if (entryTags.some(et => et.includes(tag.toLowerCase()) || tag.toLowerCase().includes(et))) {
            result[cat.key].entries.push(entry);
            result[cat.key].matchedTags.add(tag);
            matched = true;
            break;
          }
        }
        if (matched) break;

        // Check by scenario
        if (cat.scenarios.includes(entry.application_scenario)) {
          result[cat.key].entries.push(entry);
          matched = true;
          break;
        }
      }

      if (!matched) uncategorized.push(entry);
    });

    // Put uncategorized into "general"
    result["general"].entries.push(...uncategorized);

    return result;
  }, [entries]);

  // Apply filters
  const filtered = useMemo(() => {
    let pool = entries;

    if (activeCategory) {
      pool = categorized[activeCategory]?.entries || [];
    }

    if (activeSubTag) {
      pool = pool.filter(e => (e.custom_tags || []).some(t => t.toLowerCase().includes(activeSubTag.toLowerCase())));
    }

    if (search) {
      const q = search.toLowerCase();
      pool = pool.filter(e => {
        const word = e.vocab_table?.word || "";
        const def = e.vocab_table?.chinese_definition || "";
        return word.toLowerCase().includes(q) || def.includes(search);
      });
    }

    return pool;
  }, [entries, activeCategory, activeSubTag, search, categorized]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("corpus_entries").delete().eq("id", id);
    if (error) { toast.error("删除失败"); }
    else { setEntries(prev => prev.filter(e => e.id !== id)); toast.success("已删除"); }
  };

  const clearFilters = () => {
    setActiveCategory(null);
    setActiveSubTag(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-2">
          <Library className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-display font-bold text-foreground">语料仓库</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">共 {entries.length} 条语料 · 按主题分类管理</p>

        {/* ===== Thematic Category Cards ===== */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {THEMATIC_CATEGORIES.map(cat => {
            const catData = categorized[cat.key];
            const count = catData?.entries.length || 0;
            const isActive = activeCategory === cat.key;
            const matchedTags = Array.from(catData?.matchedTags || []);

            return (
              <button
                key={cat.key}
                onClick={() => {
                  setActiveCategory(isActive ? null : cat.key);
                  setActiveSubTag(null);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isActive
                    ? "bg-primary/8 border-primary/30 ring-1 ring-primary/20"
                    : "bg-card border-border hover:border-primary/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-lg font-bold text-foreground">{count}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{cat.label}</p>
                {matchedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {matchedTags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{tag}</span>
                    ))}
                    {matchedTags.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{matchedTags.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-tag chips when category is active */}
        {activeCategory && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                {THEMATIC_CATEGORIES.find(c => c.key === activeCategory)?.label} 子项
              </span>
              <button onClick={clearFilters} className="text-xs text-primary hover:underline">清除筛选</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(categorized[activeCategory]?.matchedTags || []).map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveSubTag(activeSubTag === tag ? null : tag)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    activeSubTag === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索语料..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            className="w-full bg-card py-2.5 pl-10 pr-4 text-sm rounded-xl shadow-warm outline-none border focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <p className="text-xs text-muted-foreground mb-3">显示 {filtered.length} 条结果</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">暂无语料</p>
            <button onClick={() => navigate("/")} className="text-primary text-sm mt-2 hover:underline">去搜索并添加</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {filtered.map(entry => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-card rounded-xl shadow-warm overflow-hidden border border-border cursor-pointer hover:border-primary/30 hover:bg-muted/30 transition-all"
                  onClick={() => {
                    if (entry.vocab_table) {
                      setModalWord({
                        word: entry.vocab_table.word,
                        vocabId: entry.vocab_table.id,
                        tags: entry.custom_tags || [],
                      });
                    }
                  }}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{entry.vocab_table?.word}</h3>
                          {entry.vocab_table?.phonetic && (
                            <span className="text-[10px] text-muted-foreground">{entry.vocab_table.phonetic}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{entry.vocab_table?.chinese_definition}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Tags row — scenario + custom tags */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="tag-chip text-[10px]">{entry.application_scenario}</span>
                      {entry.custom_tags && entry.custom_tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">#{tag}</span>
                      ))}
                    </div>

                    {entry.source_text && (
                      <p className="text-xs text-muted-foreground mt-2">来源：{entry.source_text}</p>
                    )}
                    {entry.personal_notes && (
                      <p className="text-xs text-foreground/70 mt-1 line-clamp-2">📝 {entry.personal_notes}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Word detail modal */}
      {modalWord && (
        <CorpusWordModal
          word={modalWord.word}
          vocabId={modalWord.vocabId}
          corpusTags={modalWord.tags}
          onClose={() => setModalWord(null)}
          onSearchWord={(w) => {
            setModalWord(null);
            navigate(`/word/${encodeURIComponent(w.toLowerCase())}`);
          }}
        />
      )}
    </div>
  );
}
