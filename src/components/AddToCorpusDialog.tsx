import { useState, useMemo, useEffect, useRef } from "react";
import { X, Plus, Loader2, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AIWordData } from "@/pages/SearchPage";
import type { Database } from "@/integrations/supabase/types";

type AppScenario = Database["public"]["Enums"]["app_scenario"];

const scenarios: AppScenario[] = ["学术写作", "翻译练习", "日常口语", "专业课笔记"];
const difficulties = ["基础", "进阶", "高级"];

const MASTERY_LEVELS = [
  { level: 1, label: "陌生", desc: "完全不认识", color: "bg-red-500", ring: "ring-red-400" },
  { level: 2, label: "模糊", desc: "见过但想不起意思", color: "bg-orange-500", ring: "ring-orange-400" },
  { level: 3, label: "认知", desc: "看到能想起意思，但不会用", color: "bg-yellow-500", ring: "ring-yellow-400" },
  { level: 4, label: "运用", desc: "能在写作/口语中尝试使用", color: "bg-emerald-400", ring: "ring-emerald-300" },
  { level: 5, label: "熟练", desc: "已内化为本能", color: "bg-emerald-600", ring: "ring-emerald-500" },
];

const TAG_CATEGORIES = [
  {
    label: "应用场景",
    color: "emerald" as const,
    tags: ["学术写作", "翻译练习", "日常口语", "专业课笔记", "演讲汇报", "三创赛路演", "外教Office Hour"],
  },
  {
    label: "来源",
    color: "amber" as const,
    tags: ["纽约时报", "专八真题", "BBC新闻", "学术论文", "课堂笔记", "英美剧集"],
  },
  {
    label: "情感色彩",
    color: "rose" as const,
    tags: ["褒义", "中性", "贬义", "极度委婉", "正式语体"],
  },
  {
    label: "专业领域",
    color: "gold" as const,
    tags: ["语言学", "文学批评", "数字营销", "语料库语言学", "商务英语"],
  },
  {
    label: "记忆状态",
    color: "blue" as const,
    tags: ["模糊", "已掌握", "需重温", "写作高频词", "今天必须背"],
  },
  {
    label: "语法功能",
    color: "purple" as const,
    tags: ["用于转折", "用于总结", "固定搭配", "介词用法", "Adj+Noun搭配"],
  },
];

const TAG_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "bg-[hsl(160,30%,92%)] dark:bg-[hsl(160,30%,18%)]", text: "text-[hsl(160,45%,28%)] dark:text-[hsl(160,40%,70%)]", ring: "ring-[hsl(160,45%,32%/0.3)]" },
  amber:   { bg: "bg-[hsl(30,50%,92%)] dark:bg-[hsl(30,40%,18%)]",   text: "text-[hsl(30,60%,32%)] dark:text-[hsl(30,55%,65%)]",   ring: "ring-[hsl(30,60%,45%/0.3)]" },
  rose:    { bg: "bg-[hsl(350,40%,93%)] dark:bg-[hsl(350,30%,18%)]", text: "text-[hsl(350,50%,40%)] dark:text-[hsl(350,45%,70%)]", ring: "ring-[hsl(350,50%,50%/0.3)]" },
  gold:    { bg: "bg-[hsl(38,50%,92%)] dark:bg-[hsl(38,40%,18%)]",   text: "text-[hsl(38,60%,35%)] dark:text-[hsl(38,60%,65%)]",   ring: "ring-[hsl(38,70%,50%/0.3)]" },
  blue:    { bg: "bg-[hsl(210,50%,93%)] dark:bg-[hsl(210,30%,18%)]", text: "text-[hsl(210,55%,38%)] dark:text-[hsl(210,50%,68%)]", ring: "ring-[hsl(210,55%,50%/0.3)]" },
  purple:  { bg: "bg-[hsl(270,40%,93%)] dark:bg-[hsl(270,30%,18%)]", text: "text-[hsl(270,45%,40%)] dark:text-[hsl(270,40%,70%)]", ring: "ring-[hsl(270,45%,50%/0.3)]" },
  default: { bg: "bg-[hsl(var(--tag-bg))]", text: "text-[hsl(var(--tag-text))]", ring: "ring-[hsl(var(--primary)/0.2)]" },
};

const CUSTOM_TAGS_KEY = "corpus_custom_tags_history";

function loadCustomTagHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || "[]"); }
  catch { return []; }
}

function saveCustomTagHistory(tags: string[]) {
  localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags.slice(0, 100)));
}

function getTagColor(tag: string): string {
  for (const cat of TAG_CATEGORIES) {
    if (cat.tags.includes(tag)) return cat.color;
  }
  return "default";
}

// Derive scenario from tags
function deriveScenario(tags: string[]): AppScenario {
  for (const t of tags) {
    if (scenarios.includes(t as AppScenario)) return t as AppScenario;
  }
  return "学术写作";
}

interface Props {
  wordData: AIWordData;
  vocabId: string;
  onClose: () => void;
}

export default function AddToCorpusDialog({ wordData, vocabId, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(wordData.suggestedTags || []);
  const [difficulty, setDifficulty] = useState(wordData.difficulty || "进阶");
  const [mastery, setMastery] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const customHistory = useMemo(() => loadCustomTagHistory(), []);

  // All available preset tags for autocomplete
  const allPresetTags = useMemo(() => TAG_CATEGORIES.flatMap(c => c.tags), []);

  // Autocomplete suggestions based on input
  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    const pool = [...new Set([...allPresetTags, ...customHistory])];
    return pool.filter(t => t.toLowerCase().includes(q) && !tags.includes(t)).slice(0, 8);
  }, [tagInput, tags, allPresetTags, customHistory]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addTag = (t?: string) => {
    const raw = (t || tagInput).trim().replace(/^#/, "");
    if (!raw || tags.includes(raw)) { setTagInput(""); return; }
    if (tags.length >= 20) { toast.error("最多添加20个标签"); return; }
    setTags(prev => [...prev, raw]);
    setTagInput("");
    setShowSuggestions(false);

    // Save custom tag to history if not preset
    if (!allPresetTags.includes(raw)) {
      const history = loadCustomTagHistory().filter(h => h !== raw);
      saveCustomTagHistory([raw, ...history]);
    }
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const togglePresetTag = (tag: string) => {
    if (tags.includes(tag)) removeTag(tag);
    else addTag(tag);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("请先登录后再保存到语料库");
        setSaving(false);
        return;
      }

      const derivedScenario = deriveScenario(tags);
      // Extract source tags for source_text field
      const sourceTags = TAG_CATEGORIES.find(c => c.label === "来源")?.tags || [];
      const sourceFromTags = tags.filter(t => sourceTags.includes(t)).join("、");

      // Update mastery_level on vocab_table
      await supabase.from("vocab_table").update({ mastery_level: mastery }).eq("id", vocabId);

      const { error } = await supabase.from("corpus_entries").insert({
        user_id: user.id,
        word_id: vocabId,
        application_scenario: derivedScenario,
        source_text: sourceFromTags.slice(0, 500),
        personal_notes: notes.slice(0, 2000),
        custom_tags: tags.slice(0, 20),
        difficulty_level: difficulty,
      });

      if (error) throw error;
      toast.success(`"${wordData.word}" 已加入语料库！`);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-warm-lg border w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-display font-semibold text-foreground">加入语料库 · {wordData.word}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* ===== Tag Cloud ===== */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Palette className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">标签</label>
              <span className="text-xs text-muted-foreground ml-auto">{tags.length}/20</span>
            </div>

            {/* Active tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {tags.map(tag => {
                  const color = TAG_COLORS[getTagColor(tag)];
                  return (
                    <motion.span
                      key={tag}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${color.bg} ${color.text} ${color.ring}`}
                    >
                      #{tag}
                      <button onClick={() => removeTag(tag)} className="hover:opacity-70 ml-0.5">×</button>
                    </motion.span>
                  );
                })}
              </div>
            )}

            {/* Tag input with autocomplete */}
            <div className="relative mb-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="#自定义标签..."
                  maxLength={50}
                  className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20"
                />
                <button onClick={() => addTag()} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    ref={suggestionsRef}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute left-0 right-12 mt-1 bg-card border rounded-lg shadow-warm-lg z-10 overflow-hidden"
                  >
                    {suggestions.map(s => {
                      const color = TAG_COLORS[getTagColor(s)];
                      return (
                        <button key={s} onClick={() => addTag(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/70 transition-colors flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${color.bg} ring-1 ${color.ring}`} />
                          <span className="text-foreground">{s}</span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Collapsible preset categories */}
            <div className="space-y-1">
              {TAG_CATEGORIES.map(cat => {
                const isExpanded = expandedCategory === cat.label;
                const color = TAG_COLORS[cat.color];
                const selectedCount = cat.tags.filter(t => tags.includes(t)).length;
                return (
                  <div key={cat.label}>
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full ${color.bg} ring-1 ${color.ring}`} />
                      {cat.label}
                      {selectedCount > 0 && <span className={`text-[10px] ${color.text}`}>({selectedCount})</span>}
                      <span className="ml-auto text-[10px] opacity-60">{isExpanded ? "收起" : "展开"}</span>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-wrap gap-1.5 px-2 py-2">
                            {cat.tags.map(tag => {
                              const selected = tags.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  onClick={() => togglePresetTag(tag)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ring-1 ${
                                    selected
                                      ? `${color.bg} ${color.text} ${color.ring}`
                                      : `bg-muted/50 text-muted-foreground ring-transparent hover:ring-border`
                                  }`}
                                >
                                  {selected ? "✓ " : ""}#{tag}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mastery Level */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">掌握程度</label>
            <div className="flex gap-1.5">
              {MASTERY_LEVELS.map(m => (
                <button
                  key={m.level}
                  onClick={() => setMastery(m.level)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-all ring-1 ${mastery === m.level ? `${m.color} text-white ${m.ring}` : "bg-muted text-muted-foreground ring-transparent hover:ring-border"}`}
                  title={m.desc}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{MASTERY_LEVELS.find(m => m.level === mastery)?.desc}</p>
          </div>

          {/* Difficulty */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">难度</label>
            <div className="flex gap-2">
              {difficulties.map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${difficulty === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Notes - moved to bottom */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">个人笔记</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="记录你的学习心得..."
              maxLength={2000}
              rows={2}
              className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="p-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "保存中..." : "确认加入"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
