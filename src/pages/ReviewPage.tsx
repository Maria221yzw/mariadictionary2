import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, ArrowRight, RotateCcw, Loader2, BookOpen, ChevronUp, Eye, Layers, Settings2, Lightbulb, Target, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import MasterySelector from "@/components/MasterySelector";

// ===== Practice Config Types =====
type PracticeScenario = "academic" | "professional" | "colloquial" | "literary";
type PracticeDifficulty = "basic" | "advanced" | "native";

const SCENARIO_LABELS: Record<PracticeScenario, string> = {
  academic: "🎓 高阶学术",
  professional: "💼 职场商务",
  colloquial: "💬 地道口语",
  literary: "📖 文学表达",
};

const DIFFICULTY_LABELS: Record<PracticeDifficulty, string> = {
  basic: "基础认知",
  advanced: "进阶运用",
  native: "母语者水平",
};

const SCENARIO_PROMPTS: Record<PracticeScenario, string> = {
  academic: "正式学术语境（论文写作、GRE/IELTS 作文，使用高级词汇和复杂句式）",
  professional: "职场商务语境（邮件往来、会议发言、商务洽谈，语气正式但不过于学术）",
  colloquial: "地道口语语境（影视台词、街头俚语、非正式社交，自然流畅）",
  literary: "文学创意语境（原著阅读风格、创意写作、翻译实践，注重语言美感）",
};

const DIFFICULTY_PROMPTS: Record<PracticeDifficulty, string> = {
  basic: "基础认知难度（句子结构简单，词汇常见，侧重识别与理解）",
  advanced: "进阶运用难度（句子有一定复杂度，考察词语的灵活运用）",
  native: "母语者水平（使用地道表达、复杂句式和微妙语义，接近真实英语环境）",
};

// ===== Interfaces =====
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

interface NarrativeCloze {
  passage: string;
  blanks: string[];
  distractors: string[];
  wordRelationships?: string;
}
interface NuanceQuestion {
  sentenceA: string; sentenceB: string;
  wordA: string; wordB: string;
  explanationA: string; explanationB: string;
}
// CollocationQuestion removed - no longer used in combo mode
interface SynthesisQuestion {
  targetWords: string[];
  chinesePrompt?: string;
  chineseSentences?: string[]; // legacy support
  referenceSentence: string;
  hint?: string;
  wordForms?: { word: string; formUsed: string; roleInSentence: string }[];
}
interface ComboData {
  narrativeCloze: NarrativeCloze;
  nuanceQuestions: NuanceQuestion[];
  synthesisQuestions: SynthesisQuestion[];
  summary: { relationship: string; explanation: string };
}

// ===== Constants =====
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

type PageMode = "dashboard" | "review" | "combo";
type ComboPhase = "narrative" | "nuance" | "synthesis" | "summary";

const COMBO_PHASE_LABELS: Record<ComboPhase, string> = {
  narrative: "综合填空", nuance: "近义辨析", synthesis: "句子重写", summary: "AI 总结",
};

export default function ReviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Dashboard state
  const [allVocab, setAllVocab] = useState<VocabWord[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(true);
  const [activeMastery, setActiveMastery] = useState<number | null>(null);
  const [includeMastered, setIncludeMastered] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Practice config state
  const [practiceScenario, setPracticeScenario] = useState<PracticeScenario>("academic");
  const [practiceDifficulty, setPracticeDifficulty] = useState<PracticeDifficulty>("advanced");

  // Review state (single word mode)
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

  // Combo state
  const [comboData, setComboData] = useState<ComboData | null>(null);
  const [comboPhase, setComboPhase] = useState<ComboPhase>("narrative");
  const [generatingCombo, setGeneratingCombo] = useState(false);
  const [narrativeAnswers, setNarrativeAnswers] = useState<Record<number, string>>({});
  const [narrativeRevealed, setNarrativeRevealed] = useState(false);
  const [nuanceIdx, setNuanceIdx] = useState(0);
  const [nuanceAnswers, setNuanceAnswers] = useState<Record<string, { a: string; b: string }>>({});
  const [nuanceRevealed, setNuanceRevealed] = useState(false);
  // collocation state removed
  const [synthIdx, setSynthIdx] = useState(0);
  const [synthInput, setSynthInput] = useState("");
  const [synthRevealed, setSynthRevealed] = useState(false);
  const [synthScoring, setSynthScoring] = useState(false);
  const [synthScore, setSynthScore] = useState<any>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem("review_onboarding_seen"));

  // Fetch vocab
  const refreshVocab = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingVocab(false); return; }
    const { data } = await supabase
      .from("vocab_table")
      .select("id, word, chinese_definition, phonetic, mastery_level")
      .order("mastery_level", { ascending: true });
    setAllVocab(data || []);
    setLoadingVocab(false);
  }, []);

  useEffect(() => { refreshVocab(); }, [refreshVocab]);

  // Pre-select word from corpus navigation (URL param: ?vocabId=xxx)
  useEffect(() => {
    const vocabId = searchParams.get("vocabId");
    if (vocabId && !loadingVocab) {
      setSelectedIds(new Set([vocabId]));
      // Auto-expand the mastery level of the word
      const word = allVocab.find(v => v.id === vocabId);
      if (word) setActiveMastery(word.mastery_level);
    }
  }, [searchParams, loadingVocab, allVocab]);

  const masteryStats = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allVocab.forEach(v => { if (counts[v.mastery_level] !== undefined) counts[v.mastery_level]++; });
    return counts;
  }, [allVocab]);

  const filteredWords = useMemo(() => {
    if (activeMastery === null) return [];
    return allVocab.filter(v => v.mastery_level === activeMastery);
  }, [allVocab, activeMastery]);

  const selectedWords = useMemo(() => allVocab.filter(v => selectedIds.has(v.id)), [allVocab, selectedIds]);

  // Semantic field recommendation: find similar words based on chinese definition overlap
  const semanticSuggestions = useMemo(() => {
    if (selectedIds.size === 0 || selectedIds.size >= 5) return [];
    const selectedDefs = selectedWords.map(w => w.chinese_definition);
    // Extract key Chinese characters (2+ char segments) from selected definitions
    const keywords = new Set<string>();
    selectedDefs.forEach(def => {
      const segments = def.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      segments.forEach(s => keywords.add(s));
    });
    if (keywords.size === 0) return [];
    return allVocab
      .filter(v => !selectedIds.has(v.id))
      .map(v => {
        const matchCount = Array.from(keywords).filter(kw => v.chinese_definition.includes(kw)).length;
        return { ...v, matchCount };
      })
      .filter(v => v.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 3);
  }, [allVocab, selectedIds, selectedWords]);

  // Toggle checkbox
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else toast.error("最多选择5个单词");
      return next;
    });
  };

  // ===== Single review =====
  const startReview = async () => {
    setLoadingReview(true);
    setWords([]); setWordIdx(0); setStep(0); resetStep(); setResults({});
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("请先登录"); return; }
      const { data, error } = await supabase.functions.invoke("generate-review", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          scenario: practiceScenario,
          difficulty: practiceDifficulty,
          scenarioPrompt: SCENARIO_PROMPTS[practiceScenario],
          difficultyPrompt: DIFFICULTY_PROMPTS[practiceDifficulty],
          wordIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
        },
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
    setSelectedIds(new Set());
    refreshVocab();
  };

  const currentWord = words[wordIdx];
  const allDone = words.length > 0 && wordIdx >= words.length;
  const totalPassed = Object.values(results).filter(Boolean).length;

  const resetStep = () => { setSelected(null); setTranslationInput(""); setRevealed(false); setStepFailed(false); };
  const handleStep1Check = () => { setRevealed(true); setStepFailed(selected !== currentWord.step1.answer); };
  const handleStep2Check = () => { setRevealed(true); setStepFailed(selected !== currentWord.step2.answer); };

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

  // ===== Combo review =====
  const startComboReview = async () => {
    if (selectedWords.length < 2) { toast.error("请至少选择2个单词"); return; }
    setGeneratingCombo(true);
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
      setComboPhase("narrative");
      setMode("combo");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "生成失败，请重试");
    } finally {
      setGeneratingCombo(false);
    }
  };

  const resetComboState = () => {
    setComboData(null);
    setNarrativeAnswers({}); setNarrativeRevealed(false);
    setNuanceIdx(0); setNuanceAnswers({}); setNuanceRevealed(false);
    setSynthIdx(0); setSynthInput(""); setSynthRevealed(false); setSynthScoring(false); setSynthScore(null);
  };

  const comboPhases: ComboPhase[] = comboData
    ? (["narrative", "nuance", "synthesis", "summary"] as ComboPhase[]).filter(p => {
        if (p === "nuance" && (!comboData.nuanceQuestions || comboData.nuanceQuestions.length === 0)) return false;
        if (p === "synthesis" && (!comboData.synthesisQuestions || comboData.synthesisQuestions.length === 0)) return false;
        return true;
      })
    : ["narrative", "nuance", "synthesis", "summary"];

  const comboProgressPercent = ((comboPhases.indexOf(comboPhase) + 1) / comboPhases.length) * 100;

  const goNextComboPhase = () => {
    const idx = comboPhases.indexOf(comboPhase);
    if (idx < comboPhases.length - 1) setComboPhase(comboPhases[idx + 1]);
  };

  // ==================== DASHBOARD ====================
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
      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">记忆回顾</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">按掌握程度管理和复习你的词汇</p>

          {/* Mastery Dashboard Cards */}
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

          {/* Practice Config Panel */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-5">
            <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-primary" /> 练习配置
            </p>
            {/* Scenario */}
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">应用场景</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(Object.keys(SCENARIO_LABELS) as PracticeScenario[]).map(s => (
                <button
                  key={s}
                  onClick={() => setPracticeScenario(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    practiceScenario === s
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {SCENARIO_LABELS[s]}
                </button>
              ))}
            </div>
            {/* Difficulty */}
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">难度等级</p>
            <div className="flex gap-1.5">
              {(Object.keys(DIFFICULTY_LABELS) as PracticeDifficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => setPracticeDifficulty(d)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    practiceDifficulty === d
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {/* Mode A: Individual Mastery */}
            <button
              onClick={() => {
                if (selectedIds.size <= 1) startReview();
                else startReview();
              }}
              disabled={loadingReview || allVocab.length === 0}
              className="group relative flex flex-col items-start p-4 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all text-left disabled:opacity-40"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                {loadingReview ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Target className="h-5 w-5 text-primary" />}
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">单词强化</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">逐一攻克，深度记忆每个词的词性变形与翻译。</p>
              <span className="mt-2 text-[10px] text-muted-foreground/70">
                {selectedIds.size === 1 ? "将针对选中的 1 个词练习" : selectedIds.size > 1 ? `将针对选中的 ${selectedIds.size} 个词练习` : `默认回顾当前等级生词`}
              </span>
            </button>

            {/* Mode B: Combined Synergy */}
            <button
              onClick={() => {
                if (selectedIds.size >= 2) startComboReview();
                else toast("请先在下方勾选 2-5 个单词", { icon: "💡" });
              }}
              disabled={generatingCombo || (selectedIds.size >= 1 && selectedIds.size < 2)}
              className={`group relative flex flex-col items-start p-4 rounded-2xl border transition-all text-left ${
                selectedIds.size >= 2
                  ? "border-primary/30 bg-primary/5 hover:shadow-md hover:border-primary/50"
                  : "border-border bg-card opacity-60"
              } disabled:opacity-40`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${selectedIds.size >= 2 ? "bg-primary/15" : "bg-muted"}`}>
                {generatingCombo ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Link2 className={`h-5 w-5 ${selectedIds.size >= 2 ? "text-primary" : "text-muted-foreground"}`} />}
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">组合联动</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">多词关联，通过综合填空与辨析考察词组运用。</p>
              <span className="mt-2 text-[10px] text-muted-foreground/70">
                {selectedIds.size >= 2 ? `已选 ${selectedIds.size} 词，点击开始` : "需勾选 2-5 个单词"}
              </span>
            </button>
          </div>

          {/* Onboarding tooltip */}
          <AnimatePresence>
            {showOnboarding && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-5 bg-primary/5 border border-primary/15 rounded-xl p-3 flex items-start gap-2.5"
              >
                <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-foreground font-medium">想要组合练习？</p>
                  <p className="text-[11px] text-muted-foreground">先在下方展开某个等级，勾选 2 个以上的单词，即可解锁「组合联动」模式！</p>
                </div>
                <button
                  onClick={() => { setShowOnboarding(false); localStorage.setItem("review_onboarding_seen", "1"); }}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                >
                  知道了
                </button>
              </motion.div>
            )}
          </AnimatePresence>


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
                  {filteredWords.map(v => {
                    const isChecked = selectedIds.has(v.id);
                    const checkboxId = `word-check-${v.id}`;
                    return (
                      <label
                        key={v.id}
                        htmlFor={checkboxId}
                        className={`group flex items-center gap-3 bg-card rounded-xl p-3 border cursor-pointer select-text transition-all ${
                          isChecked
                            ? "border-primary/30 bg-primary/5"
                            : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`shrink-0 transition-opacity ${isChecked ? "opacity-100" : "opacity-30 group-hover:opacity-70"}`}>
                          <Checkbox
                            id={checkboxId}
                            checked={isChecked}
                            onCheckedChange={() => toggleSelect(v.id)}
                            className="h-4 w-4 pointer-events-auto"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{v.word}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{v.chinese_definition}</p>
                        </div>
                        {v.phonetic && <span className="text-[10px] text-muted-foreground shrink-0">{v.phonetic}</span>}
                        {/* Mastery selector — stopPropagation inside component */}
                        <MasterySelector
                          vocabId={v.id}
                          currentLevel={v.mastery_level}
                          size="sm"
                          onUpdate={(newLevel) => {
                            setAllVocab(prev => prev.map(w =>
                              w.id === v.id ? { ...w, mastery_level: newLevel } : w
                            ));
                            // Deselect if moved away from current filter
                            if (activeMastery !== null && newLevel !== activeMastery) {
                              setSelectedIds(prev => { const n = new Set(prev); n.delete(v.id); return n; });
                            }
                          }}
                        />
                      </label>
                    );
                  })}
                  {filteredWords.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-6">该等级暂无单词</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Semantic field recommendation */}
        <AnimatePresence>
          {semanticSuggestions.length > 0 && selectedIds.size >= 1 && selectedIds.size < 5 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-4 bg-primary/5 border border-primary/15 rounded-xl p-3"
            >
              <p className="text-xs text-primary font-medium flex items-center gap-1 mb-2">
                <Lightbulb className="h-3.5 w-3.5" /> 语义场推荐：检测到相似词汇，是否一并加入组合记忆？
              </p>
              <div className="flex flex-wrap gap-1.5">
                {semanticSuggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleSelect(s.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-card border border-border hover:border-primary/40 text-foreground transition-colors"
                  >
                    <span>{s.word}</span>
                    <span className="text-muted-foreground">({s.chinese_definition.slice(0, 8)})</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating selection indicator */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border border-border shadow-lg rounded-2xl px-5 py-3 flex items-center gap-3"
            >
              <span className="text-sm text-foreground font-medium whitespace-nowrap">
                已选择 <span className="text-primary font-bold">{selectedIds.size}</span> 个单词
              </span>
              <span className="text-[10px] text-muted-foreground">
                {selectedIds.size >= 2 ? "可使用组合联动" : "再选 1 个可组合"}
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                清除
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==================== COMBO MODE (Overlay) ====================
  if (mode === "combo" && comboData) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => { backToDashboard(); resetComboState(); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">组合特训</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-1">多词联动 · {selectedWords.map(w => w.word).join("、")}</p>

          {/* Mode badge */}
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Layers className="h-3 w-3" /> 多词联动模式
          </motion.div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${comboProgressPercent}%` }} transition={{ duration: 0.3 }} />
            </div>
            <span className="text-xs text-muted-foreground">{COMBO_PHASE_LABELS[comboPhase]}</span>
          </div>

          <AnimatePresence mode="wait">
            {/* NARRATIVE */}
            {comboPhase === "narrative" && (
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
                        <button key={w} disabled={narrativeRevealed || used}
                          onClick={() => {
                            const nextEmpty = comboData.narrativeCloze.blanks.findIndex((_, i) => !narrativeAnswers[i]);
                            if (nextEmpty !== -1) setNarrativeAnswers(prev => ({ ...prev, [nextEmpty]: w }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${used ? "opacity-40 bg-muted border-transparent" : "bg-card border-border hover:border-primary/40 text-foreground"}`}
                        >{w}</button>
                      );
                    })}
                </div>
                {!narrativeRevealed && Object.keys(narrativeAnswers).length > 0 && (
                  <button onClick={() => setNarrativeAnswers({})} className="text-xs text-muted-foreground hover:text-foreground mb-3 underline">重置选择</button>
                )}
                {narrativeRevealed && comboData.narrativeCloze.wordRelationships && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-4">
                    <p className="text-xs font-medium text-primary mb-1.5">🔗 词汇逻辑关系</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{comboData.narrativeCloze.wordRelationships}</p>
                  </motion.div>
                )}
                <div className="flex gap-2">
                  {!narrativeRevealed ? (
                    <button onClick={() => setNarrativeRevealed(true)} disabled={Object.keys(narrativeAnswers).length < comboData.narrativeCloze.blanks.length} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40">检查答案</button>
                  ) : (
                    <button onClick={goNextComboPhase} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">下一题型 <ArrowRight className="h-4 w-4" /></button>
                  )}
                </div>
              </motion.div>
            )}

            {/* NUANCE */}
            {comboPhase === "nuance" && comboData.nuanceQuestions.length > 0 && (
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
                            <button key={w}
                              onClick={() => {
                                if (!myAnswers.a) setNuanceAnswers(prev => ({ ...prev, [nuanceIdx]: { ...myAnswers, a: w } }));
                                else if (!myAnswers.b && w !== myAnswers.a) setNuanceAnswers(prev => ({ ...prev, [nuanceIdx]: { ...myAnswers, b: w } }));
                              }}
                              className="flex-1 py-2.5 rounded-xl border bg-card text-sm font-medium text-foreground hover:border-primary/40"
                            >{w}</button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        {!nuanceRevealed ? (
                          <button onClick={() => setNuanceRevealed(true)} disabled={!myAnswers.a || !myAnswers.b} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40">检查答案</button>
                        ) : nuanceIdx < comboData.nuanceQuestions.length - 1 ? (
                          <button onClick={() => { setNuanceIdx(i => i + 1); setNuanceRevealed(false); }} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">下一题 <ArrowRight className="h-4 w-4" /></button>
                        ) : (
                          <button onClick={goNextComboPhase} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">下一题型 <ArrowRight className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* COLLOCATION phase removed - replaced by integrated multi-word context */}

            {/* SYNTHESIS - 汉译英挑战 */}
            {comboPhase === "synthesis" && comboData.synthesisQuestions && comboData.synthesisQuestions.length > 0 && (
              <motion.div key="synthesis" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
                {(() => {
                  const q = comboData.synthesisQuestions[synthIdx];
                  if (!q) return null;
                  // Support both new chinesePrompt and legacy chineseSentences
                  const chineseText = q.chinesePrompt || (q.chineseSentences ? q.chineseSentences.join("；") : "");

                  const renderReference = (text: string) => {
                    const parts = text.split(/\*\*(.*?)\*\*/g);
                    return parts.map((part, i) =>
                      i % 2 === 1
                        ? <span key={i} className="text-primary font-bold underline decoration-primary/40 underline-offset-2">{part}</span>
                        : <span key={i}>{part}</span>
                    );
                  };

                  return (
                    <div>
                      <div className="bg-card rounded-2xl p-5 shadow-warm mb-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-medium mb-3 bg-accent/50 text-accent-foreground">汉译英挑战</span>
                        <p className="text-xs text-muted-foreground mb-3">
                          请使用 {q.targetWords.map((tw, i) => (
                            <span key={tw}>{i > 0 && " 和 "}<span className="font-bold text-primary">{tw}</span></span>
                          ))} 将以下中文翻译为英文
                        </p>
                        <div className="p-3 bg-muted/50 rounded-xl">
                          <p className="text-sm text-foreground leading-relaxed">{chineseText}</p>
                        </div>
                      </div>
                      <textarea
                        value={synthInput}
                        onChange={(e) => setSynthInput(e.target.value)}
                        placeholder="输入你的英文翻译…"
                        disabled={synthRevealed}
                        className="w-full bg-card rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground border outline-none focus:ring-2 focus:ring-primary/20 resize-none h-28 mb-3"
                      />
                      {synthRevealed && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 mb-4">
                          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                            <p className="text-xs text-muted-foreground mb-1.5">参考译文：</p>
                            <p className="text-sm text-foreground leading-relaxed">{renderReference(q.referenceSentence)}</p>
                          </div>
                          {q.wordForms && q.wordForms.length > 0 && (
                            <div className="bg-muted/30 border border-border rounded-xl p-3">
                              <p className="text-xs text-muted-foreground mb-2">📝 词性变形与角色：</p>
                              <div className="space-y-1">
                                {q.wordForms.map((wf, i) => (
                                  <p key={i} className="text-xs text-foreground">
                                    <span className="font-bold text-primary">{wf.word}</span>
                                    <span className="text-muted-foreground"> → {wf.formUsed}，{wf.roleInSentence}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* AI Score Section */}
                          {synthScoring && (
                            <div className="flex items-center justify-center gap-2 py-4">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              <span className="text-sm text-muted-foreground">AI 正在评分…</span>
                            </div>
                          )}
                          {synthScore && !synthScoring && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                                  synthScore.score >= 90 ? "bg-emerald-500" : synthScore.score >= 75 ? "bg-primary" : synthScore.score >= 60 ? "bg-yellow-500" : "bg-red-500"
                                }`}>
                                  {synthScore.score}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-foreground">{synthScore.level}</p>
                                  <p className="text-[10px] text-muted-foreground">AI 综合评分</p>
                                </div>
                              </div>
                              {synthScore.dimensions && (
                                <div className="space-y-2">
                                  {synthScore.dimensions.map((d: any, i: number) => (
                                    <div key={i}>
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[11px] text-foreground font-medium">{d.name}</span>
                                        <span className="text-[11px] text-muted-foreground">{d.score}/{d.max}</span>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(d.score / d.max) * 100}%` }} />
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{d.comment}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {synthScore.highlights && synthScore.highlights.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-medium text-emerald-600 mb-1">✅ 做得好：</p>
                                  {synthScore.highlights.map((h: string, i: number) => (
                                    <p key={i} className="text-[11px] text-muted-foreground">• {h}</p>
                                  ))}
                                </div>
                              )}
                              {synthScore.improvements && synthScore.improvements.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-medium text-amber-600 mb-1">💡 改进建议：</p>
                                  {synthScore.improvements.map((imp: string, i: number) => (
                                    <p key={i} className="text-[11px] text-muted-foreground">• {imp}</p>
                                  ))}
                                </div>
                              )}
                              {synthScore.correctedVersion && (
                                <div className="bg-muted/30 rounded-lg p-3">
                                  <p className="text-[11px] font-medium text-foreground mb-1">📝 修正参考：</p>
                                  <p className="text-xs text-foreground leading-relaxed">{synthScore.correctedVersion}</p>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </motion.div>
                      )}
                      <div className="flex gap-2">
                        {!synthRevealed ? (
                          <button
                            onClick={async () => {
                              setSynthRevealed(true);
                              setSynthScoring(true);
                              setSynthScore(null);
                              try {
                                const { data, error } = await supabase.functions.invoke("score-translation", {
                                  body: {
                                    userTranslation: synthInput,
                                    referenceSentence: q.referenceSentence.replace(/\*\*/g, ""),
                                    chinesePrompt: chineseText,
                                    targetWords: q.targetWords,
                                  },
                                });
                                if (error) throw error;
                                if (data.error) throw new Error(data.error);
                                setSynthScore(data);
                              } catch (e: any) {
                                console.error(e);
                                toast.error(e.message || "评分失败");
                              } finally {
                                setSynthScoring(false);
                              }
                            }}
                            disabled={!synthInput.trim()}
                            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1"
                          >
                            <Eye className="h-4 w-4" /> 提交并评分
                          </button>
                        ) : synthIdx < comboData.synthesisQuestions.length - 1 ? (
                          <button onClick={() => { setSynthIdx(i => i + 1); setSynthInput(""); setSynthRevealed(false); setSynthScore(null); }} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">下一题 <ArrowRight className="h-4 w-4" /></button>
                        ) : (
                          <button onClick={goNextComboPhase} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">查看总结 <Sparkles className="h-4 w-4" /></button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-2">{synthIdx + 1}/{comboData.synthesisQuestions.length}</p>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* SUMMARY */}
            {comboPhase === "summary" && (
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
                    onClick={() => { resetComboState(); setSelectedIds(new Set()); backToDashboard(); }}
                    className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium text-sm"
                  >
                    返回概览
                  </button>
                  <button
                    onClick={() => { resetComboState(); setMode("dashboard"); }}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="h-4 w-4" /> 再来一组
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ==================== SINGLE REVIEW MODE ====================

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
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={backToDashboard} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4 rotate-180" />
        </button>
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-display font-bold text-foreground">三步回顾</h2>
      </div>

      {/* Mode badge */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
        <BookOpen className="h-3 w-3" /> 单词强化模式
      </motion.div>

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
