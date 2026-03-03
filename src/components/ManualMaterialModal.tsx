import { useState, useRef } from "react";
import { X, Loader2, FilePlus, Camera, ImageIcon } from "lucide-react";
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

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrWords, setOcrWords] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    if (tags.length >= 20) { toast.error("最多20个标签"); return; }
    setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("图片不能超过10MB"); return; }

    // Show preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setOcrWords([]);
    setSelectedWords(new Set());

    // Convert to base64
    setOcrLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("ocr-extract", {
        body: { imageBase64: base64, mimeType: file.type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const fullText = data?.fullText || "";
      const words = data?.words || [];

      if (fullText) {
        setContent(prev => prev ? prev + "\n" + fullText : fullText);
        toast.success(`已识别 ${fullText.length} 个字符`);
      } else {
        toast.warning("未识别到文本内容");
      }

      if (words.length > 0) {
        setOcrWords(words);
      }
    } catch (err: any) {
      console.error("OCR error:", err);
      toast.error("图片识别失败，请重试");
    } finally {
      setOcrLoading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleWord = (w: string) => {
    setSelectedWords(prev => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w); else next.add(w);
      return next;
    });
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
      // Add selected OCR words as tags
      selectedWords.forEach(w => {
        if (!allTags.includes(w)) allTags.push(w);
      });

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
          {/* OCR Upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 transition-all disabled:opacity-50"
            >
              {ocrLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">识别中...</span>
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  <span className="text-sm font-medium">拍照/上传图片导入</span>
                </>
              )}
            </button>

            {/* Image preview */}
            {previewUrl && (
              <div className="mt-2 relative">
                <img src={previewUrl} alt="OCR preview" className="w-full max-h-40 object-contain rounded-lg bg-muted" />
                <button
                  onClick={() => { setPreviewUrl(null); setOcrWords([]); setSelectedWords(new Set()); }}
                  className="absolute top-1 right-1 p-1 rounded-full bg-foreground/60 text-background hover:bg-foreground/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* OCR word selection */}
            {ocrWords.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground mb-1.5">
                  <ImageIcon className="h-3 w-3 inline mr-1" />
                  点击选择目标词（将作为标签保存）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ocrWords.map(w => {
                    const sel = selectedWords.has(w);
                    return (
                      <button
                        key={w}
                        onClick={() => toggleWord(w)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                          sel
                            ? "bg-primary text-primary-foreground ring-1 ring-primary"
                            : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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
