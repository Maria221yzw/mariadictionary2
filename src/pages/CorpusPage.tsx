import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Filter, Search, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface CorpusEntry {
  id: string;
  application_scenario: string;
  source_text: string | null;
  personal_notes: string | null;
  custom_tags: string[] | null;
  difficulty_level: string;
  created_at: string;
  vocab_table: {
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

const MASTERY_LABELS: Record<number, string> = {
  1: "陌生",
  2: "模糊",
  3: "认知",
  4: "运用",
  5: "熟练",
};

const scenarioFilters = ["全部", "学术写作", "翻译练习", "日常口语", "专业课笔记"] as const;

export default function CorpusPage() {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenarioFilter, setScenarioFilter] = useState<string>("全部");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const fetchEntries = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    let query = supabase
      .from("corpus_entries")
      .select("*, vocab_table(word, phonetic, chinese_definition, mastery_level)")
      .order("created_at", { ascending: false });

    if (scenarioFilter !== "全部") {
      query = query.eq("application_scenario", scenarioFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      toast.error("加载语料失败");
    }
    setEntries((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, [scenarioFilter]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("corpus_entries").delete().eq("id", id);
    if (error) {
      toast.error("删除失败");
    } else {
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success("已删除");
    }
  };

  const filtered = entries.filter(e => {
    if (!search) return true;
    const word = e.vocab_table?.word || "";
    const def = e.vocab_table?.chinese_definition || "";
    return word.toLowerCase().includes(search.toLowerCase()) || def.includes(search);
  });

  const { data: { user } } = { data: { user: null } }; // placeholder for render check

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-2">
          <Library className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-display font-bold text-foreground">语料仓库</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">共 {filtered.length} 条语料</p>

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

        {/* Scenario filter */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          <Filter className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
          {scenarioFilters.map(f => (
            <button
              key={f}
              onClick={() => setScenarioFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${scenarioFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>

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
                  {/* Mastery color bar */}
                  <div className={`w-1.5 shrink-0 ${MASTERY_COLORS[entry.vocab_table?.mastery_level ?? 1]}`} />
                  <div className="p-4 flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{entry.vocab_table?.word}</h3>
                      <p className="text-sm text-muted-foreground">{entry.vocab_table?.chinese_definition}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{MASTERY_LABELS[entry.vocab_table?.mastery_level ?? 1]}</span>
                      <span className="tag-chip text-[10px]">{entry.application_scenario}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
