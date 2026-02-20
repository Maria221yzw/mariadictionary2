import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Search, Trash2, Loader2, Plus, Copy, FilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CorpusWordModal from "@/components/CorpusWordModal";
import ManualMaterialModal from "@/components/ManualMaterialModal";

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

interface MaterialEntry {
  id: string;
  content: string;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
  category: string;
  created_at: string;
}

// Combined display item
type DisplayItem =
  | { type: "corpus"; data: CorpusEntry }
  | { type: "material"; data: MaterialEntry };

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

const CATEGORY_TO_KEY: Record<string, string> = {
  "考试专项": "exams",
  "学术领域": "academic",
  "翻译与写作": "writing",
  "日常与通用": "general",
};

export default function CorpusPage() {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [modalWord, setModalWord] = useState<{ word: string; vocabId: string; tags?: string[] } | null>(null);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [corpusRes, materialRes] = await Promise.all([
      supabase
        .from("corpus_entries")
        .select("*, vocab_table(id, word, phonetic, chinese_definition, mastery_level)")
        .order("created_at", { ascending: false }),
      supabase
        .from("material_entries" as any)
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (corpusRes.error) console.error(corpusRes.error);
    if (materialRes.error) console.error(materialRes.error);

    setEntries((corpusRes.data as any) || []);
    setMaterials((materialRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Build all display items combined
  const allItems = useMemo((): DisplayItem[] => {
    const corpusItems: DisplayItem[] = entries.map(e => ({ type: "corpus", data: e }));
    const matItems: DisplayItem[] = materials.map(m => ({ type: "material", data: m }));
    return [...corpusItems, ...matItems].sort((a, b) => {
      const aDate = a.type === "corpus" ? a.data.created_at : a.data.created_at;
      const bDate = b.type === "corpus" ? b.data.created_at : b.data.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [entries, materials]);

  // Categorize — corpus entries + material entries
  const categorized = useMemo(() => {
    const result: Record<string, { corpusEntries: CorpusEntry[]; materials: MaterialEntry[]; matchedTags: Set<string> }> = {};
    THEMATIC_CATEGORIES.forEach(cat => {
      result[cat.key] = { corpusEntries: [], materials: [], matchedTags: new Set() };
    });

    entries.forEach(entry => {
      let matched = false;
      const entryTags = (entry.custom_tags || []).map(t => t.toLowerCase());
      for (const cat of THEMATIC_CATEGORIES) {
        for (const tag of cat.tags) {
          if (entryTags.some(et => et.includes(tag.toLowerCase()) || tag.toLowerCase().includes(et))) {
            result[cat.key].corpusEntries.push(entry);
            result[cat.key].matchedTags.add(tag);
            matched = true; break;
          }
        }
        if (matched) break;
        if (cat.scenarios.includes(entry.application_scenario)) {
          result[cat.key].corpusEntries.push(entry);
          matched = true; break;
        }
      }
      if (!matched) result["general"].corpusEntries.push(entry);
    });

    materials.forEach(mat => {
      const key = CATEGORY_TO_KEY[mat.category] || "general";
      result[key].materials.push(mat);
      (mat.tags || []).forEach(t => result[key].matchedTags.add(t));
    });

    return result;
  }, [entries, materials]);

  // Apply filters + search
  const filtered = useMemo((): DisplayItem[] => {
    let pool: DisplayItem[] = allItems;

    if (activeCategory) {
      const cat = categorized[activeCategory];
      const corpusIds = new Set(cat.corpusEntries.map(e => e.id));
      const matIds = new Set(cat.materials.map(m => m.id));
      pool = pool.filter(item =>
        (item.type === "corpus" && corpusIds.has(item.data.id)) ||
        (item.type === "material" && matIds.has(item.data.id))
      );
    }

    if (activeSubTag) {
      pool = pool.filter(item => {
        const tags = item.type === "corpus"
          ? (item.data.custom_tags || [])
          : (item.data.tags || []);
        return tags.some(t => t.toLowerCase().includes(activeSubTag.toLowerCase()));
      });
    }

    if (search) {
      const q = search.toLowerCase();
      pool = pool.filter(item => {
        if (item.type === "corpus") {
          const word = item.data.vocab_table?.word || "";
          const def = item.data.vocab_table?.chinese_definition || "";
          const tags = (item.data.custom_tags || []).join(" ");
          const notes = item.data.personal_notes || "";
          return word.toLowerCase().includes(q) || def.includes(q) || tags.toLowerCase().includes(q) || notes.toLowerCase().includes(q);
        } else {
          const content = item.data.content || "";
          const notes = item.data.notes || "";
          const source = item.data.source || "";
          const tags = (item.data.tags || []).join(" ");
          return content.toLowerCase().includes(q) || notes.toLowerCase().includes(q) || source.toLowerCase().includes(q) || tags.toLowerCase().includes(q);
        }
      });
    }

    return pool;
  }, [allItems, activeCategory, activeSubTag, search, categorized]);

  const handleDeleteCorpus = async (id: string) => {
    const { error } = await supabase.from("corpus_entries").delete().eq("id", id);
    if (error) toast.error("删除失败");
    else { setEntries(prev => prev.filter(e => e.id !== id)); toast.success("已删除"); }
  };

  const handleDeleteMaterial = async (id: string) => {
    const { error } = await supabase.from("material_entries" as any).delete().eq("id", id);
    if (error) toast.error("删除失败");
    else { setMaterials(prev => prev.filter(m => m.id !== id)); toast.success("已删除"); }
  };

  const handleCopyMaterial = (content: string) => {
    navigator.clipboard.writeText(content).then(() => toast.success("已复制到剪贴板")).catch(() => toast.error("复制失败"));
  };

  const toggleExpandMaterial = (id: string) => {
    setExpandedMaterial(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const clearFilters = () => { setActiveCategory(null); setActiveSubTag(null); };

  const totalCount = entries.length + materials.length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">语料仓库</h2>
          </div>
          <button
            onClick={() => setShowMaterialModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            录入素材
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          共 {totalCount} 条语料 · {entries.length} 个单词 · {materials.length} 条素材
        </p>

        {/* Thematic Category Cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {THEMATIC_CATEGORIES.map(cat => {
            const catData = categorized[cat.key];
            const count = (catData?.corpusEntries.length || 0) + (catData?.materials.length || 0);
            const isActive = activeCategory === cat.key;
            const matchedTags = Array.from(catData?.matchedTags || []);
            return (
              <button
                key={cat.key}
                onClick={() => { setActiveCategory(isActive ? null : cat.key); setActiveSubTag(null); }}
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
                    {matchedTags.length > 3 && <span className="text-[9px] text-muted-foreground">+{matchedTags.length - 3}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-tag chips */}
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
            placeholder="搜索单词、素材内容、来源标签..."
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
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={() => navigate("/")} className="text-primary text-sm hover:underline">去查词添加</button>
              <span className="text-muted-foreground text-xs">·</span>
              <button onClick={() => setShowMaterialModal(true)} className="text-primary text-sm hover:underline">手动录入素材</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {filtered.map(item => {
                if (item.type === "corpus") {
                  const entry = item.data;
                  return (
                    <motion.div
                      key={`corpus-${entry.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-card rounded-xl shadow-warm overflow-hidden border border-border cursor-pointer hover:border-primary/30 hover:bg-muted/30 transition-all"
                      onClick={() => {
                        if (entry.vocab_table) {
                          setModalWord({ word: entry.vocab_table.word, vocabId: entry.vocab_table.id, tags: entry.custom_tags || [] });
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
                            onClick={(e) => { e.stopPropagation(); handleDeleteCorpus(entry.id); }}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          <span className="tag-chip text-[10px]">{entry.application_scenario}</span>
                          {entry.custom_tags?.map(tag => (
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
                  );
                } else {
                  // Material card
                  const mat = item.data;
                  const isExpanded = expandedMaterial.has(mat.id);
                  const isLong = mat.content.length > 120;
                  return (
                    <motion.div
                      key={`mat-${mat.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-card rounded-xl shadow-warm border border-primary/10 overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <FilePlus className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-[10px] font-medium text-primary">私人语料</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleCopyMaterial(mat.content)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="复制语料"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteMaterial(mat.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Content with truncation */}
                        <p
                          className={`text-sm text-foreground leading-relaxed font-medium ${
                            isLong && !isExpanded ? "line-clamp-2" : ""
                          }`}
                        >
                          {mat.content}
                        </p>
                        {isLong && (
                          <button
                            onClick={() => toggleExpandMaterial(mat.id)}
                            className="text-xs text-primary mt-1 hover:underline"
                          >
                            {isExpanded ? "收起" : "展开全文"}
                          </button>
                        )}

                        {/* Notes */}
                        {mat.notes && (
                          <p className="text-xs text-muted-foreground mt-2">📝 {mat.notes}</p>
                        )}

                        {/* Tags row */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          <span className="tag-chip text-[10px]">{mat.category}</span>
                          {mat.source && (
                            <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px]">
                              📖 {mat.source}
                            </span>
                          )}
                          {mat.tags?.filter(t => t !== mat.source).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  );
                }
              })}
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

      {/* Manual material modal */}
      {showMaterialModal && (
        <ManualMaterialModal
          onClose={() => setShowMaterialModal(false)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
