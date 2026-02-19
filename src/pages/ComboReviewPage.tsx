import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Loader2, Check, X, ArrowRight, ArrowLeft, Sparkles, Eye, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface VocabWord {
  id: string;
  word: string;
  chinese_definition: string;
  mastery_level: number;
}

interface NarrativeCloze {
  passage: string;
  blanks: string[];
  distractors: string[];
}

interface NuanceQuestion {
  sentenceA: string;
  sentenceB: string;
  wordA: string;
  wordB: string;
  explanationA: string;
  explanationB: string;
}

interface CollocationQuestion {
  word: string;
  correctPrep: string;
  options: string[];
  exampleSentence: string;
}

interface ComboData {
  narrativeCloze: NarrativeCloze;
  nuanceQuestions: NuanceQuestion[];
  collocationQuestions: CollocationQuestion[];
  summary: { relationship: string; explanation: string };
}

type Phase = "select" | "narrative" | "nuance" | "collocation" | "summary";

const PHASE_LABELS: Record<Phase, string> = {
  select: "选词",
  narrative: "叙事填空",
  nuance: "近义辨析",
  collocation: "搭配匹配",
  summary: "AI 总结",
};

export default function ComboReviewPage() {
  const navigate = useNavigate();
  const [vocab, setVocab] = useState<VocabWord[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("select");
  const [generating, setGenerating] = useState(false);
  const [comboData, setComboData] = useState<ComboData | null>(null);

  // Narrative state
  const [narrativeAnswers, setNarrativeAnswers] = useState<Record<number, string>>({});
  const [narrativeRevealed, setNarrativeRevealed] = useState(false);

  // Nuance state
  const [nuanceIdx, setNuanceIdx] = useState(0);
  const [nuanceAnswers, setNuanceAnswers] = useState<Record<string, { a: string; b: string }>>({});
  const [nuanceRevealed, setNuanceRevealed] = useState(false);

  // Collocation state
  const [colIdx, setColIdx] = useState(0);
  const [colAnswer, setColAnswer] = useState<string | null>(null);
  const [colRevealed, setColRevealed] = useState(false);
  const [colResults, setColResults] = useState<Record<number, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingVocab(false); return; }
      const { data } = await supabase
        .from("vocab_table")
        .select("id, word, chinese_definition, mastery_level")
        .order("created_at", { ascending: false })
        .limit(100);
      setVocab(data || []);
      setLoadingVocab(false);
    })();
  }, []);

  const selectedWords = vocab.filter(v => selectedIds.has(v.id));

  const toggleWord = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else toast.error("最多选择5个单词");
      return next;
    });
  };

  const startCombo = async () => {
    if (selectedWords.length < 2) { toast.error("请至少选择2个单词"); return; }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("请先登录"); return; }

      const { data, error } = await supabase.functions.invoke("generate-combo-review", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { words: selectedWords },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setComboData(data);
      setPhase("narrative");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const phases: Phase[] = ["narrative", "nuance", "collocation", "summary"];
  const activePhases = comboData
    ? phases.filter(p => {
        if (p === "nuance" && (!comboData.nuanceQuestions || comboData.nuanceQuestions.length === 0)) return false;
        return true;
      })
    : phases;

  const currentPhaseIdx = activePhases.indexOf(phase);
  const progressPercent = phase === "select" ? 0 : ((currentPhaseIdx + 1) / activePhases.length) * 100;

  const goNextPhase = () => {
    const idx = activePhases.indexOf(phase);
    if (idx < activePhases.length - 1) {
      setPhase(activePhases[idx + 1]);
    }
  };

  if (loadingVocab) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">加载词库…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-display font-bold text-foreground">组合记忆</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">选择一组单词，进行多维度组合复习</p>

      {/* Progress bar (hidden in select phase) */}
      {phase !== "select" && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.3 }} />
          </div>
          <span className="text-xs text-muted-foreground">{PHASE_LABELS[phase]}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ===== SELECT PHASE ===== */}
        {phase === "select" && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }}>
            <p className="text-sm text-foreground mb-3 font-medium">
              从词库中选择 2-5 个单词 <span className="text-muted-foreground">({selectedIds.size}/5)</span>
            </p>

            {vocab.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-sm mb-3">词库为空</p>
                <button onClick={() => navigate("/")} className="text-primary text-sm hover:underline">去查词</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-6 max-h-[50vh] overflow-y-auto pr-1">
                  {vocab.map(v => {
                    const isSelected = selectedIds.has(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggleWord(v.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-primary/10 border-primary ring-1 ring-primary/30"
                            : "bg-card border-border hover:border-primary/30"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{v.word}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{v.chinese_definition}</p>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary mt-1" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={startCombo}
                  disabled={selectedIds.size < 2 || generating}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> 生成中…</> : <><Layers className="h-4 w-4" /> 开始组合复习</>}
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ===== NARRATIVE CLOZE ===== */}
        {phase === "narrative" && comboData && (
          <motion.div key="narrative" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
            <div className="bg-card rounded-2xl p-5 shadow-warm mb-4">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-3 bg-primary/10 text-primary">综合叙事填空</span>
              <p className="text-foreground leading-relaxed">
                {comboData.narrativeCloze.passage.split(/\((\d+)\)/).map((part, i) => {
                  if (i % 2 === 1) {
                    const idx = parseInt(part) - 1;
                    const answer = narrativeAnswers[idx];
                    const correct = comboData.narrativeCloze.blanks[idx];
                    return (
                      <span key={i} className={`inline-block mx-1 px-2 py-0.5 rounded text-sm font-bold ${
                        narrativeRevealed
                          ? answer === correct ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                          : answer ? "bg-primary/10 text-primary" : "border-b-2 border-primary/40 min-w-[80px]"
                      }`}>
                        {narrativeRevealed ? correct : answer || `(${idx + 1})`}
                      </span>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
              </p>
            </div>

            <p className="text-xs text-muted-foreground mb-2">点击词汇填入空格：</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {[...comboData.narrativeCloze.blanks, ...comboData.narrativeCloze.distractors]
                .sort(() => 0.5 - Math.random())
                .map(w => {
                  const used = Object.values(narrativeAnswers).includes(w);
                  return (
                    <button
                      key={w}
                      disabled={narrativeRevealed || used}
                      onClick={() => {
                        const nextEmpty = comboData.narrativeCloze.blanks.findIndex((_, i) => !narrativeAnswers[i]);
                        if (nextEmpty !== -1) setNarrativeAnswers(prev => ({ ...prev, [nextEmpty]: w }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        used ? "opacity-40 bg-muted border-transparent" : "bg-card border-border hover:border-primary/40 text-foreground"
                      }`}
                    >
                      {w}
                    </button>
                  );
                })}
            </div>

            {!narrativeRevealed && Object.keys(narrativeAnswers).length > 0 && (
              <button
                onClick={() => setNarrativeAnswers({})}
                className="text-xs text-muted-foreground hover:text-foreground mb-3 underline"
              >
                重置选择
              </button>
            )}

            <div className="flex gap-2">
              {!narrativeRevealed ? (
                <button
                  onClick={() => setNarrativeRevealed(true)}
                  disabled={Object.keys(narrativeAnswers).length < comboData.narrativeCloze.blanks.length}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40"
                >
                  检查答案
                </button>
              ) : (
                <button onClick={goNextPhase} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                  下一题型 <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ===== NUANCE DISCRIMINATION ===== */}
        {phase === "nuance" && comboData && comboData.nuanceQuestions.length > 0 && (
          <motion.div key="nuance" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
            {(() => {
              const q = comboData.nuanceQuestions[nuanceIdx];
              if (!q) return null;
              const myAnswers = nuanceAnswers[nuanceIdx] || { a: "", b: "" };
              const wordsPool = [q.wordA, q.wordB];

              return (
                <div>
                  <div className="bg-card rounded-2xl p-5 shadow-warm mb-4">
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-3 bg-warm-gold/15 text-warm-gold">近义辨析</span>
                    <p className="text-xs text-muted-foreground mb-3">将正确的词填入对应的句子中</p>
                    <div className="space-y-3">
                      <div className="p-3 bg-muted/50 rounded-xl">
                        <p className="text-sm text-foreground mb-1">A: {q.sentenceA.replace("___", nuanceRevealed ? q.wordA : myAnswers.a || "___")}</p>
                        {nuanceRevealed && <p className="text-[10px] text-primary mt-1">→ {q.explanationA}</p>}
                      </div>
                      <div className="p-3 bg-muted/50 rounded-xl">
                        <p className="text-sm text-foreground mb-1">B: {q.sentenceB.replace("___", nuanceRevealed ? q.wordB : myAnswers.b || "___")}</p>
                        {nuanceRevealed && <p className="text-[10px] text-primary mt-1">→ {q.explanationB}</p>}
                      </div>
                    </div>
                  </div>

                  {!nuanceRevealed && (
                    <div className="flex gap-2 mb-4">
                      {wordsPool.map(w => (
                        <button
                          key={w}
                          onClick={() => {
                            if (!myAnswers.a) setNuanceAnswers(prev => ({ ...prev, [nuanceIdx]: { ...myAnswers, a: w } }));
                            else if (!myAnswers.b && w !== myAnswers.a) setNuanceAnswers(prev => ({ ...prev, [nuanceIdx]: { ...myAnswers, b: w } }));
                          }}
                          className="flex-1 py-2.5 rounded-xl border bg-card text-sm font-medium text-foreground hover:border-primary/40"
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!nuanceRevealed ? (
                      <button
                        onClick={() => setNuanceRevealed(true)}
                        disabled={!myAnswers.a || !myAnswers.b}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40"
                      >
                        检查答案
                      </button>
                    ) : nuanceIdx < comboData.nuanceQuestions.length - 1 ? (
                      <button
                        onClick={() => { setNuanceIdx(i => i + 1); setNuanceRevealed(false); }}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1"
                      >
                        下一题 <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={goNextPhase} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                        下一题型 <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* ===== COLLOCATION ===== */}
        {phase === "collocation" && comboData && (
          <motion.div key="collocation" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
            {(() => {
              const q = comboData.collocationQuestions[colIdx];
              if (!q) return null;
              const isCorrect = colAnswer === q.correctPrep;

              return (
                <div>
                  <div className="bg-card rounded-2xl p-5 shadow-warm mb-4 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-soft-rose/15 text-soft-rose">搭配匹配</span>
                    <h3 className="text-2xl font-display font-bold text-foreground mb-2">{q.word} ___</h3>
                    <p className="text-sm text-muted-foreground">选择正确的搭配词</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {q.options.map(opt => {
                      const isSel = colAnswer === opt;
                      const isRight = opt === q.correctPrep;
                      let cls = "p-3 rounded-xl text-sm font-medium border transition-all text-center ";
                      if (colRevealed) {
                        if (isRight) cls += "bg-primary/10 border-primary text-primary";
                        else if (isSel && !isRight) cls += "bg-destructive/10 border-destructive text-destructive";
                        else cls += "bg-muted border-transparent text-muted-foreground";
                      } else {
                        cls += isSel ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-foreground hover:border-primary/30";
                      }
                      return (
                        <button key={opt} onClick={() => !colRevealed && setColAnswer(opt)} disabled={colRevealed} className={cls}>
                          {q.word} {opt}
                          {colRevealed && isRight && <Check className="inline h-3.5 w-3.5 ml-1" />}
                          {colRevealed && isSel && !isRight && <X className="inline h-3.5 w-3.5 ml-1" />}
                        </button>
                      );
                    })}
                  </div>

                  {colRevealed && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/15 rounded-xl p-3 mb-4">
                      <p className="text-xs text-muted-foreground mb-1">例句：</p>
                      <p className="text-sm text-foreground">{q.exampleSentence}</p>
                    </motion.div>
                  )}

                  <div className="flex gap-2">
                    {!colRevealed ? (
                      <button
                        onClick={() => {
                          setColRevealed(true);
                          setColResults(prev => ({ ...prev, [colIdx]: colAnswer === q.correctPrep }));
                        }}
                        disabled={!colAnswer}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40"
                      >
                        确认
                      </button>
                    ) : colIdx < comboData.collocationQuestions.length - 1 ? (
                      <button
                        onClick={() => { setColIdx(i => i + 1); setColAnswer(null); setColRevealed(false); }}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1"
                      >
                        下一题 <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={goNextPhase} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                        查看总结 <Sparkles className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground text-center mt-2">{colIdx + 1}/{comboData.collocationQuestions.length}</p>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* ===== SUMMARY ===== */}
        {phase === "summary" && comboData && (
          <motion.div key="summary" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="bg-card rounded-2xl p-6 shadow-warm mb-4 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground mb-1">组合复习完成！</h3>
              <p className="text-sm text-muted-foreground mb-4">
                词汇：{selectedWords.map(w => w.word).join("、")}
              </p>
            </div>

            <div className="bg-card rounded-2xl p-5 shadow-warm mb-4">
              <p className="text-xs font-medium text-primary mb-2">🔗 词汇逻辑关系</p>
              <p className="text-sm font-semibold text-foreground mb-2">{comboData.summary.relationship}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{comboData.summary.explanation}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPhase("select");
                  setSelectedIds(new Set());
                  setComboData(null);
                  setNarrativeAnswers({});
                  setNarrativeRevealed(false);
                  setNuanceIdx(0);
                  setNuanceAnswers({});
                  setNuanceRevealed(false);
                  setColIdx(0);
                  setColAnswer(null);
                  setColRevealed(false);
                  setColResults({});
                }}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1"
              >
                <RotateCcw className="h-4 w-4" /> 再来一组
              </button>
              <button onClick={() => navigate("/review")} className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium text-sm">
                三步回顾
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
