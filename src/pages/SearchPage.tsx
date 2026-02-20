import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Bookmark, AlertTriangle, Loader2, Trash2, Clock } from "lucide-react";
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
  phrases?: { phrase: string; meaningCn: string }[];
  etymology?: { root: string; meaning: string; relatedWords: string[] }[];
}

interface HistoryItem {
  word: string;         // The original query (Chinese or English)
  pos: string;
  meaningCn: string;
  meaningEn?: string;   // For Chinese queries: the English word result
  isChinese?: boolean;
  timestamp: number;
  lookupCount?: number;
}

function isChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
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

  const addToHistory = useCallback((originalQuery: string, data: AIWordData, lookupCount?: number) => {
    const queriedInChinese = isChinese(originalQuery);
    setHistory((prev) => {
      // Deduplicate by original query (case-insensitive for English)
      const filtered = prev.filter((h) =>
        queriedInChinese
          ? h.word !== originalQuery
          : h.word.toLowerCase() !== originalQuery.toLowerCase()
      );
      const item: HistoryItem = {
        word: queriedInChinese ? originalQuery : data.word,
        pos: data.definitions?.[0]?.pos || "",
        meaningCn: queriedInChinese ? "" : (data.coreDefinition || data.definitions?.[0]?.meaningCn || ""),
        meaningEn: queriedInChinese ? data.word : undefined,
        isChinese: queriedInChinese,
        timestamp: Date.now(),
        lookupCount,
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

      // Upsert and get lookup count

      // Upsert into vocab_table (user-scoped)
      const { data: existing } = await supabase
        .from("vocab_table")
        .select("id, lookup_count")
        .eq("word", result.word || target)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const newCount = existing.lookup_count + 1;
        await supabase
          .from("vocab_table")
          .update({ lookup_count: newCount })
          .eq("id", existing.id);
        setVocabId(existing.id);
        addToHistory(target, result, newCount);
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
        addToHistory(target, result, 1);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("查词失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

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
              placeholder="输入进行搜索..."
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
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  {item.isChinese ? (
                    // Chinese query: show Chinese term + English result below
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{item.word}</span>
                      {item.meaningEn && (
                        <span className="block text-xs text-muted-foreground mt-0.5">{item.meaningEn}</span>
                      )}
                    </div>
                  ) : (
                    // English query: original layout
                    <>
                      <span className="text-sm font-semibold text-foreground truncate">{item.word}</span>
                      {item.pos && (
                        <span className="text-xs text-primary/70 font-medium shrink-0">{item.pos}</span>
                      )}
                      <span className="text-xs text-muted-foreground truncate flex-1">{item.meaningCn}</span>
                    </>
                  )}
                  {item.lookupCount && item.lookupCount > 1 && (
                    <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">已查 {item.lookupCount} 次</span>
                  )}
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
