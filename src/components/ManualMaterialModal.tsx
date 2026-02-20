import { useState } from "react";
import { X, Loader2, FilePlus } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CATEGORIES = ["日常与通用", "翻译与写作", "学术领域", "考试专项"];

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function ManualMaterialModal({ onClose, onSaved }: Props) {
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState("日常与通用");
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    if (tags.length >= 20) { toast.error("最多20个标签"); return; }
    setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!content.trim()) { toast.error("请输入语料内容"); return; }
    if (content.length > 5000) { toast.error("内容超出限制（最多5000字符）"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("请先登录"); return; }

      const allTags = [...tags];
      if (source.trim() && !allTags.includes(source.trim())) {
        allTags.push(source.trim());
      }

      const { error } = await supabase.from("material_entries" as any).insert({
        user_id: user.id,
        content: content.trim().slice(0, 5000),
        notes: notes.trim().slice(0, 2000),
        source: source.trim().slice(0, 200),
        tags: allTags.slice(0, 20),
        category,
      });
      if (error) throw error;
      toast.success("语料素材已录入！");
      onSaved();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="bg-card rounded-2xl shadow-warm-lg border w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <FilePlus className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">录入素材</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Content */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              语料内容 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴句子、段落或地道表达…"
              maxLength={5000}
              rows={5}
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{content.length}/5000</p>
          </div>

          {/* Chinese notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">中文释义/笔记</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="记录你对这段内容的理解、翻译或心得…"
              maxLength={2000}
              rows={2}
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Source */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">来源标签</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="如：英剧《神探夏洛克》、经济学人…"
              maxLength={200}
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">分类归档</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Custom tags */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              自定义标签 <span className="text-[10px] text-muted-foreground ml-1">{tags.length}/20</span>
            </label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                  >
                    #{t}
                    <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:opacity-70">×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="#添加标签..."
                maxLength={50}
                className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={addTag}
                className="px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm"
              >
                添加
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="p-4 border-t sticky bottom-0 bg-card">
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "保存中..." : "确认录入"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
