import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, ArrowRight, RotateCcw } from "lucide-react";
import { mockReviewQuestions, type ReviewQuestion } from "@/lib/mockData";
import { toast } from "sonner";

export default function ReviewPage() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [translationInput, setTranslationInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const question = mockReviewQuestions[currentIdx];
  const isLast = currentIdx === mockReviewQuestions.length - 1;
  const allDone = currentIdx >= mockReviewQuestions.length;

  const handleCheck = () => {
    if (question.type === "fill-blank") {
      const correct = selectedAnswer === question.answer;
      setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      setRevealed(true);
    } else {
      setScore(s => ({ correct: s.correct, total: s.total + 1 }));
      setRevealed(true);
    }
  };

  const handleNext = () => {
    setSelectedAnswer(null);
    setTranslationInput("");
    setRevealed(false);
    setCurrentIdx(i => i + 1);
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setTranslationInput("");
    setRevealed(false);
    setScore({ correct: 0, total: 0 });
  };

  if (allDone) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-2">练习完成！</h2>
          <p className="text-muted-foreground mb-4">
            正确 {score.correct} / {score.total} 题
          </p>
          <div className="w-full max-w-xs mx-auto h-2 rounded-full bg-muted overflow-hidden mb-8">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${score.total > 0 ? (score.correct / score.total) * 100 : 0}%` }}
            />
          </div>
          <button
            onClick={handleRestart}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            <RotateCcw className="h-4 w-4" />
            再练一轮
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-24">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-display font-bold text-foreground">动态回顾</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        根据你的语料库生成练习，激活库存单词
      </p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${((currentIdx + 1) / mockReviewQuestions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{currentIdx + 1}/{mockReviewQuestions.length}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="bg-card rounded-2xl p-6 shadow-warm mb-4">
            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-3 ${question.type === "fill-blank" ? "bg-primary/10 text-primary" : "bg-warm-gold/15 text-warm-gold"}`}>
              {question.type === "fill-blank" ? "选词填空" : "场景翻译"}
            </span>
            <p className="text-foreground leading-relaxed">
              {question.type === "fill-blank"
                ? question.prompt.split("___").map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <span className="inline-block w-24 border-b-2 border-primary/30 mx-1" />
                      )}
                    </span>
                  ))
                : question.prompt
              }
            </p>
          </div>

          {question.type === "fill-blank" && question.options && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {question.options.map(opt => {
                const isSelected = selectedAnswer === opt;
                const isCorrect = opt === question.answer;
                let classes = "p-3 rounded-xl text-sm font-medium border transition-all text-center ";
                if (revealed) {
                  if (isCorrect) classes += "bg-primary/10 border-primary text-primary";
                  else if (isSelected && !isCorrect) classes += "bg-destructive/10 border-destructive text-destructive";
                  else classes += "bg-muted border-transparent text-muted-foreground";
                } else {
                  classes += isSelected
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-card border-border text-foreground hover:border-primary/30";
                }
                return (
                  <button
                    key={opt}
                    onClick={() => !revealed && setSelectedAnswer(opt)}
                    disabled={revealed}
                    className={classes}
                  >
                    {opt}
                    {revealed && isCorrect && <Check className="inline h-3.5 w-3.5 ml-1" />}
                    {revealed && isSelected && !isCorrect && <X className="inline h-3.5 w-3.5 ml-1" />}
                  </button>
                );
              })}
            </div>
          )}

          {question.type === "translate" && (
            <div className="mb-4">
              <textarea
                value={translationInput}
                onChange={(e) => setTranslationInput(e.target.value)}
                placeholder="输入你的翻译..."
                disabled={revealed}
                className="w-full bg-card rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground border outline-none focus:ring-2 focus:ring-primary/20 resize-none h-24"
              />
              {revealed && (
                <div className="mt-2 bg-primary/5 border border-primary/15 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">参考答案：</p>
                  <p className="text-sm text-foreground">{question.answer}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {!revealed ? (
              <button
                onClick={handleCheck}
                disabled={question.type === "fill-blank" ? !selectedAnswer : !translationInput.trim()}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                检查答案
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                {isLast ? "查看结果" : "下一题"}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
