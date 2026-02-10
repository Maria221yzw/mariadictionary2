import { useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { AIWordData } from "@/pages/SearchPage";
import AddToCorpusDialog from "@/components/AddToCorpusDialog";
import { useSpeech } from "@/hooks/useSpeech";

interface Props {
  wordData: AIWordData;
  vocabId: string | null;
  onClose: () => void;
  onViewDetail: () => void;
  onSearchWord?: (word: string) => void;
}

export default function WordCardPopup({ wordData, vocabId, onClose, onViewDetail, onSearchWord }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showCorpusDialog, setShowCorpusDialog] = useState(false);
  const { speaking, speak } = useSpeech();

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="mt-8 bg-card rounded-2xl shadow-warm-lg border text-left overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-display font-bold text-foreground">{wordData.word}</h3>
              {/* Phonetics with TTS */}
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  onClick={() => speak(wordData.word, "en-GB")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors group"
                >
                  <span className="font-mono">英</span>
                  <span className="font-mono text-foreground">{wordData.phonetic}</span>
                  <Volume2 className={`h-3.5 w-3.5 transition-all ${speaking ? "text-primary scale-110" : "group-hover:text-primary"}`} />
                </button>
                <button
                  onClick={() => speak(wordData.word, "en-US")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors group"
                >
                  <span className="font-mono">美</span>
                  <span className="font-mono text-foreground">{wordData.phonetic}</span>
                  <Volume2 className={`h-3.5 w-3.5 transition-all ${speaking ? "text-primary scale-110" : "group-hover:text-primary"}`} />
                </button>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>

          {/* Core definition – prominent */}
          {wordData.coreDefinition && (
            <p className="mt-3 text-lg font-bold text-foreground">{wordData.coreDefinition}</p>
          )}

          {/* POS definitions */}
          <div className="mt-2 space-y-1">
            {wordData.definitions?.slice(0, 3).map((def, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                <span className="font-mono text-primary font-medium mr-1">{def.pos}</span>
                {def.meaningCn}
              </p>
            ))}
          </div>

          {/* Tags */}
          {wordData.suggestedTags && wordData.suggestedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {wordData.suggestedTags.map(tag => <span key={tag} className="tag-chip text-[10px]">{tag}</span>)}
            </div>
          )}
        </div>

        {/* CTA buttons */}
        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={() => {
              console.log("[Corpus] vocabId:", vocabId, "wordData:", wordData.word);
              if (!vocabId) {
                toast.error("词汇数据尚未就绪，请稍后再试");
                return;
              }
              setShowCorpusDialog(true);
            }}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Bookmark className="h-4 w-4" />
            加入语料库
          </button>
          <button
            onClick={onViewDetail}
            className="px-4 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            详情 →
          </button>
        </div>

        {/* Expandable section */}
        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "收起详情" : "展开 AI 智能扩展"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="px-5 pb-5 space-y-4"
            >
              {/* AI Examples */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">📝 分类例句</h4>
                <div className="space-y-2">
                  {wordData.examples?.map((ex, i) => (
                    <div key={i} className="bg-muted/50 rounded-lg p-3">
                      <span className="tag-chip text-[10px] mb-1">{ex.context}</span>
                      <p className="text-sm text-foreground mt-1 font-medium">{ex.sentence}</p>
                      <p className="text-xs text-muted-foreground mt-1">{ex.translation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Synonym comparison */}
              {wordData.synonymComparison && wordData.synonymComparison.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">🔍 近义词深度辨析</h4>
                  <div className="bg-muted/50 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-foreground">近义词</th>
                          <th className="text-left p-2 font-medium text-foreground">语境差别</th>
                          <th className="text-left p-2 font-medium text-foreground">用法差异</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wordData.synonymComparison.map((s, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="p-2 font-medium">
                              <button onClick={() => onSearchWord?.(s.word)} className="text-primary underline decoration-primary/30 hover:decoration-primary transition-colors">
                                {s.word}
                              </button>
                            </td>
                            <td className="p-2 text-foreground">{s.nuance}</td>
                            <td className="p-2 text-muted-foreground">{s.exampleDiff}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Related words – clickable */}
              {wordData.relatedWords?.map((group, i) => (
                <div key={i}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">{group.type}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {group.words.map(w => (
                      <button
                        key={w}
                        onClick={() => onSearchWord?.(w)}
                        className="px-2.5 py-1 rounded-lg text-xs bg-muted text-primary underline decoration-primary/30 hover:bg-primary/10 hover:decoration-primary transition-colors cursor-pointer"
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>

      {showCorpusDialog && vocabId && (
        <AddToCorpusDialog
          wordData={wordData}
          vocabId={vocabId}
          onClose={() => setShowCorpusDialog(false)}
        />
      )}
    </>
  );
}
