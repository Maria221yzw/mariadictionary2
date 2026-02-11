import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Bookmark, AlertTriangle, TrendingUp, Loader2, Trash2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WordCardPopup from "@/components/WordCardPopup";

export interface WordFormData {
  word: string;
  pos: string;
  phonetic?: string;
  meaningCn: string;
  morphologies?: { type: string; typeCn: string; form: string }[];
  example?: { sentence: string; translation: string };
}

export interface AIWordData {
  word: string;
  phonetic: string;
  coreDefinition?: string;
  partOfSpeech: string[];
  definitions: { pos: string; meaning: string; meaningCn: string }[];
  wordForms?: WordFormData[];
  examples: { context: string; sentence: string; translation: string }[];
  relatedWords: { type: string; words: string[] }[];
  synonymComparison?: { word: string; nuance: string; exampleDiff: string }[];
  suggestedTags?: string[];
  difficulty?: string;
}

interface HistoryItem {
  word: string;
  pos: string;
  meaningCn: string;
  timestamp: number;
}

const HISTORY_KEY = "search_history";
const MAX_HISTORY = 20;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [wordData, setWordData] = useState<AIWordData | null>(null);
  const [vocabId, setVocabId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const navigate = useNavigate();

  const addToHistory = useCallback((data: AIWordData) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.word.toLowerCase() !== data.word.toLowerCase());
      const item: HistoryItem = {
        word: data.word,
        pos: data.definitions?.[0]?.pos || "",
        meaningCn: data.coreDefinition || data.definitions?.[0]?.meaningCn || "",
        timestamp: Date.now(),
      };
      const next = [item, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const handleSearch = async (word?: string) => {
    const target = (word || query).trim();
    if (!target) return;

    setLoading(true);
    setWordData(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("请先登录后再查词");
        setLoading(false);
        return;
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke("word-expand", {
        body: { word: target },
      });

      if (fnError) throw fnError;

      const result = fnData as AIWordData;
      setWordData(result);
      addToHistory(result);

      // Upsert into vocab_table (user-scoped)
      const { data: existing } = await supabase
        .from("vocab_table")
        .select("id, lookup_count")
        .eq("word", result.word || target)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("vocab_table")
          .update({ lookup_count: existing.lookup_count + 1 })
          .eq("id", existing.id);
        setVocabId(existing.id);
      } else {
        const { data: inserted } = await supabase
          .from("vocab_table")
          .insert({
            word: (result.word || target).slice(0, 100),
            phonetic: (result.phonetic || "").slice(0, 200),
            chinese_definition: (result.definitions?.[0]?.meaningCn || "").slice(0, 500),
            user_id: user.id,
          })
          .select("id")
          .single();
        setVocabId(inserted?.id || null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("查词失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const recentWords = ["Subtle", "Ameliorate", "Ephemeral", "Ubiquitous"];

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
          <div className="relative flex items-center bg-card rounded-2xl shadow-warm transition-shadow duration-300 focus-within:shadow-warm-lg focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="输入英文单词搜索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-transparent py-4 pl-12 pr-14 text-base font-body text-foreground placeholder:text-muted-foreground outline-none rounded-2xl"
              maxLength={100}
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="absolute right-3 p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Quick tags */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {recentWords.map((word, i) => (
            <motion.button
              key={word}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              onClick={() => { setQuery(word); handleSearch(word); }}
              className="tag-chip cursor-pointer hover:opacity-80 transition-opacity"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              {word}
            </motion.button>
          ))}
        </div>

        {/* Translation History */}
        {!wordData && !loading && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-10 w-full text-left"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">翻译历史</span>
              </div>
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="清空历史"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="bg-card rounded-xl shadow-warm divide-y divide-border/50 overflow-hidden">
              {history.map((item, i) => (
                <motion.button
                  key={item.word + item.timestamp}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => { setQuery(item.word); handleSearch(item.word); }}
                  className="w-full flex items-baseline gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-semibold text-foreground truncate">{item.word}</span>
                  {item.pos && (
                    <span className="text-xs text-primary/70 font-medium shrink-0">{item.pos}</span>
                  )}
                  <span className="text-xs text-muted-foreground truncate ml-auto">{item.meaningCn}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Loading state */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-12 flex flex-col items-center gap-3"
          >
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">AI 正在分析单词...</p>
          </motion.div>
        )}

        {/* Word card popup */}
        <AnimatePresence>
          {wordData && !loading && (
            <WordCardPopup
              wordData={wordData}
              vocabId={vocabId}
              onClose={() => setWordData(null)}
              onViewDetail={() => navigate(`/word/${encodeURIComponent(wordData.word.toLowerCase())}`)}
              onSearchWord={(w) => { setQuery(w); setWordData(null); handleSearch(w); }}
            />
          )}
        </AnimatePresence>

        {/* Feature hints */}
        {!wordData && !loading && history.length === 0 && (
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
              <p className="text-sm font-medium text-foreground">AI 智能扩展</p>
              <p className="text-xs text-muted-foreground mt-1">自动生成例句与近义词辨析</p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
