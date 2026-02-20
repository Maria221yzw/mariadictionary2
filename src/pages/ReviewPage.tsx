import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, ArrowRight, RotateCcw, Loader2, BookOpen, ChevronUp, Eye, Layers, Settings2, Lightbulb, Target, Link2, Library, Trophy, ChevronDown, Save, BookMarked, Pencil, Shuffle, AlignLeft, Wand2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import MasterySelector from "@/components/MasterySelector";

// ===== Practice Config Types =====
type PracticeDifficulty = "basic" | "advanced" | "native";

const DIFFICULTY_LABELS: Record<PracticeDifficulty, string> = {
  basic: "基础认知",
  advanced: "进阶运用",
  native: "母语者水平",
};

// ===== Question Type Config =====
type QTypeKey = "recognition" | "cloze" | "builder" | "error_correction" | "register_matching" | "synonym_nuance" | "definition_matching" | "translation";

interface QTypeConfig {
  key: QTypeKey;
  label: string;
  icon: string;
  description: string;
  defaultCount: number;
}

const ALL_Q_TYPES: QTypeConfig[] = [
  { key: "recognition",         label: "看英选中",     icon: "👁",  description: "看英文语境，选出最准确的中文含义", defaultCount: 3 },
  { key: "cloze",               label: "选词填空",     icon: "✏️", description: "英文句子填空，从四个选项中选最佳答案", defaultCount: 3 },
  { key: "builder",             label: "碎片组句",     icon: "🧩", description: "拖拽英文碎片，还原完整句子", defaultCount: 2 },
  { key: "error_correction",    label: "语篇纠错",     icon: "🛠", description: "识别句子中故意制造的搭配或语域错误", defaultCount: 2 },
  { key: "register_matching",   label: "语域风格对齐", icon: "🎭", description: "将口语表达改写为指定正式度等级的句子", defaultCount: 2 },
  { key: "synonym_nuance",      label: "近义词辨析",   icon: "🔍", description: "在极端精确语境中选出最地道、最不可替代的词", defaultCount: 2 },
  { key: "definition_matching", label: "英文释义配对", icon: "📖", description: "根据纯英文学术定义，配对最准确的词汇", defaultCount: 2 },
  { key: "translation",         label: "全句翻译拼写", icon: "🖊️", description: "看中文提示，自由输入完整英文译句，AI实时评分", defaultCount: 2 },
];

type PracticeConfig = {
  types: Record<QTypeKey, { enabled: boolean; count: number }>;
  difficulty: PracticeDifficulty;
};

const DEFAULT_CONFIG: PracticeConfig = {
  difficulty: "advanced",
  types: Object.fromEntries(
    ALL_Q_TYPES.map(t => [t.key, { enabled: t.key === "recognition" || t.key === "cloze" || t.key === "builder", count: t.defaultCount }])
  ) as Record<QTypeKey, { enabled: boolean; count: number }>,
};

function loadSavedConfig(): PracticeConfig | null {
  try {
    const raw = localStorage.getItem("practice_config_v2");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveConfig(cfg: PracticeConfig) {
  localStorage.setItem("practice_config_v2", JSON.stringify(cfg));
}

// Scene micro-tag colours for the review card header
const SCENE_TAG_STYLES: Record<string, string> = {
  academic:     "bg-blue-500/10 text-blue-600 border-blue-500/20",
  professional: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  colloquial:   "bg-green-500/10 text-green-600 border-green-500/20",
  literary:     "bg-purple-500/10 text-purple-600 border-purple-500/20",
  exam:         "bg-rose-500/10 text-rose-600 border-rose-500/20",
};



// ===== Interfaces =====
interface VocabWord {
  id: string;
  word: string;
  chinese_definition: string;
  phonetic: string | null;
  mastery_level: number;
}

interface MaterialItem {
  id: string;
  content: string;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
}

interface CorpusItem {
  id: string;
  application_scenario: string;
  vocab_table: { id: string; word: string; chinese_definition: string } | null;
}

// ── New question interfaces ───────────────────────────────────────────────────
type QType = "recognition" | "cloze" | "builder" | "error_correction" | "register_matching" | "synonym_nuance" | "definition_matching" | "translation";

interface Q {
  qIndex: number;
  qType: QType;
  scene: string;
  scenarioLabel: string;
  // recognition
  contextSentence?: string;
  options?: string[];
  answer?: string;
  // cloze
  clozeSentence?: string;
  // builder
  promptCn?: string;
  builderAnswer?: string;
  sentenceFragments?: string[];
  // error_correction
  errorSentence?: string;
  // register_matching
  informalSentence?: string;
  targetRegister?: string;
  // synonym_nuance
  synonymContext?: string;
  synonymPool?: string[];
  // definition_matching
  englishDefinition?: string;
  // translation (full sentence translation & writing)
  chinesePrompt?: string;       // Chinese prompt shown to user
  translationAnswer?: string;   // Reference English sentence
  // shared
  explanationCn?: string;
}

interface WordResult {
  vocabId: string;
  word: string;
  wordCn: string;
  phonetic: string | null;
  masteryLevel: number;
  questions: Q[];
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

  // Material picker state
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"materials" | "corpus">("materials");
  const [pickerMaterials, setPickerMaterials] = useState<MaterialItem[]>([]);
  const [pickerCorpus, setPickerCorpus] = useState<CorpusItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSubTag, setPickerSubTag] = useState<string | null>(null);
  // selectedMaterialIds: ids from material_entries picked for review context
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());

  // Practice config state
  const [practiceConfig, setPracticeConfig] = useState<PracticeConfig>(() => loadSavedConfig() ?? DEFAULT_CONFIG);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);
  const practiceDifficulty = practiceConfig.difficulty;
  const setPracticeDifficulty = (d: PracticeDifficulty) =>
    setPracticeConfig(prev => ({ ...prev, difficulty: d }));


  // Review state (single word mode)
  const [mode, setMode] = useState<PageMode>("dashboard");
  const [words, setWords] = useState<WordResult[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0); // 0-9 within current word
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [questionFailed, setQuestionFailed] = useState(false);
  const [showMasteryPrompt, setShowMasteryPrompt] = useState(false);

  // Scoring state
  const [questionScores, setQuestionScores] = useState<number[]>([]);
  const [scorePopup, setScorePopup] = useState<{ value: number; key: number } | null>(null);

  // Sentence Builder state (builder questions)
  const [builderPlaced, setBuilderPlaced] = useState<string[]>([]);
  const [builderShuffled, setBuilderShuffled] = useState<string[]>([]);

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
  // Translation question state
  const [transInput, setTransInput] = useState("");
  const [transRevealed, setTransRevealed] = useState(false);
  const [transScoring, setTransScoring] = useState(false);
  const [transScore, setTransScore] = useState<any>(null);
  const transTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem("review_onboarding_seen"));

  // Fetch vocab
  const refreshVocab = useCallback(async () => {
    setLoadingVocab(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingVocab(false); return; }
      const { data, error } = await supabase
        .from("vocab_table")
        .select("id, word, chinese_definition, phonetic, mastery_level")
        .order("mastery_level", { ascending: true });
      if (error) throw error;
      setAllVocab(data || []);
    } catch (e) {
      console.error("加载词库失败:", e);
      toast.error("加载词库失败，请刷新重试");
    } finally {
      setLoadingVocab(false);
    }
  }, []);

  // Load vocab on mount
  useEffect(() => {
    refreshVocab();
  }, [refreshVocab]);

  // Init builder when we enter a builder question
  useEffect(() => {
    if (currentWord) {
      const q = currentWord.questions?.[questionIdx];
      if (q?.qType === "builder") {
        const frags = q.sentenceFragments || [];
        const shuffled = [...frags].sort(() => Math.random() - 0.5);
        setBuilderShuffled(shuffled);
        setBuilderPlaced([]);
      }
      // Auto-focus textarea for translation questions
      if (q?.qType === "translation") {
        setTimeout(() => transTextareaRef.current?.focus(), 80);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIdx, wordIdx]);

  // Pre-select word from corpus navigation (URL param: ?vocabId=xxx)
  useEffect(() => {
    const vocabId = searchParams.get("vocabId");
    if (vocabId && !loadingVocab) {
      setSelectedIds(new Set([vocabId]));
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

  // Semantic field recommendation
  const semanticSuggestions = useMemo(() => {
    if (selectedIds.size === 0 || selectedIds.size >= 5) return [];
    const selectedDefs = selectedWords.map(w => w.chinese_definition);
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
    if (selectedIds.size === 0) {
      toast.error("未检测到选中单词，请重新选择");
      return;
    }
    // Save config if user wants it as default
    if (saveAsDefault) saveConfig(practiceConfig);

    setLoadingReview(true);
    setWords([]); setWordIdx(0); setQuestionIdx(0);
    setSelected(null); setRevealed(false); setQuestionFailed(false);
    setShowMasteryPrompt(false); setQuestionScores([]);
    setBuilderPlaced([]); setBuilderShuffled([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("请先登录"); setLoadingReview(false); return; }

      // Build a fetch with a 120s timeout so the UI never hangs forever
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/generate-review`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            difficulty: practiceDifficulty,
            wordIds: Array.from(selectedIds),
            typeConfig: practiceConfig.types,
          }),
        }
      );
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      if (data.empty) { toast.error("没有可复习的单词"); return; }
      setWords(data.words || []);
      setMode("review");
    } catch (e: any) {
      console.error("生成练习题失败:", e);
      if (e?.name === "AbortError") {
        toast.error("生成超时，请减少选择单词数量后重试");
      } else if (e?.message?.includes("429")) {
        toast.error("请求过于频繁，请稍后再试");
      } else {
        toast.error("生成练习题失败，请重试");
      }
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
  const currentQ = currentWord?.questions?.[questionIdx];
  const totalQuestions = words.reduce((acc, w) => acc + (w.questions?.length || 0), 0);
  const completedQuestions = wordIdx * 10 + questionIdx;

  // ── Normalize for builder scoring ─────────────────────────────────────────
  const normalizeForCompare = (s: string) =>
    s.trim().replace(/\s+/g, " ").replace(/([,;])\s*/g, "$1 ").replace(/[.!?]+$/, "").toLowerCase();

  const showScorePopup = (points: number) => {
    setScorePopup({ value: points, key: Date.now() });
    setTimeout(() => setScorePopup(null), 1500);
  };

  // ── Check MCQ answer (recognition + cloze) ───────────────────────────────
  const handleMCQCheck = () => {
    const correct = selected === currentQ?.answer;
    setRevealed(true);
    setQuestionFailed(!correct);
    const pts = correct ? 10 : 0;
    setQuestionScores(prev => [...prev, pts]);
    showScorePopup(pts);
  };

  // ── Submit builder ────────────────────────────────────────────────────────
  const handleBuilderSubmit = () => {
    const frags = currentQ?.sentenceFragments || [];
    const normalizedPlaced = builderPlaced.map(normalizeForCompare);
    const normalizedFrags = frags.map(normalizeForCompare);
    const correctCount = normalizedPlaced.filter((f, i) => f === normalizedFrags[i]).length;
    const hasWord = builderPlaced.some(f =>
      normalizeForCompare(f).includes((currentWord?.word || "").toLowerCase())
    );
    let pts = 0;
    if (!hasWord) pts = 0;
    else if (correctCount === normalizedFrags.length && normalizedPlaced.length === normalizedFrags.length) pts = 10;
    else pts = Math.round((correctCount / Math.max(normalizedFrags.length, 1)) * 10);
    setQuestionScores(prev => [...prev, pts]);
    showScorePopup(pts);
    setRevealed(true);
    setQuestionFailed(pts < 10);
  };

  // ── Advance to next question / next word / mastery prompt ─────────────────
  const advanceQuestion = () => {
    const qTotal = currentWord?.questions?.length || 10;
    setSelected(null);
    setRevealed(false);
    setQuestionFailed(false);
    setBuilderPlaced([]);
    setBuilderShuffled([]);
    setTransInput("");
    setTransRevealed(false);
    setTransScoring(false);
    setTransScore(null);
    if (questionIdx < qTotal - 1) {
      setQuestionIdx(q => q + 1);
    } else {
      // All questions done for this word — show mastery prompt
      setShowMasteryPrompt(true);
    }
  };

  const handleMasteryChoice = async (upgrade: boolean) => {
    if (upgrade && currentWord?.vocabId && currentWord.masteryLevel < 5) {
      const newLevel = Math.min(currentWord.masteryLevel + 1, 5);
      await supabase.from("vocab_table").update({ mastery_level: newLevel }).eq("id", currentWord.vocabId);
      toast.success(`「${currentWord.word}」已升至 ${MASTERY_LABELS[newLevel]}`);
    }
    setShowMasteryPrompt(false);
    setQuestionIdx(0);
    setSelected(null); setRevealed(false); setQuestionFailed(false);
    setBuilderPlaced([]); setBuilderShuffled([]);
    setWordIdx(i => i + 1);
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

  // Fetch picker data (materials + corpus)
  const fetchPickerData = useCallback(async () => {
    setPickerLoading(true);
    const [matRes, corpRes] = await Promise.all([
      supabase.from("material_entries" as any).select("id, content, notes, source, tags").order("created_at", { ascending: false }),
      supabase.from("corpus_entries").select("id, application_scenario, vocab_table(id, word, chinese_definition)").order("created_at", { ascending: false }),
    ]);
    setPickerMaterials((matRes.data as any) || []);
    setPickerCorpus((corpRes.data as any) || []);
    setPickerLoading(false);
  }, []);

  const openMaterialPicker = () => {
    setPickerSubTag(null);
    setPickerTab("materials");
    setShowMaterialPicker(true);
    fetchPickerData();
  };

  const pickerMaterialSubTags = useMemo(() => {
    const s = new Set<string>();
    pickerMaterials.forEach(m => { if (m.source) s.add(m.source); });
    return Array.from(s);
  }, [pickerMaterials]);

  const pickerCorpusSubTags = useMemo(() => {
    const s = new Set<string>();
    pickerCorpus.forEach(e => { if (e.application_scenario) s.add(e.application_scenario); });
    return Array.from(s);
  }, [pickerCorpus]);

  const filteredPickerMaterials = useMemo(() => {
    if (!pickerSubTag) return pickerMaterials;
    return pickerMaterials.filter(m => m.source === pickerSubTag);
  }, [pickerMaterials, pickerSubTag]);

  const filteredPickerCorpus = useMemo(() => {
    if (!pickerSubTag) return pickerCorpus;
    return pickerCorpus.filter(e => e.application_scenario === pickerSubTag);
  }, [pickerCorpus, pickerSubTag]);

  const toggleMaterialSelect = (id: string) => {
    setSelectedMaterialIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
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
      <>
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
          <div className="bg-card border border-border rounded-2xl mb-5 overflow-hidden">
            {/* Header – always visible */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
              onClick={() => setConfigExpanded(e => !e)}
            >
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-primary" /> 练习配置
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${configExpanded ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {configExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-5 border-t border-border pt-4">
                    {/* Difficulty */}
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide font-semibold">难度等级</p>
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

                    {/* Question Type Matrix */}
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2.5 uppercase tracking-wide font-semibold">题型矩阵</p>
                      <div className="space-y-2">
                        {ALL_Q_TYPES.map(qt => {
                          const cfg = practiceConfig.types[qt.key];
                          return (
                            <div
                              key={qt.key}
                              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                cfg.enabled ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"
                              }`}
                            >
                              {/* Toggle */}
                              <button
                                onClick={() =>
                                  setPracticeConfig(prev => ({
                                    ...prev,
                                    types: {
                                      ...prev.types,
                                      [qt.key]: { ...prev.types[qt.key], enabled: !cfg.enabled },
                                    },
                                  }))
                                }
                                className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${cfg.enabled ? "bg-primary" : "bg-muted"}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform ${cfg.enabled ? "left-[18px]" : "left-0.5"}`} />
                              </button>
                              {/* Icon + Name */}
                              <span className="text-base leading-none shrink-0">{qt.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold ${cfg.enabled ? "text-foreground" : "text-muted-foreground"}`}>{qt.label}</p>
                                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">{qt.description}</p>
                              </div>
                              {/* Count Control */}
                              {cfg.enabled && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() =>
                                      setPracticeConfig(prev => ({
                                        ...prev,
                                        types: {
                                          ...prev.types,
                                          [qt.key]: { ...prev.types[qt.key], count: Math.max(1, cfg.count - 1) },
                                        },
                                      }))
                                    }
                                    className="w-6 h-6 rounded-full border border-border bg-background flex items-center justify-center text-sm text-muted-foreground hover:bg-muted transition-colors"
                                  >−</button>
                                  <span className="w-5 text-center text-xs font-bold text-foreground">{cfg.count}</span>
                                  <button
                                    onClick={() =>
                                      setPracticeConfig(prev => ({
                                        ...prev,
                                        types: {
                                          ...prev.types,
                                          [qt.key]: { ...prev.types[qt.key], count: Math.min(10, cfg.count + 1) },
                                        },
                                      }))
                                    }
                                    className="w-6 h-6 rounded-full border border-border bg-background flex items-center justify-center text-sm text-muted-foreground hover:bg-muted transition-colors"
                                  >+</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Save as Default */}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          onClick={() => setSaveAsDefault(v => !v)}
                          className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${saveAsDefault ? "bg-primary" : "bg-muted"}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform ${saveAsDefault ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Save className="h-3 w-3" /> 下次启动时自动加载此配置
                        </span>
                      </label>
                      <button
                        onClick={() => { saveConfig(practiceConfig); toast.success("配置已保存"); }}
                        className="text-[10px] text-primary hover:underline"
                      >
                        立即保存
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Always-visible summary strip */}
            {!configExpanded && (
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {ALL_Q_TYPES.filter(qt => practiceConfig.types[qt.key].enabled).map(qt => (
                  <span key={qt.key} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    {qt.icon} {qt.label} ×{practiceConfig.types[qt.key].count}
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {DIFFICULTY_LABELS[practiceDifficulty]}
                </span>
              </div>
            )}
          </div>

          {/* Mode Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {/* Mode A: Individual Mastery */}
            {(() => {
              const reinforceDisabled = selectedIds.size === 0;
              return (
                <div className="relative group/reinforce">
                  <button
                    onClick={() => {
                      if (reinforceDisabled) {
                        toast.error("未检测到选中单词，请重新选择");
                        return;
                      }
                      startReview();
                    }}
                    disabled={loadingReview || allVocab.length === 0}
                    title={reinforceDisabled ? "请先在下方勾选想要练习的单词" : undefined}
                    className={`w-full flex flex-col items-start p-4 rounded-2xl border transition-all text-left ${
                      reinforceDisabled
                        ? "border-border bg-muted/40 opacity-60 cursor-not-allowed"
                        : "border-primary/30 bg-primary/5 hover:shadow-md hover:border-primary/50 cursor-pointer"
                    } disabled:opacity-40`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${reinforceDisabled ? "bg-muted" : "bg-primary/10"}`}>
                      {loadingReview ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Target className={`h-5 w-5 ${reinforceDisabled ? "text-muted-foreground" : "text-primary"}`} />}
                    </div>
                    <h3 className="text-sm font-bold text-foreground mb-1">单词强化</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">逐一攻克，深度记忆每个词的词性变形与翻译。</p>
                    <span className="mt-2 text-[10px] text-muted-foreground/70">
                      {selectedIds.size === 1 ? "将针对选中的 1 个词练习" : selectedIds.size > 1 ? `将针对选中的 ${selectedIds.size} 个词练习` : "请先在下方勾选单词"}
                    </span>
                    {selectedIds.size > 0 && (() => {
                      const enabledTypes = ALL_Q_TYPES.filter(qt => practiceConfig.types[qt.key].enabled);
                      const qPerWord = enabledTypes.reduce((s, qt) => s + practiceConfig.types[qt.key].count, 0);
                      const total = selectedIds.size * qPerWord;
                      return (
                        <span className="mt-1.5 text-[10px] font-medium text-primary flex items-center gap-1">
                          <Wand2 className="h-3 w-3" />
                          预计 {total} 道题 · {selectedIds.size} 词 × {qPerWord} 题/词
                        </span>
                      );
                    })()}
                  </button>
                  {reinforceDisabled && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-foreground text-background text-[10px] rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover/reinforce:opacity-100 transition-opacity z-10 shadow-md">
                      请先在下方勾选想要练习的单词
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-foreground" />
                    </div>
                  )}
                </div>
              );
            })()}

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

          {/* From Corpus button */}
          <button
            onClick={openMaterialPicker}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-sm text-primary hover:bg-primary/10 transition-colors mb-5"
          >
            <span className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              从仓库添加素材
            </span>
            <span className="text-[10px] text-muted-foreground">
              {selectedMaterialIds.size > 0 ? `已选 ${selectedMaterialIds.size} 条素材` : "灵感素材 · 查词沉淀"}
            </span>
          </button>

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

      {/* Material Picker Modal */}
      <AnimatePresence>
        {showMaterialPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/20 backdrop-blur-sm p-4"
            onClick={() => setShowMaterialPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-card rounded-2xl shadow-warm-lg border w-full max-w-lg max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Library className="h-4 w-4 text-primary" />
                  <h3 className="font-display font-semibold text-foreground text-sm">从仓库选取素材</h3>
                </div>
                <button onClick={() => setShowMaterialPicker(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-0 border-b shrink-0">
                {([
                  { key: "materials", label: "灵感素材", icon: <Library className="h-3.5 w-3.5" /> },
                  { key: "corpus", label: "查词沉淀", icon: <BookOpen className="h-3.5 w-3.5" /> },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setPickerTab(t.key); setPickerSubTag(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                      pickerTab === t.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* Sub-tag chips */}
              {(() => {
                const subTags = pickerTab === "materials" ? pickerMaterialSubTags : pickerCorpusSubTags;
                return subTags.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-2.5 shrink-0 border-b">
                    <button
                      onClick={() => setPickerSubTag(null)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                        pickerSubTag === null ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary border border-primary/20"
                      }`}
                    >全部</button>
                    {subTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setPickerSubTag(pickerSubTag === tag ? null : tag)}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                          pickerSubTag === tag ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary border border-primary/20"
                        }`}
                      >{tag}</button>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {pickerLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : pickerTab === "materials" ? (
                  filteredPickerMaterials.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">暂无素材</p>
                  ) : filteredPickerMaterials.map(m => {
                    const isSelected = selectedMaterialIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className={`shrink-0 mt-0.5 transition-opacity ${isSelected ? "opacity-100" : "opacity-30"}`}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleMaterialSelect(m.id)} className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground font-medium line-clamp-2">{m.content}</p>
                          {m.source && <p className="text-[10px] text-primary mt-0.5">{m.source}</p>}
                          {m.notes && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">📝 {m.notes}</p>}
                        </div>
                      </label>
                    );
                  })
                ) : (
                  filteredPickerCorpus.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">暂无收藏</p>
                  ) : filteredPickerCorpus.map(e => {
                    if (!e.vocab_table) return null;
                    const vocabId = e.vocab_table.id;
                    const isSelected = selectedIds.has(vocabId);
                    return (
                      <label
                        key={e.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className={`shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-30"}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(vocabId)}
                            className="h-4 w-4"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{e.vocab_table.word}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{e.vocab_table.chinese_definition}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{e.application_scenario}</span>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t shrink-0 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  已选 {pickerTab === "materials" ? selectedMaterialIds.size : selectedIds.size} 条
                </span>
                <button
                  onClick={() => setShowMaterialPicker(false)}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  完成选择
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
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
                                  <p className="text-[11px] font-medium text-primary mb-1">✅ 做得好：</p>
                                  {synthScore.highlights.map((h: string, i: number) => (
                                    <p key={i} className="text-[11px] text-muted-foreground">• {h}</p>
                                  ))}
                                </div>
                              )}
                              {synthScore.improvements && synthScore.improvements.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-medium text-foreground mb-1">💡 改进建议：</p>
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

  // Completion — grade dashboard
  if (allDone) {
    const totalScore = questionScores.reduce((a, b) => a + b, 0);
    const maxScore = questionScores.length * 10;
    const pct = maxScore > 0 ? totalScore / maxScore : 0;
    const grade = pct >= 0.9 ? "S" : pct >= 0.75 ? "A" : pct >= 0.6 ? "B" : "C";
    const gradeLabel: Record<string, string> = { S: "Excellent! 🏆", A: "Great! 🎉", B: "Good! 👍", C: "Keep Trying 💪" };
    const gradeColor: Record<string, string> = { S: "text-emerald-500", A: "text-blue-500", B: "text-amber-500", C: "text-red-500" };

    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className={`text-6xl font-display font-black mb-2 ${gradeColor[grade]}`}>{grade}</div>
          <p className="text-lg font-semibold text-foreground mb-1">{gradeLabel[grade]}</p>
          <p className="text-sm text-muted-foreground mb-6">
            共 {words.length} 个单词 · {totalScore}/{maxScore} 分
          </p>
          <div className="bg-card border border-border rounded-2xl p-5 mb-6 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">得分明细</span>
              <span className="text-lg font-bold text-primary">{totalScore} / {maxScore}</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden mb-3">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
              />
            </div>
            <div className="grid grid-cols-10 gap-1">
              {questionScores.map((s, i) => (
                <div
                  key={i}
                  title={`Q${i + 1}: ${s}分`}
                  className={`h-2 rounded-full ${s === 10 ? "bg-emerald-500" : s > 0 ? "bg-amber-500" : "bg-red-400"}`}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">每格代表一道题（绿=全对，黄=部分，红=错误）</p>
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

  // Loading state
  if (loadingReview || (mode === "review" && words.length === 0)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">正在生成 10 题全能训练…</p>
      </div>
    );
  }

  // ── Review card header & progress ─────────────────────────────────────────
  const qTotal = currentWord?.questions?.length || 10;
  const globalTotal = words.length * qTotal;
  const globalDone = wordIdx * qTotal + questionIdx;
  const progressPct = (globalDone / Math.max(globalTotal, 1)) * 100;

  // Q-type label for display
  const Q_TYPE_LABELS: Record<QType, string> = {
    recognition: "看英选义",
    cloze: "选词填空",
    builder: "碎片组句",
    error_correction: "语篇纠错",
    register_matching: "语域对齐",
    synonym_nuance: "近义辨析",
    definition_matching: "释义配对",
    translation: "全句翻译",
  };

  const SCENE_TAG_STYLES_LOCAL: Record<string, string> = {
    academic:     "bg-blue-500/10 text-blue-600 border-blue-500/20",
    professional: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    colloquial:   "bg-green-500/10 text-green-600 border-green-500/20",
    literary:     "bg-purple-500/10 text-purple-600 border-purple-500/20",
    exam:         "bg-rose-500/10 text-rose-600 border-rose-500/20",
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {/* Score popup */}
      <AnimatePresence>
        {scorePopup && (
          <motion.div
            key={scorePopup.key}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -40 }}
            transition={{ duration: 1.2 }}
            className="fixed top-20 right-6 z-50 bg-primary text-primary-foreground text-sm font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none"
          >
            +{scorePopup.value}分
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={backToDashboard} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4 rotate-180" />
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              词 {wordIdx + 1}/{words.length} · 题 {questionIdx + 1}/{qTotal}
            </span>
            <span className="text-xs font-semibold text-primary">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* Mastery upgrade prompt — shown only after all 10 questions of a word */}
      <AnimatePresence>
        {showMasteryPrompt && currentWord && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-2xl p-6 shadow-sm text-center border border-border"
          >
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Trophy className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">「{currentWord.word}」全部通过！</h3>
            <p className="text-sm text-muted-foreground mb-4">10 道练习已完成</p>
            {currentWord.masteryLevel < 5 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  是否提升至「{MASTERY_LABELS[Math.min(currentWord.masteryLevel + 1, 5)]}」？
                </p>
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

      {/* Question card */}
      {!showMasteryPrompt && currentQ && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${wordIdx}-${questionIdx}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
          >
            {/* Word + scene tags */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-display font-bold text-foreground">{currentWord.word}</span>
                {currentWord.phonetic && (
                  <span className="text-xs text-muted-foreground font-mono">{currentWord.phonetic}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${Q_TYPE_LABELS[currentQ.qType] ? "bg-primary/10 text-primary border-primary/20" : ""}`}>
                  {Q_TYPE_LABELS[currentQ.qType]}
                </span>
                {currentQ.scene && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${SCENE_TAG_STYLES_LOCAL[currentQ.scene] || "bg-muted text-muted-foreground border-border"}`}>
                    {currentQ.scenarioLabel}
                  </span>
                )}
              </div>
            </div>

            {/* ── RECOGNITION (Q1-Q3): Show English sentence, choose Chinese meaning ── */}
            {currentQ.qType === "recognition" && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-3">
                    阅读例句，选出该词在此语境中的意思
                  </p>
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/60">
                    <p className="text-sm text-foreground leading-relaxed italic">
                      "{currentQ.contextSentence}"
                    </p>
                  </div>
                </div>
                {/* Options */}
                <div className="space-y-2 mb-4">
                  {(currentQ.options || []).map((opt, i) => {
                    const isCorrect = opt === currentQ.answer;
                    const isSelected = selected === opt;
                    let optClass = "border-border bg-card hover:border-primary/30";
                    if (revealed) {
                      if (isCorrect) optClass = "border-emerald-500 bg-emerald-500/10";
                      else if (isSelected && !isCorrect) optClass = "border-red-500 bg-red-500/10";
                      else optClass = "border-border bg-card opacity-50";
                    } else if (isSelected) {
                      optClass = "border-primary bg-primary/10";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => !revealed && setSelected(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${optClass}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && currentQ.explanationCn && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                    <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleMCQCheck} disabled={!selected} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40">
                      确认答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < qTotal - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── CLOZE (Q4-Q7): Fill the blank ── */}
            {currentQ.qType === "cloze" && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-3">
                    选择最合适的词填入空白处
                  </p>
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/60">
                    <p className="text-sm text-foreground leading-relaxed">
                      {(currentQ.clozeSentence || "").split("___").map((part, i, arr) => (
                        <span key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <span className={`inline-block min-w-[80px] border-b-2 mx-1 px-1 text-center font-semibold ${
                              revealed
                                ? selected === currentQ.answer
                                  ? "border-emerald-500 text-emerald-600"
                                  : "border-red-500 text-red-600"
                                : selected
                                  ? "border-primary text-primary"
                                  : "border-muted-foreground text-muted-foreground"
                            }`}>
                              {selected ? selected.replace(/^[A-D]\.\s*/, "") : "___"}
                            </span>
                          )}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  {(currentQ.options || []).map((opt, i) => {
                    const isCorrect = opt === currentQ.answer;
                    const isSelected = selected === opt;
                    let optClass = "border-border bg-card hover:border-primary/30";
                    if (revealed) {
                      if (isCorrect) optClass = "border-emerald-500 bg-emerald-500/10";
                      else if (isSelected && !isCorrect) optClass = "border-red-500 bg-red-500/10";
                      else optClass = "border-border bg-card opacity-50";
                    } else if (isSelected) {
                      optClass = "border-primary bg-primary/10";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => !revealed && setSelected(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${optClass}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && (
                  <div className="space-y-2 mb-3">
                    <div className="flex items-start gap-2 bg-card border border-border rounded-xl p-3">
                      <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5">我的答案</span>
                      <span className={`text-sm font-medium ${selected === currentQ.answer ? "text-emerald-600" : "text-red-500"}`}>
                        {selected || "（未作答）"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                      <span className="text-[10px] text-emerald-600 shrink-0 pt-0.5">参考答案</span>
                      <span className="text-sm font-medium text-emerald-700">{currentQ.answer}</span>
                    </div>
                    {currentQ.explanationCn && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                        <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleMCQCheck} disabled={!selected} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40">
                      确认答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < qTotal - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── BUILDER (Q8-Q10): Arrange fragments ── */}
            {currentQ.qType === "builder" && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-3">
                    根据中文提示，拼出完整的英文句子
                  </p>
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/60 mb-3">
                    <p className="text-sm text-foreground leading-relaxed">{currentQ.promptCn}</p>
                  </div>
                  {/* Placed fragments */}
                  <div className="min-h-[52px] p-2 bg-background border-2 border-dashed border-primary/30 rounded-xl flex flex-wrap gap-1.5 mb-3">
                    {builderPlaced.length === 0 ? (
                      <span className="text-xs text-muted-foreground self-center w-full text-center">点击下方碎片放置至此</span>
                    ) : (
                      builderPlaced.map((frag, i) => {
                        const isCorrect = revealed && normalizeForCompare(frag) === normalizeForCompare((currentQ.sentenceFragments || [])[i] || "");
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (revealed) return;
                              setBuilderPlaced(prev => prev.filter((_, pi) => pi !== i));
                              setBuilderShuffled(prev => [...prev, frag]);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                              revealed
                                ? isCorrect
                                  ? "bg-emerald-500/10 border-emerald-500 text-emerald-700"
                                  : "bg-red-500/10 border-red-500 text-red-700"
                                : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                            }`}
                          >
                            {frag}
                          </button>
                        );
                      })
                    )}
                  </div>
                  {/* Shuffled fragments pool */}
                  <div className="flex flex-wrap gap-1.5">
                    {builderShuffled.map((frag, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (revealed) return;
                          setBuilderShuffled(prev => prev.filter((_, pi) => pi !== i));
                          setBuilderPlaced(prev => [...prev, frag]);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border bg-card border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
                      >
                        {frag}
                      </button>
                    ))}
                  </div>
                </div>
                {revealed && (
                  <div className="space-y-2 mb-3">
                    <div className="bg-card border border-border rounded-xl p-3">
                      <p className="text-[10px] text-muted-foreground mb-1">我的拼写</p>
                      <p className="text-sm text-foreground">{builderPlaced.join(" ") || "（未作答）"}</p>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-emerald-600 mb-1">参考答案</p>
                      <p className="text-sm">{renderHighlightedAnswer(currentQ.builderAnswer || "")}</p>
                    </div>
                    {currentQ.explanationCn && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                        <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button
                      onClick={handleBuilderSubmit}
                      disabled={builderPlaced.length === 0}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      <Check className="h-4 w-4" /> 提交答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < qTotal - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                  {!revealed && (
                    <button
                      onClick={() => { setBuilderPlaced([]); setBuilderShuffled([...(currentQ.sentenceFragments || [])].sort(() => Math.random() - 0.5)); }}
                      className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm"
                    >
                      重置
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── ERROR CORRECTION: Identify and fix sentence error ── */}
            {(currentQ.qType === "error_correction") && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-base">🛠</span>
                    <span className="text-xs font-semibold text-foreground">找出并改正句中错误</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed italic border-l-2 border-destructive/40 pl-3">
                    {currentQ.errorSentence}
                  </p>
                </div>
                <div className="space-y-2 mb-4">
                  {(currentQ.options || []).map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = revealed && opt === currentQ.answer;
                    const isWrong = revealed && isSelected && opt !== currentQ.answer;
                    return (
                      <button
                        key={opt}
                        onClick={() => !revealed && setSelected(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                          isCorrect ? "border-emerald-400 bg-emerald-400/10 text-emerald-700"
                          : isWrong ? "border-destructive bg-destructive/10 text-destructive"
                          : isSelected ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card hover:border-primary/30 text-foreground"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && currentQ.explanationCn && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                    <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleMCQCheck} disabled={!selected}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                      <Check className="h-4 w-4" /> 提交答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < (currentWord?.questions?.length || 1) - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── REGISTER MATCHING: Rewrite informal to formal register ── */}
            {(currentQ.qType === "register_matching") && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-base">🎭</span>
                    <span className="text-xs font-semibold text-foreground">语域改写</span>
                    {currentQ.targetRegister && (
                      <span className="ml-auto text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5">{currentQ.targetRegister}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">将以下口语表达改写为指定语域：</p>
                  <p className="text-sm text-foreground italic leading-relaxed">{currentQ.informalSentence}</p>
                </div>
                <div className="space-y-2 mb-4">
                  {(currentQ.options || []).map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = revealed && opt === currentQ.answer;
                    const isWrong = revealed && isSelected && opt !== currentQ.answer;
                    return (
                      <button
                        key={opt}
                        onClick={() => !revealed && setSelected(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                          isCorrect ? "border-emerald-400 bg-emerald-400/10 text-emerald-700"
                          : isWrong ? "border-destructive bg-destructive/10 text-destructive"
                          : isSelected ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card hover:border-primary/30 text-foreground"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && currentQ.explanationCn && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                    <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleMCQCheck} disabled={!selected}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                      <Check className="h-4 w-4" /> 提交答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < (currentWord?.questions?.length || 1) - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── SYNONYM NUANCE: Pick the most precise near-synonym ── */}
            {(currentQ.qType === "synonym_nuance") && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-base">🔍</span>
                    <span className="text-xs font-semibold text-foreground">近义词精准辨析</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">在以下语境中，哪个词最地道、最不可替代？</p>
                  <p className="text-sm text-foreground leading-relaxed">{currentQ.synonymContext}</p>
                </div>
                <div className="space-y-2 mb-4">
                  {(currentQ.options || []).map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = revealed && opt === currentQ.answer;
                    const isWrong = revealed && isSelected && opt !== currentQ.answer;
                    return (
                      <button
                        key={opt}
                        onClick={() => !revealed && setSelected(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                          isCorrect ? "border-emerald-400 bg-emerald-400/10 text-emerald-700"
                          : isWrong ? "border-destructive bg-destructive/10 text-destructive"
                          : isSelected ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card hover:border-primary/30 text-foreground"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && currentQ.explanationCn && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                    <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleMCQCheck} disabled={!selected}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                      <Check className="h-4 w-4" /> 提交答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < (currentWord?.questions?.length || 1) - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── DEFINITION MATCHING: Match word to English definition ── */}
            {(currentQ.qType === "definition_matching") && (
              <div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-base">📖</span>
                    <span className="text-xs font-semibold text-foreground">英文释义配对</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">根据以下学术释义，选出对应词汇：</p>
                  <blockquote className="text-sm text-foreground leading-relaxed border-l-2 border-primary/40 pl-3 italic">
                    {currentQ.englishDefinition}
                  </blockquote>
                </div>
                <div className="space-y-2 mb-4">
                  {(currentQ.options || []).map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = revealed && opt === currentQ.answer;
                    const isWrong = revealed && isSelected && opt !== currentQ.answer;
                    return (
                      <button
                        key={opt}
                        onClick={() => !revealed && setSelected(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                          isCorrect ? "border-emerald-400 bg-emerald-400/10 text-emerald-700"
                          : isWrong ? "border-destructive bg-destructive/10 text-destructive"
                          : isSelected ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card hover:border-primary/30 text-foreground"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && currentQ.explanationCn && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                    <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {!revealed ? (
                    <button onClick={handleMCQCheck} disabled={!selected}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                      <Check className="h-4 w-4" /> 提交答案
                    </button>
                  ) : (
                    <button onClick={advanceQuestion}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                      {questionIdx < (currentWord?.questions?.length || 1) - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── TRANSLATION: Full sentence free-writing with AI scoring ── */}
            {currentQ.qType === "translation" && (() => {
              const diffWords = (ref: string, user: string) => {
                const refTokens = ref.replace(/[.!?]$/, "").trim().toLowerCase().split(/\s+/);
                const userTokens = user.replace(/[.!?]$/, "").trim().toLowerCase().split(/\s+/);
                return refTokens.map(token => ({
                  token,
                  matched: userTokens.includes(token),
                }));
              };
              const refSentence = currentQ.translationAnswer || "";
              const targetWord = currentWord.word.toLowerCase();
              const userHasWord = transInput.trim().toLowerCase().includes(targetWord) ||
                // Allow common inflections: -s, -ed, -ing, -ly
                [targetWord + "s", targetWord + "ed", targetWord + "ing", targetWord.replace(/e$/, "ing"), targetWord + "ly"]
                  .some(form => transInput.trim().toLowerCase().includes(form));

              return (
                <div>
                  <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-base">🖊️</span>
                      <span className="text-xs font-semibold text-foreground">全句翻译拼写</span>
                      <span className="ml-auto text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 border border-primary/20">自由输入</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2.5">根据以下中文，用 <span className="font-semibold text-foreground">{currentWord.word}</span> 写出完整英文句子：</p>
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/60">
                      <p className="text-sm text-foreground leading-relaxed font-medium">{currentQ.chinesePrompt}</p>
                    </div>
                    {!transRevealed && (
                      <p className="text-[10px] text-muted-foreground mt-2.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive/60 inline-block" />
                        提交前禁止显示英文原句
                      </p>
                    )}
                  </div>

                  {/* Input area */}
                  {!transRevealed ? (
                    <div className="mb-4">
                      <textarea
                        ref={transTextareaRef}
                        value={transInput}
                        onChange={e => setTransInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && transInput.trim()) {
                            e.preventDefault();
                            // trigger submit via button
                            document.getElementById("trans-submit-btn")?.click();
                          }
                        }}
                        placeholder="在此输入你的英文翻译… (Ctrl+Enter 提交)"
                        className="w-full bg-background border-2 border-border focus:border-primary/50 rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors resize-none h-28"
                      />
                      {transInput.trim() && !userHasWord && (
                        <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                          <X className="h-3 w-3" /> 请在句子中使用目标词「{currentWord.word}」或其词形变体
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {/* My answer */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <p className="text-[10px] text-muted-foreground mb-2">我的翻译</p>
                        <p className="text-sm text-foreground leading-relaxed">{transInput || "（未作答）"}</p>
                      </div>
                      {/* Diff view against reference */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <p className="text-[10px] text-muted-foreground mb-2">参考译文（词汇对比）</p>
                        <p className="text-sm leading-relaxed flex flex-wrap gap-x-1 gap-y-0.5">
                          {diffWords(refSentence, transInput).map((item, i) => (
                            <span
                              key={i}
                              className={item.matched
                                ? "text-emerald-600 font-medium"
                                : "text-destructive underline decoration-destructive/40 underline-offset-2"}
                            >
                              {item.token}
                            </span>
                          ))}
                        </p>
                      </div>
                      {/* AI Score */}
                      {transScoring && (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="text-sm text-muted-foreground">AI 正在评分…</span>
                        </div>
                      )}
                      {transScore && !transScoring && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                              transScore.score >= 90 ? "bg-emerald-500" : transScore.score >= 75 ? "bg-primary" : transScore.score >= 60 ? "bg-yellow-500" : "bg-destructive"
                            }`}>
                              {transScore.score}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground">{transScore.level}</p>
                              <p className="text-[10px] text-muted-foreground">AI 综合评分</p>
                            </div>
                          </div>
                          {transScore.dimensions && (
                            <div className="space-y-2">
                              {transScore.dimensions.map((d: any, i: number) => (
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
                          {transScore.highlights?.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-primary mb-1">✅ 做得好：</p>
                              {transScore.highlights.map((h: string, i: number) => (
                                <p key={i} className="text-[11px] text-muted-foreground">• {h}</p>
                              ))}
                            </div>
                          )}
                          {transScore.improvements?.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-foreground mb-1">💡 改进建议：</p>
                              {transScore.improvements.map((imp: string, i: number) => (
                                <p key={i} className="text-[11px] text-muted-foreground">• {imp}</p>
                              ))}
                            </div>
                          )}
                          {transScore.correctedVersion && (
                            <div className="bg-muted/40 rounded-lg p-3">
                              <p className="text-[11px] font-medium text-foreground mb-1">📝 修正参考：</p>
                              <p className="text-xs text-foreground leading-relaxed">{transScore.correctedVersion}</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                      {currentQ.explanationCn && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                          <p className="text-xs text-primary/90">{currentQ.explanationCn}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!transRevealed ? (
                      <button
                        id="trans-submit-btn"
                        disabled={!transInput.trim() || !userHasWord}
                        onClick={async () => {
                          setTransRevealed(true);
                          setTransScoring(true);
                          setTransScore(null);
                          // Score: 10 if word present, proportional to match rate
                          const refTokens = refSentence.replace(/[.!?]$/, "").trim().toLowerCase().split(/\s+/);
                          const userTokens = transInput.replace(/[.!?]$/, "").trim().toLowerCase().split(/\s+/);
                          const matched = refTokens.filter(t => userTokens.includes(t)).length;
                          const pts = userHasWord ? Math.round((matched / Math.max(refTokens.length, 1)) * 10) : 0;
                          setQuestionScores(prev => [...prev, pts]);
                          showScorePopup(pts);
                          try {
                            const { data, error } = await supabase.functions.invoke("score-translation", {
                              body: {
                                userTranslation: transInput,
                                referenceSentence: refSentence,
                                chinesePrompt: currentQ.chinesePrompt || "",
                                targetWords: [currentWord.word],
                              },
                            });
                            if (error) throw error;
                            if (data?.error) throw new Error(data.error);
                            setTransScore(data);
                          } catch (e: any) {
                            console.error(e);
                            toast.error("评分失败，请重试");
                          } finally {
                            setTransScoring(false);
                          }
                        }}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <Eye className="h-4 w-4" /> 提交并评分
                      </button>
                    ) : (
                      <button onClick={advanceQuestion} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-1">
                        {questionIdx < (currentWord?.questions?.length || 1) - 1 ? <>下一题 <ArrowRight className="h-4 w-4" /></> : "完成本词 ✓"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
