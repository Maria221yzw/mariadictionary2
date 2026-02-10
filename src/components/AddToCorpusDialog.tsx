import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AIWordData } from "@/pages/SearchPage";
import type { Database } from "@/integrations/supabase/types";

type AppScenario = Database["public"]["Enums"]["app_scenario"];

const scenarios: AppScenario[] = ["学术写作", "翻译练习", "日常口语", "专业课笔记"];
const difficulties = ["基础", "进阶", "高级"];

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

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
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

        <div className="p-4 space-y-4">
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
              placeholder="如：经济学人、专八真题..."
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

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">标签</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(tag => (
                <span key={tag} className="tag-chip text-xs flex items-center gap-1">
                  #{tag}
                  <button onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-foreground">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="#高阶动词"
                maxLength={50}
                className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20"
              />
              <button onClick={addTag} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                <Plus className="h-4 w-4" />
              </button>
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
