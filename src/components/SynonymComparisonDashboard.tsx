import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X as XIcon, Loader2, ArrowLeftRight, BookOpen, MessageSquare, AlertTriangle } from "lucide-react";

interface WordAnalysis {
  word: string;
  semanticFocus: string;
  register: string;
  commonCollocations: string[];
  exampleEn: string;
  exampleZh: string;
}

interface ComparisonData {
  clusterName: string;
  words: WordAnalysis[];
  sharedMeaning: string;
  keyDifferences: string[];
  nonInterchangeable: {
    context: string;
    correct: string;
    wrong: string;
    reason: string;
  }[];
}

interface Props {
  data: ComparisonData;
  onClose: () => void;
}

const REGISTER_COLORS: Record<string, string> = {
  Academic: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  Formal: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  Neutral: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Informal: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export default function SynonymComparisonDashboard({ data, onClose }: Props) {
  const [activeWordIdx, setActiveWordIdx] = useState<number | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border p-4 flex items-center justify-between z-10 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
              微观辨析：{data.clusterName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{data.words.map(w => w.word).join(" · ")}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <XIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Shared meaning */}
          <div className="bg-primary/5 rounded-xl p-3.5 border border-primary/15">
            <p className="text-xs font-semibold text-primary mb-1">🎯 共同语义核心</p>
            <p className="text-sm text-foreground">{data.sharedMeaning}</p>
          </div>

          {/* Word comparison cards - side by side */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(data.words.length, 3)}, 1fr)` }}>
            {data.words.map((w, i) => {
              const regClass = REGISTER_COLORS[w.register] || "bg-muted text-muted-foreground";
              return (
                <div
                  key={w.word}
                  className={`rounded-xl border p-3 transition-all cursor-pointer ${
                    activeWordIdx === i ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:border-primary/30"
                  }`}
                  onClick={() => setActiveWordIdx(activeWordIdx === i ? null : i)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-foreground">{w.word}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${regClass}`}>
                      {w.register}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{w.semanticFocus}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {w.commonCollocations.map(c => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {c}
                      </span>
                    ))}
                  </div>
                  <AnimatePresence>
                    {activeWordIdx === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            <BookOpen className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-foreground leading-relaxed">{w.exampleEn}</p>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground leading-relaxed">{w.exampleZh}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Key differences */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
              核心差异
            </h3>
            <div className="space-y-1.5">
              {data.keyDifferences.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                  <span className="text-primary font-bold mt-px">{i + 1}.</span>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Non-interchangeable contexts */}
          {data.nonInterchangeable && data.nonInterchangeable.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                不可互换的语境
              </h3>
              <div className="space-y-2">
                {data.nonInterchangeable.map((n, i) => (
                  <div key={i} className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-3 text-xs space-y-1">
                    <p className="text-foreground font-medium">{n.context}</p>
                    <p>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ {n.correct}</span>
                      <span className="text-muted-foreground mx-2">|</span>
                      <span className="text-destructive font-semibold">✗ {n.wrong}</span>
                    </p>
                    <p className="text-muted-foreground">{n.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
