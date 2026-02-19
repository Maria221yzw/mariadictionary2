import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Filter, Search, Trash2, Loader2, BookOpen, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

const MASTERY_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-emerald-400",
  5: "bg-emerald-600",
};

const MASTERY_TEXT_COLORS: Record<number, string> = {
  1: "text-red-500",
  2: "text-orange-500",
  3: "text-yellow-500",
  4: "text-emerald-400",
  5: "text-emerald-600",
};

const MASTERY_BG_LIGHT: Record<number, string> = {
  1: "bg-red-500/10",
  2: "bg-orange-500/10",
  3: "bg-yellow-500/10",
  4: "bg-emerald-400/10",
  5: "bg-emerald-600/10",
};

const MASTERY_LABELS: Record<number, string> = {
  1: "陌生",
  2: "模糊",
  3: "认知",
  4: "运用",
  5: "熟练",
};

export default function CorpusPage() {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [masteryFilter, setMasteryFilter] = useState<number | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchEntries = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("corpus_entries")
      .select("*, vocab_table(id, word, phonetic, chinese_definition, mastery_level)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("加载语料失败");
    }
    setEntries((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  // Stats computation
  const masteryStats = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    entries.forEach(e => {
      const lvl = e.vocab_table?.mastery_level ?? 1;
      if (counts[lvl] !== undefined) counts[lvl]++;
    });
    return counts;
  }, [entries]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    entries.forEach(e => e.custom_tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet);
  }, [entries]);

  // Time helpers
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const timeFilteredCount = useMemo(() => ({
    week: entries.filter(e => new Date(e.created_at) >= weekAgo).length,
    month: entries.filter(e => new Date(e.created_at) >= monthAgo).length,
  }), [entries]);

  // Scenario counts
  const scenarioCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach(e => {
      counts[e.application_scenario] = (counts[e.application_scenario] || 0) + 1;
    });
    return counts;
  }, [entries]);

  // Apply all filters
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (masteryFilter !== null && (e.vocab_table?.mastery_level ?? 1) !== masteryFilter) return false;
      if (tagFilter && !(e.custom_tags || []).includes(tagFilter)) return false;
      if (timeFilter === "week" && new Date(e.created_at) < weekAgo) return false;
      if (timeFilter === "month" && new Date(e.created_at) < monthAgo) return false;
      if (search) {
        const word = e.vocab_table?.word || "";
        const def = e.vocab_table?.chinese_definition || "";
        return word.toLowerCase().includes(search.toLowerCase()) || def.includes(search);
      }
      return true;
    });
  }, [entries, masteryFilter, tagFilter, timeFilter, search]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("corpus_entries").delete().eq("id", id);
    if (error) {
      toast.error("删除失败");
    } else {
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success("已删除");
    }
  };

  const handleMasteryChange = async (entryId: string, vocabId: string, newLevel: number) => {
    const { error } = await supabase.from("vocab_table").update({ mastery_level: newLevel }).eq("id", vocabId);
    if (error) {
      toast.error("更新失败");
      return;
    }
    setEntries(prev => prev.map(e =>
      e.id === entryId && e.vocab_table
        ? { ...e, vocab_table: { ...e.vocab_table, mastery_level: newLevel } }
        : e
    ));
    toast.success(`已更新为「${MASTERY_LABELS[newLevel]}」`);
  };

  const clearFilters = () => {
    setMasteryFilter(null);
    setTagFilter(null);
    setTimeFilter(null);
  };

  const hasActiveFilter = masteryFilter !== null || tagFilter !== null || timeFilter !== null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-2">
          <Library className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-display font-bold text-foreground">语料仓库</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">共 {entries.length} 条语料</p>

        {/* ===== Memory Stats Dashboard ===== */}
        <div className="grid grid-cols-5 gap-2 mb-5">
          {([1, 2, 3, 4, 5] as const).map(level => {
            const isActive = masteryFilter === level;
            return (
              <button
                key={level}
                onClick={() => setMasteryFilter(isActive ? null : level)}
                className={`flex flex-col items-center py-3 rounded-xl transition-all border ${
                  isActive
                    ? `${MASTERY_BG_LIGHT[level]} border-current ${MASTERY_TEXT_COLORS[level]} ring-1 ring-current`
                    : "bg-card border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full mb-1.5 ${MASTERY_COLORS[level]}`} />
                <span className="text-lg font-bold text-foreground">{masteryStats[level]}</span>
                <span className={`text-[10px] ${isActive ? MASTERY_TEXT_COLORS[level] : "text-muted-foreground"}`}>
                  {MASTERY_LABELS[level]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ===== Search + Filter Row ===== */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
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

          {/* Filter Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={`relative flex items-center gap-1 px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                hasActiveFilter ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}>
                <Filter className="h-4 w-4" />
                <ChevronDown className="h-3 w-3" />
                {hasActiveFilter && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="p-3 border-b">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">多维筛选</span>
                  {hasActiveFilter && (
                    <button onClick={clearFilters} className="text-xs text-primary hover:underline">清除全部</button>
                  )}
                </div>
              </div>

              {/* Mastery */}
              <div className="p-3 border-b">
                <p className="text-xs font-medium text-muted-foreground mb-2">按记忆程度</p>
                <div className="space-y-1">
                  {([1, 2, 3, 4, 5] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setMasteryFilter(masteryFilter === level ? null : level)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        masteryFilter === level ? `${MASTERY_BG_LIGHT[level]} ${MASTERY_TEXT_COLORS[level]}` : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${MASTERY_COLORS[level]}`} />
                        Level {level} · {MASTERY_LABELS[level]}
                      </span>
                      <span className="text-muted-foreground">({masteryStats[level]})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              {allTags.length > 0 && (
                <div className="p-3 border-b">
                  <p className="text-xs font-medium text-muted-foreground mb-2">按语境主题</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map(tag => {
                      const count = entries.filter(e => (e.custom_tags || []).includes(tag)).length;
                      return (
                        <button
                          key={tag}
                          onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                            tagFilter === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          #{tag} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time */}
              <div className="p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">按时间维度</p>
                <div className="space-y-1">
                  {([
                    { key: "week", label: "本周新增", count: timeFilteredCount.week },
                    { key: "month", label: "本月新增", count: timeFilteredCount.month },
                  ] as const).map(item => (
                    <button
                      key={item.key}
                      onClick={() => setTimeFilter(timeFilter === item.key ? null : item.key)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        timeFilter === item.key ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {item.label}
                      <span className="text-muted-foreground">({item.count})</span>
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter chips */}
        {hasActiveFilter && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {masteryFilter !== null && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${MASTERY_BG_LIGHT[masteryFilter]} ${MASTERY_TEXT_COLORS[masteryFilter]}`}>
                {MASTERY_LABELS[masteryFilter]}
                <button onClick={() => setMasteryFilter(null)} className="ml-0.5 hover:opacity-70">×</button>
              </span>
            )}
            {tagFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary">
                #{tagFilter}
                <button onClick={() => setTagFilter(null)} className="ml-0.5 hover:opacity-70">×</button>
              </span>
            )}
            {timeFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary">
                {timeFilter === "week" ? "本周" : "本月"}
                <button onClick={() => setTimeFilter(null)} className="ml-0.5 hover:opacity-70">×</button>
              </span>
            )}
          </div>
        )}

        {/* Batch review button */}
        {hasActiveFilter && filtered.length > 0 && (
          <button
            onClick={() => navigate("/review")}
            className="w-full mb-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-colors flex items-center justify-center gap-2"
          >
            <BookOpen className="h-4 w-4" />
            一键复习此类（{filtered.length} 词）
          </button>
        )}

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
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map(entry => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-card rounded-xl shadow-warm overflow-hidden flex"
                >
                  <div className={`w-1.5 shrink-0 ${MASTERY_COLORS[entry.vocab_table?.mastery_level ?? 1]}`} />
                  <div className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{entry.vocab_table?.word}</h3>
                        <p className="text-sm text-muted-foreground">{entry.vocab_table?.chinese_definition}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tag-chip text-[10px]">{entry.application_scenario}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline mastery adjuster */}
                    <div className="flex items-center gap-1 mt-2">
                      {([1, 2, 3, 4, 5] as const).map(level => {
                        const isActive = (entry.vocab_table?.mastery_level ?? 1) === level;
                        return (
                          <button
                            key={level}
                            onClick={() => entry.vocab_table && handleMasteryChange(entry.id, entry.vocab_table.id, level)}
                            title={MASTERY_LABELS[level]}
                            className={`w-5 h-5 rounded-full border-2 transition-all ${
                              isActive
                                ? `${MASTERY_COLORS[level]} border-transparent scale-110`
                                : `border-muted-foreground/20 hover:border-muted-foreground/40`
                            }`}
                          />
                        );
                      })}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {MASTERY_LABELS[entry.vocab_table?.mastery_level ?? 1]}
                      </span>
                    </div>

                    {entry.source_text && (
                      <p className="text-xs text-muted-foreground mt-2">来源：{entry.source_text}</p>
                    )}
                    {entry.personal_notes && (
                      <p className="text-xs text-foreground/70 mt-1 line-clamp-2">📝 {entry.personal_notes}</p>
                    )}
                    {entry.custom_tags && entry.custom_tags.length > 0 && (
                      <div className="flex gap-1.5 mt-2">
                        {entry.custom_tags.map(tag => (
                          <span key={tag} className="tag-chip text-[10px]">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}
