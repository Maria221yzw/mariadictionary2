import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, ArrowRight, RotateCcw, Loader2, BookOpen, ChevronUp, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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
const MASTERY_LABELS: Record<number, string> = {
  1: "陌生", 2: "模糊", 3: "认知", 4: "运用", 5: "熟练",
};

export default function ReviewPage() {
  const navigate = useNavigate();
  const [words, setWords] = useState<WordReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const [wordIdx, setWordIdx] = useState(0);
  const [step, setStep] = useState(0); // 0,1,2
  const [selected, setSelected] = useState<string | null>(null);
  const [translationInput, setTranslationInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [stepFailed, setStepFailed] = useState(false);
  const [showMasteryPrompt, setShowMasteryPrompt] = useState(false);

  // Track results per word
  const [results, setResults] = useState<Record<number, boolean>>({});

  const fetchQuestions = async () => {
    setLoading(true);
    setEmpty(false);
    setWords([]);
    setWordIdx(0);
    setStep(0);
    setSelected(null);
    setTranslationInput("");
    setRevealed(false);
    setStepFailed(false);
    setShowMasteryPrompt(false);
    setResults({});

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("请先登录"); return; }

      const { data, error } = await supabase.functions.invoke("generate-review", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data.empty) { setEmpty(true); }
      else { setWords(data.words || []); }
    } catch (e) {
      console.error(e);
      toast.error("生成练习题失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuestions(); }, []);

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
    if (selected === currentWord.step1.answer) {
      setRevealed(true);
      setStepFailed(false);
    } else {
      setRevealed(true);
      setStepFailed(true);
    }
  };

  const handleStep2Check = () => {
    if (selected === currentWord.step2.answer) {
      setRevealed(true);
      setStepFailed(false);
    } else {
      setRevealed(true);
      setStepFailed(true);
    }
  };

  const handleStep3Reveal = () => {
    setRevealed(true);
  };

  const advanceFromStep = () => {
    if (stepFailed) {
      // Mark word as failed, skip to next word
      setResults(prev => ({ ...prev, [wordIdx]: false }));
      resetStep();
      setStep(0);
      setWordIdx(i => i + 1);
      return;
    }

    if (step < 2) {
      resetStep();
      setStep(s => s + 1);
    } else {
      // All 3 steps passed → show mastery prompt
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
    resetStep();
    setStep(0);
    setWordIdx(i => i + 1);
  };

  // Render helper for highlighted answer
  const renderHighlightedAnswer = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <span key={i} className="text-primary font-bold underline decoration-primary/40 underline-offset-2">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  // === Loading ===
  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">正在生成三阶段复习题…</p>
      </div>
    );
  }

  // === Empty ===
  if (empty) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center mb-6">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">语料库还是空的</h2>
          <p className="text-muted-foreground mb-6">快去捕获一些语言灵感吧！</p>
          <button onClick={() => navigate("/search")} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            去查词
          </button>
        </motion.div>
      </div>
    );
  }

  // === Completion ===
  if (allDone) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-2">本轮回顾完成！</h2>
          <p className="text-muted-foreground mb-4">
            通过 {totalPassed} / {words.length} 词
          </p>
          <div className="w-full max-w-xs mx-auto h-2.5 rounded-full bg-muted overflow-hidden mb-8">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${words.length > 0 ? (totalPassed / words.length) * 100 : 0}%` }} />
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={fetchQuestions} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              <RotateCcw className="h-4 w-4" /> 再练一轮
            </button>
            <button onClick={() => navigate("/corpus")} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors">
              返回语料库
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-display font-bold text-foreground">三步回顾</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">从识别到输出，递进式深度记忆</p>

      {/* Progress: word X/N, step Y/3 */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${((wordIdx * 3 + step + 1) / (words.length * 3)) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          词 {wordIdx + 1}/{words.length} · 步 {step + 1}/3
        </span>
      </div>

      {/* Step indicator chips */}
      <div className="flex gap-1.5 mb-6">
        {[0, 1, 2].map(s => (
          <div key={s} className={`flex-1 py-1 rounded-lg text-center text-[10px] font-medium transition-colors ${
            s === step ? "bg-primary text-primary-foreground" : s < step ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {STEP_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Mastery upgrade prompt overlay */}
      <AnimatePresence>
        {showMasteryPrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-2xl p-6 shadow-warm text-center"
          >
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ChevronUp className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-display font-bold text-foreground mb-1">
              「{currentWord.word}」三步全部通过！
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              当前等级：
              <span className={`inline-flex items-center gap-1 ml-1 ${MASTERY_COLORS[currentWord.masteryLevel]} text-white px-1.5 py-0.5 rounded text-[10px]`}>
                {MASTERY_LABELS[currentWord.masteryLevel]}
              </span>
            </p>
            {currentWord.masteryLevel < 5 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  是否提升至「{MASTERY_LABELS[Math.min(currentWord.masteryLevel + 1, 5)]}」？
                </p>
                <div className="flex gap-2">
                  <button onClick={() => handleMasteryChoice(true)} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    提升等级
                  </button>
                  <button onClick={() => handleMasteryChoice(false)} className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors">
                    保持不变
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-primary mb-4">已达最高等级！</p>
                <button onClick={() => handleMasteryChoice(false)} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                  继续
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      {!showMasteryPrompt && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${wordIdx}-${step}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            {/* === Step 1: Recognition === */}
            {step === 0 && (
              <div>
                <div className="bg-card rounded-2xl p-6 shadow-warm mb-4 text-center">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-primary/10 text-primary">
                    {STEP_SUBLABELS[0]}
                  </span>
                  <h3 className="text-3xl font-display font-bold text-foreground mb-2">{currentWord.word}</h3>
                  <p className="text-sm text-muted-foreground">请选择正确的中文释义</p>
                </div>

                <div className="grid grid-cols-1 gap-2 mb-4">
                  {currentWord.step1.options.map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = opt === currentWord.step1.answer;
                    let cls = "p-3.5 rounded-xl text-sm font-medium border transition-all text-left ";
                    if (revealed) {
                      if (isCorrect) cls += "bg-primary/10 border-primary text-primary";
                      else if (isSelected && !isCorrect) cls += "bg-destructive/10 border-destructive text-destructive";
                      else cls += "bg-muted border-transparent text-muted-foreground";
                    } else {
                      cls += isSelected ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-foreground hover:border-primary/30";
                    }
                    return (
                      <button key={opt} onClick={() => !revealed && setSelected(opt)} disabled={revealed} className={cls}>
                        {opt}
                        {revealed && isCorrect && <Check className="inline h-3.5 w-3.5 ml-2" />}
                        {revealed && isSelected && !isCorrect && <X className="inline h-3.5 w-3.5 ml-2" />}
                      </button>
                    );
                  })}
                </div>

                {/* Failed card */}
                {revealed && stepFailed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-4">
                    <p className="text-sm font-semibold text-foreground mb-1">📖 核心释义</p>
                    <p className="text-foreground font-bold">{currentWord.word}</p>
                    <p className="text-sm text-muted-foreground">{currentWord.wordCn}</p>
                    <p className="text-xs text-destructive mt-2">已标记为不熟悉，本词将稍后重新出现</p>
                  </motion.div>
                )}

                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleStep1Check} disabled={!selected} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40">
                      确认答案
                    </button>
                  ) : (
                    <button onClick={advanceFromStep} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
                      {stepFailed ? "下一个词" : "进入第二步"} <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* === Step 2: Application === */}
            {step === 1 && (
              <div>
                <div className="bg-card rounded-2xl p-6 shadow-warm mb-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-warm-gold/15 text-warm-gold">
                    {STEP_SUBLABELS[1]}
                  </span>
                  <p className="text-foreground leading-relaxed text-lg">
                    {currentWord.step2.prompt.split("___").map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && <span className="inline-block w-24 border-b-2 border-primary/40 mx-1" />}
                      </span>
                    ))}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {currentWord.step2.options.map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = opt === currentWord.step2.answer;
                    let cls = "p-3 rounded-xl text-sm font-medium border transition-all text-center ";
                    if (revealed) {
                      if (isCorrect) cls += "bg-primary/10 border-primary text-primary";
                      else if (isSelected && !isCorrect) cls += "bg-destructive/10 border-destructive text-destructive";
                      else cls += "bg-muted border-transparent text-muted-foreground";
                    } else {
                      cls += isSelected ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-foreground hover:border-primary/30";
                    }
                    return (
                      <button key={opt} onClick={() => !revealed && setSelected(opt)} disabled={revealed} className={cls}>
                        {opt}
                        {revealed && isCorrect && <Check className="inline h-3.5 w-3.5 ml-1" />}
                        {revealed && isSelected && !isCorrect && <X className="inline h-3.5 w-3.5 ml-1" />}
                      </button>
                    );
                  })}
                </div>

                {revealed && stepFailed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-4">
                    <p className="text-sm text-destructive">答错了，正确答案是：<span className="font-bold">{currentWord.step2.answer}</span></p>
                  </motion.div>
                )}

                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleStep2Check} disabled={!selected} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40">
                      确认答案
                    </button>
                  ) : (
                    <button onClick={advanceFromStep} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
                      {stepFailed ? "下一个词" : "进入第三步"} <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* === Step 3: Production === */}
            {step === 2 && (
              <div>
                <div className="bg-card rounded-2xl p-6 shadow-warm mb-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-4 bg-soft-rose/15 text-soft-rose">
                    {STEP_SUBLABELS[2]}
                  </span>
                  <p className="text-xs text-muted-foreground mb-2">请将以下中文翻译成英文（须包含单词 <span className="font-bold text-primary">{currentWord.word}</span>）</p>
                  <p className="text-foreground text-lg font-medium leading-relaxed">{currentWord.step3.promptCn}</p>
                </div>

                <textarea
                  value={translationInput}
                  onChange={(e) => setTranslationInput(e.target.value)}
                  placeholder="输入你的英文翻译..."
                  disabled={revealed}
                  className="w-full bg-card rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground border outline-none focus:ring-2 focus:ring-primary/20 resize-none h-28 mb-3"
                />

                {revealed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-4">
                    <p className="text-xs text-muted-foreground mb-1.5">参考答案：</p>
                    <p className="text-sm text-foreground leading-relaxed">{renderHighlightedAnswer(currentWord.step3.answer)}</p>
                  </motion.div>
                )}

                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleStep3Reveal} disabled={!translationInput.trim()} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1">
                      <Eye className="h-4 w-4" /> 查看参考答案
                    </button>
                  ) : (
                    <button onClick={advanceFromStep} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
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
