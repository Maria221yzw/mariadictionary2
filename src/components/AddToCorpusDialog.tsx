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

// Preset tag categories with color assignments
const TAG_CATEGORIES = [
  {
    label: "应用场景",
    color: "emerald" as const,
    tags: ["演讲汇报", "学术论文", "日常社交", "三创赛路演", "外教Office Hour"],
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
  rose:    { bg: "bg-[hsl(350,40%,93%)] dark:bg-[hsl(350,30%,18%)]", text: "text-[hsl(350,50%,40%)] dark:text-[hsl(350,45%,70%)]", ring: "ring-[hsl(350,50%,50%/0.3)]" },
  gold:    { bg: "bg-[hsl(38,50%,92%)] dark:bg-[hsl(38,40%,18%)]",   text: "text-[hsl(38,60%,35%)] dark:text-[hsl(38,60%,65%)]",   ring: "ring-[hsl(38,70%,50%/0.3)]" },
  blue:    { bg: "bg-[hsl(210,50%,93%)] dark:bg-[hsl(210,30%,18%)]", text: "text-[hsl(210,55%,38%)] dark:text-[hsl(210,50%,68%)]", ring: "ring-[hsl(210,55%,50%/0.3)]" },
  purple:  { bg: "bg-[hsl(270,40%,93%)] dark:bg-[hsl(270,30%,18%)]", text: "text-[hsl(270,45%,40%)] dark:text-[hsl(270,40%,70%)]", ring: "ring-[hsl(270,45%,50%/0.3)]" },
  default: { bg: "bg-[hsl(var(--tag-bg))]", text: "text-[hsl(var(--tag-text))]", ring: "ring-[hsl(var(--primary)/0.2)]" },
};

// Saved custom tags history key
const CUSTOM_TAGS_KEY = "corpus_custom_tags_history";

function loadCustomTagHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || "[]");
  } catch { return []; }
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

interface Props {
  wordData: AIWordData;
  vocabId: string;
  onClose: () => void;
}

export default function AddToCorpusDialog({ wordData, vocabId, onClose }: Props) {
  const [scenario, setScenario] = useState<AppScenario>("学术写作");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(wordData.suggestedTags || []);
  const [difficulty, setDifficulty] = useState(wordData.difficulty || "进阶");
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

      const { error } = await supabase.from("corpus_entries").insert({
        user_id: user.id,
        word_id: vocabId,
        application_scenario: scenario,
        source_text: source.slice(0, 500),
        personal_notes: notes.slice(0, 2000),
        custom_tags: tags.slice(0, 20),
        difficulty_level: difficulty,
      });

      if (error) throw error;
      console.log("Corpus entry saved:", { word: wordData.word, tags, scenario, difficulty });
      toast.success(`"${wordData.word}" 已加入语料库！`);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "保存失败");
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
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-display font-semibold text-foreground">加入语料库 · {wordData.word}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-5">
          {/* Scenario */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">应用场景</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as AppScenario)}
              className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none border focus:ring-2 focus:ring-primary/20"
            >
              {scenarios.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Source */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">来源</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="如：纽约时报、专八真题、XX教授口头禅..."
              maxLength={500}
              className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">个人笔记</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="记录你的学习心得..."
              maxLength={2000}
              rows={3}
              className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* ===== Enhanced Tag System ===== */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Palette className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">标签</label>
              <span className="text-xs text-muted-foreground ml-auto">{tags.length}/20</span>
            </div>

            {/* Active tags with color coding */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {tags.map(tag => {
                  const color = TAG_COLORS[getTagColor(tag)];
                  return (
                    <motion.span
                      key={tag}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addTag(); }
                  }}
                  placeholder="#自定义标签..."
                  maxLength={50}
                  className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20"
                />
                <button onClick={() => addTag()} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Autocomplete dropdown */}
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
                        <button
                          key={s}
                          onClick={() => addTag(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/70 transition-colors flex items-center gap-2"
                        >
                          <span className={`w-2 h-2 rounded-full ${color.bg} ring-1 ${color.ring}`} />
                          <span className="text-foreground">{s}</span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Preset tag categories - collapsible */}
            <div className="space-y-1.5">
              {TAG_CATEGORIES.map(cat => {
                const isExpanded = expandedCategory === cat.label;
                const color = TAG_COLORS[cat.color];
                return (
                  <div key={cat.label}>
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full ${color.bg} ring-1 ${color.ring}`} />
                      {cat.label}
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
                                      ? `${color.bg} ${color.text} ${color.ring} opacity-100`
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
        </div>

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
