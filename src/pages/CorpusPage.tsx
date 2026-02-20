import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Search, Trash2, Loader2, Plus, Copy, FilePlus, BookOpen, Pencil, Check, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CorpusWordModal from "@/components/CorpusWordModal";
import ManualMaterialModal from "@/components/ManualMaterialModal";

interface CorpusEntry {
  id: string;
  application_scenario: string;
  source_text: string | null;
  personal_notes: string | null;
  custom_tags: string[] | null;
  difficulty_level: string;
  created_at: string;
  vocab_table: {
    id: string;
    word: string;
    phonetic: string | null;
    chinese_definition: string;
    mastery_level: number;
  } | null;
}

interface MaterialEntry {
  id: string;
  content: string;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
  category: string;
  created_at: string;
}

type Tab = "materials" | "corpus";

// Inline tag editor for both card types
function TagEditor({
  tags,
  onSave,
}: {
  tags: string[];
  onSave: (newTags: string[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = input.trim().replace(/^#/, "");
    if (!t || localTags.includes(t)) { setInput(""); return; }
    if (localTags.length >= 20) { toast.error("最多20个标签"); return; }
    setLocalTags(prev => [...prev, t]);
    setInput("");
  };

  const removeTag = (tag: string) => setLocalTags(prev => prev.filter(t => t !== tag));

  const handleSave = async () => {
    setSaving(true);
    await onSave(localTags);
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setLocalTags(tags);
    setInput("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 group">
        {tags.map(tag => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground text-[10px] group-hover:bg-muted transition-colors"
          >
            #{tag}
          </span>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
          title="编辑标签"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {localTags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]"
          >
            #{tag}
            <button onClick={() => removeTag(tag)} className="hover:opacity-70 ml-0.5">
              <XIcon className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 mb-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder="添加标签..."
          maxLength={50}
          className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20"
          autoFocus
        />
        <button onClick={addTag} className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs transition-colors">
          +
        </button>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          完成
        </button>
        <button onClick={handleCancel} className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground transition-colors">
          取消
        </button>
      </div>
    </div>
  );
}

export default function CorpusPage() {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("materials");
  const [modalWord, setModalWord] = useState<{ word: string; vocabId: string; tags?: string[] } | null>(null);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [corpusRes, materialRes] = await Promise.all([
      supabase
        .from("corpus_entries")
        .select("*, vocab_table(id, word, phonetic, chinese_definition, mastery_level)")
        .order("created_at", { ascending: false }),
      supabase
        .from("material_entries" as any)
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (corpusRes.error) console.error(corpusRes.error);
    if (materialRes.error) console.error(materialRes.error);

    setEntries((corpusRes.data as any) || []);
    setMaterials((materialRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredMaterials = useMemo(() => {
    if (!search) return materials;
    const q = search.toLowerCase();
    return materials.filter(m =>
      m.content.toLowerCase().includes(q) ||
      (m.notes || "").toLowerCase().includes(q) ||
      (m.source || "").toLowerCase().includes(q) ||
      (m.tags || []).join(" ").toLowerCase().includes(q)
    );
  }, [materials, search]);

  const filteredEntries = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      (e.vocab_table?.word || "").toLowerCase().includes(q) ||
      (e.vocab_table?.chinese_definition || "").toLowerCase().includes(q) ||
      (e.custom_tags || []).join(" ").toLowerCase().includes(q) ||
      (e.personal_notes || "").toLowerCase().includes(q) ||
      (e.source_text || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const handleDeleteCorpus = async (id: string) => {
    const { error } = await supabase.from("corpus_entries").delete().eq("id", id);
    if (error) toast.error("删除失败");
    else { setEntries(prev => prev.filter(e => e.id !== id)); toast.success("已删除"); }
  };

  const handleDeleteMaterial = async (id: string) => {
    const { error } = await supabase.from("material_entries" as any).delete().eq("id", id);
    if (error) toast.error("删除失败");
    else { setMaterials(prev => prev.filter(m => m.id !== id)); toast.success("已删除"); }
  };

  const handleCopyMaterial = (content: string) => {
    navigator.clipboard.writeText(content).then(() => toast.success("已复制到剪贴板")).catch(() => toast.error("复制失败"));
  };

  const toggleExpandMaterial = (id: string) => {
    setExpandedMaterial(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleSaveMaterialTags = async (matId: string, newTags: string[]) => {
    const { error } = await supabase.from("material_entries" as any).update({ tags: newTags }).eq("id", matId);
    if (error) { toast.error("保存失败"); return; }
    setMaterials(prev => prev.map(m => m.id === matId ? { ...m, tags: newTags } : m));
    toast.success("标签已更新");
  };

  const handleSaveCorpusTags = async (entryId: string, newTags: string[]) => {
    const { error } = await supabase.from("corpus_entries").update({ custom_tags: newTags }).eq("id", entryId);
    if (error) { toast.error("保存失败"); return; }
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, custom_tags: newTags } : e));
    // Sync modal tags if open
    if (modalWord) setModalWord(prev => prev ? { ...prev, tags: newTags } : prev);
    toast.success("标签已更新");
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number; desc: string }[] = [
    {
      key: "materials",
      label: "灵感素材库",
      icon: <FilePlus className="h-4 w-4" />,
      count: materials.length,
      desc: "手动录入的地道表达",
    },
    {
      key: "corpus",
      label: "查词沉淀库",
      icon: <BookOpen className="h-4 w-4" />,
      count: entries.length,
      desc: "查词收藏的单词",
    },
  ];

  const currentFiltered = activeTab === "materials" ? filteredMaterials : filteredEntries;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">语料仓库</h2>
          </div>
          <button
            onClick={() => setShowMaterialModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            录入素材
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mb-5">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 p-3.5 rounded-2xl border text-left transition-all ${
                activeTab === tab.key
                  ? "bg-primary/8 border-primary/30 ring-1 ring-primary/20"
                  : "bg-card border-border hover:border-primary/20 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`${activeTab === tab.key ? "text-primary" : "text-muted-foreground"} transition-colors`}>
                  {tab.icon}
                </span>
                <span className={`text-lg font-bold ${activeTab === tab.key ? "text-foreground" : "text-muted-foreground"}`}>
                  {tab.count}
                </span>
              </div>
              <p className={`text-sm font-semibold ${activeTab === tab.key ? "text-foreground" : "text-muted-foreground"}`}>
                {tab.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tab.desc}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={activeTab === "materials" ? "搜索素材内容、来源、标签..." : "搜索单词、释义、标签..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            className="w-full bg-card py-2.5 pl-10 pr-4 text-sm rounded-xl shadow-warm outline-none border focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <p className="text-xs text-muted-foreground mb-3">显示 {currentFiltered.length} 条结果</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : currentFiltered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">
              {activeTab === "materials" ? "暂无素材记录" : "暂无单词收藏"}
            </p>
            <div className="flex items-center justify-center gap-3 mt-3">
              {activeTab === "materials" ? (
                <button onClick={() => setShowMaterialModal(true)} className="text-primary text-sm hover:underline">
                  录入第一条素材
                </button>
              ) : (
                <button onClick={() => navigate("/")} className="text-primary text-sm hover:underline">
                  去查词添加
                </button>
              )}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-2.5">
              {activeTab === "materials"
                ? (filteredMaterials as MaterialEntry[]).map(mat => {
                    const isExpanded = expandedMaterial.has(mat.id);
                    const isLong = mat.content.length > 120;
                    return (
                      <motion.div
                        key={`mat-${mat.id}`}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="bg-card rounded-xl shadow-warm border border-primary/10 overflow-hidden"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                              <FilePlus className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-[10px] font-medium text-primary">私人语料</span>
                              {mat.source && (
                                <span className="text-[10px] text-muted-foreground">· {mat.source}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleCopyMaterial(mat.content)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="复制语料"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteMaterial(mat.id)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className={`text-sm text-foreground leading-relaxed font-medium ${isLong && !isExpanded ? "line-clamp-2" : ""}`}>
                            {mat.content}
                          </p>
                          {isLong && (
                            <button onClick={() => toggleExpandMaterial(mat.id)} className="text-xs text-primary mt-1 hover:underline">
                              {isExpanded ? "收起" : "展开全文"}
                            </button>
                          )}

                          {mat.notes && (
                            <p className="text-xs text-muted-foreground mt-2">📝 {mat.notes}</p>
                          )}

                          {/* Tag editor */}
                          <TagEditor
                            tags={mat.tags?.filter(t => t !== mat.source) || []}
                            onSave={(newTags) => handleSaveMaterialTags(mat.id, newTags)}
                          />
                        </div>
                      </motion.div>
                    );
                  })
                : (filteredEntries as CorpusEntry[]).map(entry => (
                    <motion.div
                      key={`corpus-${entry.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-card rounded-xl shadow-warm overflow-hidden border border-border cursor-pointer hover:border-primary/30 hover:bg-muted/20 transition-all"
                      onClick={() => {
                        if (entry.vocab_table) {
                          setModalWord({ word: entry.vocab_table.word, vocabId: entry.vocab_table.id, tags: entry.custom_tags || [] });
                        }
                      }}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold text-foreground">{entry.vocab_table?.word}</h3>
                              {entry.vocab_table?.phonetic && (
                                <span className="text-[10px] text-muted-foreground font-mono">{entry.vocab_table.phonetic}</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{entry.vocab_table?.chinese_definition}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCorpus(entry.id); }}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {entry.personal_notes && (
                          <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2">📝 {entry.personal_notes}</p>
                        )}

                        {/* Scenario chip + tag editor */}
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="tag-chip text-[10px] shrink-0">{entry.application_scenario}</span>
                        </div>
                        <TagEditor
                          tags={entry.custom_tags || []}
                          onSave={(newTags) => handleSaveCorpusTags(entry.id, newTags)}
                        />
                      </div>
                    </motion.div>
                  ))
              }
            </div>
          </AnimatePresence>
        )}
      </motion.div>

      {/* Word detail modal */}
      {modalWord && (
        <CorpusWordModal
          word={modalWord.word}
          vocabId={modalWord.vocabId}
          corpusTags={modalWord.tags}
          onClose={() => setModalWord(null)}
          onSearchWord={(w) => {
            setModalWord(null);
            navigate(`/word/${encodeURIComponent(w.toLowerCase())}`);
          }}
        />
      )}

      {/* Manual material modal */}
      {showMaterialModal && (
        <ManualMaterialModal
          onClose={() => setShowMaterialModal(false)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
