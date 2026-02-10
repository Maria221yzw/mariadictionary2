import { useState } from "react";
import { Bookmark, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { AIWordData } from "@/pages/SearchPage";
import AddToCorpusDialog from "@/components/AddToCorpusDialog";

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
            <div>
              <div className="flex items-end gap-2">
                <h3 className="text-2xl font-display font-bold text-foreground">{wordData.word}</h3>
                <span className="text-sm font-mono text-muted-foreground mb-0.5">{wordData.phonetic}</span>
              </div>
              <div className="flex gap-1.5 mt-2">
                {wordData.partOfSpeech?.map(p => (
                  <span key={p} className="text-xs font-mono text-primary font-medium">{p}</span>
                ))}
                {wordData.difficulty && (
                  <span className={`tag-chip text-[10px] ${wordData.difficulty === "高级" ? "!bg-accent/15 !text-accent" : ""}`}>
                    {wordData.difficulty}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>

          {/* Core definition */}
          {wordData.coreDefinition && (
            <p className="mt-2 text-base font-semibold text-primary">{wordData.coreDefinition}</p>
          )}

          {/* Definitions by pos */}
          <div className="mt-2 space-y-1">
            {wordData.definitions?.slice(0, 2).map((def, i) => (
              <p key={i} className="text-sm text-foreground">
                <span className="text-muted-foreground">{def.pos}</span> {def.meaningCn}
              </p>
            ))}
          </div>
        </div>

        {/* CTA button */}
        <div className="px-5 pb-4">
          <button
            onClick={() => {
              console.log("[Corpus] vocabId:", vocabId, "wordData:", wordData.word);
              if (!vocabId) {
                toast.error("词汇数据尚未就绪，请稍后再试");
                return;
              }
              setShowCorpusDialog(true);
            }}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Bookmark className="h-4 w-4" />
            加入我的语料库
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
                      <p className="text-sm text-foreground mt-1">{ex.sentence}</p>
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
