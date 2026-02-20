import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Volume2, Bookmark, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AIWordData } from "@/pages/SearchPage";
import { useSpeech } from "@/hooks/useSpeech";
import AddToCorpusDialog from "@/components/AddToCorpusDialog";

interface CorpusWordModalProps {
  word: string;
  vocabId: string;
  corpusTags?: string[];
  onClose: () => void;
  onSearchWord?: (word: string) => void;
}

export default function CorpusWordModal({
  word,
  vocabId,
  corpusTags,
  onClose,
  onSearchWord,
}: CorpusWordModalProps) {
  const [loading, setLoading] = useState(true);
  const [wordData, setWordData] = useState<AIWordData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showCorpusDialog, setShowCorpusDialog] = useState(false);
  const { speaking, speak } = useSpeech();

  useEffect(() => {
    const fetchWord = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("word-expand", {
          body: { word },
        });
        if (error) throw error;
        setWordData(data as AIWordData);
      } catch (e) {
        console.error(e);
        toast.error("加载词典数据失败");
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchWord();
  }, [word]);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={handleBackdrop}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-lg bg-card rounded-2xl shadow-warm-lg border overflow-hidden max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-border/50 shrink-0">
            <span className="text-xs text-muted-foreground font-medium">语料仓库 · 词典详情</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">AI 正在加载词典数据...</p>
              </div>
            ) : wordData ? (
              <div className="p-5">
                {/* Word header */}
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-2xl font-display font-bold text-foreground">{wordData.word}</h2>
                </div>

                {/* Phonetics */}
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => speak(wordData.word, "en-GB")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <span className="font-mono">英</span>
                    <span className="font-mono text-foreground">{wordData.phonetic}</span>
                    <Volume2 className={`h-3.5 w-3.5 ${speaking ? "text-primary scale-110" : "group-hover:text-primary"}`} />
                  </button>
                  <button
                    onClick={() => speak(wordData.word, "en-US")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <span className="font-mono">美</span>
                    <span className="font-mono text-foreground">{wordData.phonetic}</span>
                    <Volume2 className={`h-3.5 w-3.5 ${speaking ? "text-primary scale-110" : "group-hover:text-primary"}`} />
                  </button>
                </div>

                {/* Core definition */}
                {wordData.coreDefinition && (
                  <p className="text-lg font-bold text-foreground mb-2">{wordData.coreDefinition}</p>
                )}

                {/* POS definitions */}
                <div className="space-y-1 mb-4">
                  {wordData.definitions?.slice(0, 4).map((def, i) => (
                    <p key={i} className="text-sm text-muted-foreground">
                      <span className="font-mono text-primary font-medium mr-1">{def.pos}</span>
                      {def.meaningCn}
                    </p>
                  ))}
                </div>

                {/* Corpus tags */}
                {corpusTags && corpusTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="text-[10px] text-muted-foreground mr-1">语料标签：</span>
                    {corpusTags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">#{tag}</span>
                    ))}
                  </div>
                )}

                {/* AI tags */}
                {wordData.suggestedTags && wordData.suggestedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {wordData.suggestedTags.map(tag => (
                      <span key={tag} className="tag-chip text-[10px]">{tag}</span>
                    ))}
                  </div>
                )}

                {/* CTA */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setShowCorpusDialog(true)}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Bookmark className="h-4 w-4" />
                    更新至语料库
                  </button>
                </div>

                {/* Expandable AI details */}
                <div className="border-t border-border/50">
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expanded ? "收起" : "展开 AI 智能扩展"}
                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {expanded && (
                    <div className="space-y-4 pb-2">
                      {/* Examples */}
                      {wordData.examples && wordData.examples.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">📝 分类例句</h4>
                          <div className="space-y-2">
                            {wordData.examples.slice(0, 3).map((ex, i) => (
                              <div key={i} className="bg-muted/50 rounded-lg p-3">
                                <span className="tag-chip text-[10px] mb-1">{ex.context}</span>
                                <p className="text-sm text-foreground mt-1 font-medium">{ex.sentence}</p>
                                <p className="text-xs text-muted-foreground mt-1">{ex.translation}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Synonym comparison */}
                      {wordData.synonymComparison && wordData.synonymComparison.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">🔍 近义词辨析</h4>
                          <div className="space-y-2">
                            {wordData.synonymComparison.map((s, i) => (
                              <div key={i} className="bg-muted/50 rounded-lg p-3">
                                <button
                                  onClick={() => onSearchWord?.(s.word)}
                                  className="text-sm font-semibold text-primary hover:underline"
                                >
                                  {s.word}
                                </button>
                                <p className="text-xs text-foreground mt-1">{s.nuance}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{s.exampleDiff}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Related words */}
                      {wordData.relatedWords?.map((group, i) => (
                        <div key={i}>
                          <h4 className="text-xs font-medium text-muted-foreground mb-1">{group.type}</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {group.words.map(w => (
                              <button
                                key={w}
                                onClick={() => onSearchWord?.(w)}
                                className="px-2.5 py-1 rounded-lg text-xs bg-muted text-primary underline decoration-primary/30 hover:bg-primary/10 transition-colors"
                              >
                                {w}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>

      {showCorpusDialog && vocabId && wordData && (
        <AddToCorpusDialog
          wordData={wordData}
          vocabId={vocabId}
          onClose={() => setShowCorpusDialog(false)}
        />
      )}
    </AnimatePresence>
  );
}
