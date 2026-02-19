import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, ArrowRight, RotateCcw, Loader2, BookOpen, ChevronUp, Eye, Layers, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface VocabWord {
  id: string;
  word: string;
  chinese_definition: string;
  phonetic: string | null;
  mastery_level: number;
}

interface WordReview {
  word: string;
  wordCn: string;
  vocabId: string | null;
  masteryLevel: number;
  step1: { options: string[]; answer: string };
  step2: { prompt: string; options: string[]; answer: string };
  step3: { promptCn: string; answer: string };
}

const STEP_LABELS = ["释义识别", "语境填空", "汉译英"];
const STEP_SUBLABELS = ["看英选中", "选择填空", "翻译挑战"];

const MASTERY_COLORS: Record<number, string> = {
  1: "bg-red-500", 2: "bg-orange-500", 3: "bg-yellow-500", 4: "bg-emerald-400", 5: "bg-emerald-600",
};
const MASTERY_TEXT_COLORS: Record<number, string> = {
  1: "text-red-500", 2: "text-orange-500", 3: "text-yellow-500", 4: "text-emerald-400", 5: "text-emerald-600",
};
const MASTERY_BG_LIGHT: Record<number, string> = {
  1: "bg-red-500/10", 2: "bg-orange-500/10", 3: "bg-yellow-500/10", 4: "bg-emerald-400/10", 5: "bg-emerald-600/10",
};
const MASTERY_LABELS: Record<number, string> = {
  1: "陌生", 2: "模糊", 3: "认知", 4: "运用", 5: "熟练",
};

type PageMode = "dashboard" | "review";

export default function ReviewPage() {
  const navigate = useNavigate();

  // Dashboard state
  const [allVocab, setAllVocab] = useState<VocabWord[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(true);
  const [activeMastery, setActiveMastery] = useState<number | null>(null);
  const [includeMastered, setIncludeMastered] = useState(false);

  // Review state
  const [mode, setMode] = useState<PageMode>("dashboard");
  const [words, setWords] = useState<WordReview[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [translationInput, setTranslationInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [stepFailed, setStepFailed] = useState(false);
  const [showMasteryPrompt, setShowMasteryPrompt] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({});

  // Fetch vocab for dashboard
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingVocab(false); return; }
      const { data } = await supabase
        .from("vocab_table")
        .select("id, word, chinese_definition, phonetic, mastery_level")
        .order("mastery_level", { ascending: true });
      setAllVocab(data || []);
      setLoadingVocab(false);
    })();
  }, []);

  const masteryStats = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allVocab.forEach(v => { if (counts[v.mastery_level] !== undefined) counts[v.mastery_level]++; });
    return counts;
  }, [allVocab]);

  const filteredWords = useMemo(() => {
    if (activeMastery === null) return [];
    return allVocab.filter(v => v.mastery_level === activeMastery);
  }, [allVocab, activeMastery]);

  // Start review session
  const startReview = async () => {
    setLoadingReview(true);
    setWords([]);
    setWordIdx(0);
    setStep(0);
    resetStep();
    setResults({});

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("请先登录"); return; }

      const { data, error } = await supabase.functions.invoke("generate-review", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data.empty) { toast.error("没有可复习的单词"); return; }
      setWords(data.words || []);
      setMode("review");
    } catch (e) {
      console.error(e);
      toast.error("生成练习题失败");
    } finally {
      setLoadingReview(false);
    }
  };

  const backToDashboard = () => {
    setMode("dashboard");
    // Refresh vocab stats
    (async () => {
      const { data } = await supabase
        .from("vocab_table")
        .select("id, word, chinese_definition, phonetic, mastery_level")
        .order("mastery_level", { ascending: true });
      setAllVocab(data || []);
    })();
  };

  // Review logic (same as before)
  const currentWord = words[wordIdx];
  const allDone = words.length > 0 && wordIdx >= words.length;
  const totalPassed = Object.values(results).filter(Boolean).length;

  const resetStep = () => {
    setSelected(null);
    setTranslationInput("");
    setRevealed(false);
    setStepFailed(false);
  };

  const handleStep1Check = () => {
    setRevealed(true);
    setStepFailed(selected !== currentWord.step1.answer);
  };
  const handleStep2Check = () => {
    setRevealed(true);
    setStepFailed(selected !== currentWord.step2.answer);
  };

  const advanceFromStep = () => {
    if (stepFailed) {
      setResults(prev => ({ ...prev, [wordIdx]: false }));
      resetStep(); setStep(0); setWordIdx(i => i + 1);
      return;
    }
    if (step < 2) { resetStep(); setStep(s => s + 1); }
    else {
      setResults(prev => ({ ...prev, [wordIdx]: true }));
      setShowMasteryPrompt(true);
    }
  };

  const handleMasteryChoice = async (upgrade: boolean) => {
    if (upgrade && currentWord.vocabId && currentWord.masteryLevel < 5) {
      const newLevel = Math.min(currentWord.masteryLevel + 1, 5);
      await supabase.from("vocab_table").update({ mastery_level: newLevel }).eq("id", currentWord.vocabId);
      toast.success(`「${currentWord.word}」已升至 ${MASTERY_LABELS[newLevel]}`);
    }
    setShowMasteryPrompt(false);
    resetStep(); setStep(0); setWordIdx(i => i + 1);
  };

  const renderHighlightedAnswer = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <span key={i} className="text-primary font-bold underline decoration-primary/40 underline-offset-2">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  // ==================== DASHBOARD MODE ====================
  if (mode === "dashboard") {
    if (loadingVocab) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">加载词库…</p>
        </div>
      );
    }

    if (allVocab.length === 0) {
      return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center mb-6">
              <BookOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">词库还是空的</h2>
            <p className="text-muted-foreground mb-6">快去查词并收藏吧！</p>
            <button onClick={() => navigate("/")} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              去查词
            </button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">记忆回顾</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">按掌握程度管理和复习你的词汇</p>

          {/* ===== Mastery Dashboard Cards ===== */}
          <div className="grid grid-cols-5 gap-2 mb-6">
            {([1, 2, 3, 4, 5] as const).map(level => {
              const isActive = activeMastery === level;
              const isL5 = level === 5;
              const clickable = isL5 ? includeMastered : true;
              return (
                <button
                  key={level}
                  onClick={() => clickable && setActiveMastery(isActive ? null : level)}
                  className={`flex flex-col items-center py-3.5 rounded-xl transition-all border ${
                    isActive
                      ? `${MASTERY_BG_LIGHT[level]} border-current ${MASTERY_TEXT_COLORS[level]} ring-1 ring-current`
                      : isL5 && !includeMastered
                        ? "bg-muted/50 border-border opacity-50 cursor-not-allowed"
                        : "bg-card border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mb-2 ${MASTERY_COLORS[level]}`} />
                  <span className="text-xl font-bold text-foreground">{masteryStats[level]}</span>
                  <span className={`text-[10px] mt-0.5 ${isActive ? MASTERY_TEXT_COLORS[level] : "text-muted-foreground"}`}>
                    {MASTERY_LABELS[level]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Settings toggle */}
          <div className="flex items-center justify-between mb-5 px-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Settings2 className="h-3.5 w-3.5" /> 包含已掌握单词 (L5)
            </span>
            <button
              onClick={() => {
                setIncludeMastered(!includeMastered);
                if (activeMastery === 5) setActiveMastery(null);
              }}
              className={`w-9 h-5 rounded-full transition-colors relative ${includeMastered ? "bg-primary" : "bg-muted"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeMastered ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={startReview}
              disabled={loadingReview || (masteryStats[1] + masteryStats[2]) === 0}
              className="py-3.5 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/15 transition-colors disabled:opacity-40 flex flex-col items-center gap-1"
            >
              {loadingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              <span>回顾全部生词</span>
              <span className="text-[10px] opacity-70">L1-L2 · {masteryStats[1] + masteryStats[2]} 词</span>
            </button>
            <button
              onClick={startReview}
              disabled={loadingReview || (masteryStats[3] + masteryStats[4]) === 0}
              className="py-3.5 rounded-xl bg-yellow-500/10 text-yellow-600 text-sm font-medium hover:bg-yellow-500/15 transition-colors disabled:opacity-40 flex flex-col items-center gap-1"
            >
              {loadingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>针对性强化</span>
              <span className="text-[10px] opacity-70">L3-L4 · {masteryStats[3] + masteryStats[4]} 词</span>
            </button>
          </div>

          {/* Combo review entry */}
          <button
            onClick={() => navigate("/combo-review")}
            className="w-full mb-6 py-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2"
          >
            <Layers className="h-4 w-4 text-primary" />
            组合记忆模式
          </button>

          {/* Word list for selected mastery level */}
          <AnimatePresence>
            {activeMastery !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {MASTERY_LABELS[activeMastery]} · {filteredWords.length} 词
                  </h3>
                  <button onClick={() => setActiveMastery(null)} className="text-xs text-muted-foreground hover:text-foreground">收起</button>
                </div>
                <div className="space-y-2">
                  {filteredWords.map(v => (
                    <div key={v.id} className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border">
                      <div className={`w-2 h-8 rounded-full shrink-0 ${MASTERY_COLORS[v.mastery_level]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{v.word}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{v.chinese_definition}</p>
                      </div>
                      {v.phonetic && <span className="text-[10px] text-muted-foreground">{v.phonetic}</span>}
                    </div>
                  ))}
                  {filteredWords.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-6">该等级暂无单词</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  // ==================== REVIEW MODE ====================

  // Completion
  if (allDone) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-2">本轮回顾完成！</h2>
          <p className="text-muted-foreground mb-4">通过 {totalPassed} / {words.length} 词</p>
          <div className="w-full max-w-xs mx-auto h-2.5 rounded-full bg-muted overflow-hidden mb-8">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${words.length > 0 ? (totalPassed / words.length) * 100 : 0}%` }} />
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={startReview} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              <RotateCcw className="h-4 w-4" /> 再练一轮
            </button>
            <button onClick={backToDashboard} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors">
              返回概览
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      {/* Header with back button */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={backToDashboard} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4 rotate-180" />
        </button>
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-display font-bold text-foreground">三步回顾</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">从识别到输出，递进式深度记忆</p>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${((wordIdx * 3 + step + 1) / (words.length * 3)) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">词 {wordIdx + 1}/{words.length} · 步 {step + 1}/3</span>
      </div>

      {/* Step chips */}
      <div className="flex gap-1.5 mb-6">
        {[0, 1, 2].map(s => (
          <div key={s} className={`flex-1 py-1 rounded-lg text-center text-[10px] font-medium transition-colors ${
            s === step ? "bg-primary text-primary-foreground" : s < step ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {STEP_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Mastery upgrade prompt */}
      <AnimatePresence>
        {showMasteryPrompt && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl p-6 shadow-warm text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ChevronUp className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-display font-bold text-foreground mb-1">「{currentWord.word}」三步全部通过！</h3>
            <p className="text-sm text-muted-foreground mb-1">
              当前等级：
              <span className={`inline-flex items-center gap-1 ml-1 ${MASTERY_COLORS[currentWord.masteryLevel]} text-white px-1.5 py-0.5 rounded text-[10px]`}>
                {MASTERY_LABELS[currentWord.masteryLevel]}
              </span>
            </p>
            {currentWord.masteryLevel < 5 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">是否提升至「{MASTERY_LABELS[Math.min(currentWord.masteryLevel + 1, 5)]}」？</p>
                <div className="flex gap-2">
                  <button onClick={() => handleMasteryChoice(true)} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">提升等级</button>
                  <button onClick={() => handleMasteryChoice(false)} className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium">保持不变</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-primary mb-4">已达最高等级！</p>
                <button onClick={() => handleMasteryChoice(false)} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">继续</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3-step review content */}
      {!showMasteryPrompt && (
        <AnimatePresence mode="wait">
          <motion.div key={`${wordIdx}-${step}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
            {/* Step 1 */}
            {step === 0 && (
              <div>
                <div className="bg-card rounded-2xl p-6 shadow-warm mb-4 text-center">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-primary/10 text-primary">{STEP_SUBLABELS[0]}</span>
                  <h3 className="text-3xl font-display font-bold text-foreground mb-2">{currentWord.word}</h3>
                  <p className="text-sm text-muted-foreground">请选择正确的中文释义</p>
                </div>
                <div className="grid grid-cols-1 gap-2 mb-4">
                  {currentWord.step1.options.map(opt => {
                    const isSel = selected === opt;
                    const isRight = opt === currentWord.step1.answer;
                    let cls = "p-3.5 rounded-xl text-sm font-medium border transition-all text-left ";
                    if (revealed) {
                      if (isRight) cls += "bg-primary/10 border-primary text-primary";
                      else if (isSel && !isRight) cls += "bg-destructive/10 border-destructive text-destructive";
                      else cls += "bg-muted border-transparent text-muted-foreground";
                    } else cls += isSel ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-foreground hover:border-primary/30";
                    return (
                      <button key={opt} onClick={() => !revealed && setSelected(opt)} disabled={revealed} className={cls}>
                        {opt}
                        {revealed && isRight && <Check className="inline h-3.5 w-3.5 ml-2" />}
                        {revealed && isSel && !isRight && <X className="inline h-3.5 w-3.5 ml-2" />}
                      </button>
                    );
                  })}
                </div>
                {revealed && stepFailed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-4">
                    <p className="text-sm font-semibold text-foreground mb-1">📖 核心释义</p>
                    <p className="text-foreground font-bold">{currentWord.word}</p>
                    <p className="text-sm text-muted-foreground">{currentWord.wordCn}</p>
                  </motion.div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleStep1Check} disabled={!selected} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40">确认答案</button>
                  ) : (
                    <button onClick={advanceFromStep} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {stepFailed ? "下一个词" : "进入第二步"} <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 1 && (
              <div>
                <div className="bg-card rounded-2xl p-6 shadow-warm mb-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-warm-gold/15 text-warm-gold">{STEP_SUBLABELS[1]}</span>
                  <p className="text-foreground leading-relaxed text-lg">
                    {currentWord.step2.prompt.split("___").map((part, i, arr) => (
                      <span key={i}>{part}{i < arr.length - 1 && <span className="inline-block w-24 border-b-2 border-primary/40 mx-1" />}</span>
                    ))}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {currentWord.step2.options.map(opt => {
                    const isSel = selected === opt;
                    const isRight = opt === currentWord.step2.answer;
                    let cls = "p-3 rounded-xl text-sm font-medium border transition-all text-center ";
                    if (revealed) {
                      if (isRight) cls += "bg-primary/10 border-primary text-primary";
                      else if (isSel && !isRight) cls += "bg-destructive/10 border-destructive text-destructive";
                      else cls += "bg-muted border-transparent text-muted-foreground";
                    } else cls += isSel ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-foreground hover:border-primary/30";
                    return (
                      <button key={opt} onClick={() => !revealed && setSelected(opt)} disabled={revealed} className={cls}>
                        {opt}
                        {revealed && isRight && <Check className="inline h-3.5 w-3.5 ml-1" />}
                        {revealed && isSel && !isRight && <X className="inline h-3.5 w-3.5 ml-1" />}
                      </button>
                    );
                  })}
                </div>
                {revealed && stepFailed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-4">
                    <p className="text-sm text-destructive">正确答案：<span className="font-bold">{currentWord.step2.answer}</span></p>
                  </motion.div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleStep2Check} disabled={!selected} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40">确认答案</button>
                  ) : (
                    <button onClick={advanceFromStep} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {stepFailed ? "下一个词" : "进入第三步"} <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 2 && (
              <div>
                <div className="bg-card rounded-2xl p-6 shadow-warm mb-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-soft-rose/15 text-soft-rose">{STEP_SUBLABELS[2]}</span>
                  <p className="text-xs text-muted-foreground mb-2">翻译以下中文（须包含 <span className="font-bold text-primary">{currentWord.word}</span>）</p>
                  <p className="text-foreground text-lg font-medium leading-relaxed">{currentWord.step3.promptCn}</p>
                </div>
                <textarea value={translationInput} onChange={(e) => setTranslationInput(e.target.value)} placeholder="输入你的英文翻译..." disabled={revealed}
                  className="w-full bg-card rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground border outline-none focus:ring-2 focus:ring-primary/20 resize-none h-28 mb-3" />
                {revealed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-4">
                    <p className="text-xs text-muted-foreground mb-1.5">参考答案：</p>
                    <p className="text-sm text-foreground leading-relaxed">{renderHighlightedAnswer(currentWord.step3.answer)}</p>
                  </motion.div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={() => setRevealed(true)} disabled={!translationInput.trim()} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                      <Eye className="h-4 w-4" /> 查看参考答案
                    </button>
                  ) : (
                    <button onClick={advanceFromStep} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      完成本词 <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
