import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Bookmark, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
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

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [wordData, setWordData] = useState<AIWordData | null>(null);
  const [vocabId, setVocabId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSearch = async (word?: string) => {
    const target = (word || query).trim();
    if (!target) return;

    setLoading(true);
    setWordData(null);

    try {
      // Call AI edge function
      const { data: fnData, error: fnError } = await supabase.functions.invoke("word-expand", {
        body: { word: target },
      });

      if (fnError) throw fnError;

      setWordData(fnData as AIWordData);

      // Upsert into vocab_table
      const { data: existing } = await supabase
        .from("vocab_table")
        .select("id, lookup_count")
        .eq("word", fnData.word || target)
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
            word: fnData.word || target,
            phonetic: fnData.phonetic || "",
            chinese_definition: fnData.definitions?.[0]?.meaningCn || "",
          })
          .select("id")
          .single();
        setVocabId(inserted?.id || null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "查词失败，请重试");
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
            />
          )}
        </AnimatePresence>

        {/* Feature hints */}
        {!wordData && !loading && (
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
