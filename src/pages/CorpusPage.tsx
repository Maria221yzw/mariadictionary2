import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Search, Trash2, Loader2, Plus, Copy, FilePlus, BookOpen, Pencil, Check, X as XIcon, Merge, Wand2, Save, Link2, Sparkles, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CorpusWordModal from "@/components/CorpusWordModal";
import ManualMaterialModal from "@/components/ManualMaterialModal";
import SynonymComparisonDashboard from "@/components/SynonymComparisonDashboard";

// ========== Tag Normalization System ==========
const TAG_NORMALIZATION_MAP: Record<string, string> = {
  "医学": "医学术语", "医学词汇": "医学术语", "内窥镜": "医学术语", "解剖学": "医学术语",
  "病理": "医学术语", "手术": "医学术语", "medical": "医学术语", "medicine": "医学术语",
  "文学": "文学赏析", "文学批评": "文学赏析", "literature": "文学赏析", "literary": "文学赏析",
  "学术": "学术写作", "论文写作": "学术写作", "academic": "学术写作",
  "法律": "法律文书", "法学": "法律文书", "legal": "法律文书", "law": "法律文书",
  "金融": "金融经济", "经济": "金融经济", "finance": "金融经济",
  "商务": "商务英语", "business": "商务英语",
  "科技": "科技前沿", "技术": "科技前沿", "technology": "科技前沿",
  "心理": "心理学", "psychology": "心理学",
  "历史": "历史文化", "文化": "历史文化", "history": "历史文化",
  "环境": "生态环境", "生态": "生态环境", "ecology": "生态环境",
  "营销": "数字营销", "marketing": "数字营销",
  "口语": "日常口语", "日常": "日常口语", "colloquial": "日常口语",
  "翻译": "翻译练习", "translation": "翻译练习",
  "正式": "正式语体", "formal": "正式语体",
};

const CORPUS_CATEGORY_GROUPS: { label: string; members: string[] }[] = [
  { label: "医学术语", members: ["医学术语", "医学", "医学词汇", "内窥镜", "解剖学", "病理", "手术"] },
  { label: "文学赏析", members: ["文学赏析", "文学", "文学批评"] },
  { label: "学术写作", members: ["学术写作", "学术", "论文写作", "高频学术词"] },
  { label: "法律文书", members: ["法律文书", "法律", "法学"] },
  { label: "金融经济", members: ["金融经济", "金融", "经济"] },
  { label: "商务英语", members: ["商务英语", "商务", "职场"] },
  { label: "科技前沿", members: ["科技前沿", "科技", "技术"] },
  { label: "心理学",   members: ["心理学", "心理"] },
  { label: "历史文化", members: ["历史文化", "历史", "文化"] },
  { label: "生态环境", members: ["生态环境", "生态", "环境"] },
  { label: "数字营销", members: ["数字营销", "营销"] },
  { label: "语言学",   members: ["语言学"] },
  { label: "哲学思辨", members: ["哲学思辨", "哲学"] },
  { label: "日常口语", members: ["日常口语", "口语", "日常"] },
  { label: "翻译练习", members: ["翻译练习", "翻译"] },
  { label: "专业课笔记", members: ["专业课笔记"] },
  { label: "正式语体", members: ["正式语体", "正式"] },
];

function normalizeTag(tag: string): string {
  return TAG_NORMALIZATION_MAP[tag] ?? tag;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tags) {
    const n = normalizeTag(t);
    if (!seen.has(n)) { seen.add(n); result.push(n); }
  }
  return result;
}

function tagMatchesCategory(tag: string, categoryLabel: string): boolean {
  const group = CORPUS_CATEGORY_GROUPS.find(g => g.label === categoryLabel);
  if (!group) return tag === categoryLabel || normalizeTag(tag) === categoryLabel;
  return group.members.includes(tag) || group.members.includes(normalizeTag(tag));
}

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
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [mergeTarget, setMergeTarget] = useState("");

  const addTag = () => {
    const t = normalizeTag(input.trim().replace(/^#/, ""));
    if (!t || localTags.includes(t)) { setInput(""); return; }
    if (localTags.length >= 20) { toast.error("最多20个标签"); return; }
    setLocalTags(prev => [...prev, t]);
    setInput("");
  };

  const removeTag = (tag: string) => setLocalTags(prev => prev.filter(t => t !== tag));

  const handleMerge = () => {
    if (!mergeTarget.trim() || selectedForMerge.length < 2) { toast.error("请选择至少2个标签并输入目标名称"); return; }
    const target = mergeTarget.trim().replace(/^#/, "");
    setLocalTags(prev => {
      const filtered = prev.filter(t => !selectedForMerge.includes(t));
      if (filtered.includes(target)) return filtered;
      return [...filtered, target];
    });
    setMergeMode(false);
    setSelectedForMerge([]);
    setMergeTarget("");
    toast.success(`已合并为 #${target}`);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(normalizeTags(localTags));
    setSaving(false);
    setEditing(false);
    setMergeMode(false);
    setSelectedForMerge([]);
  };

  const handleCancel = () => {
    setLocalTags(tags);
    setInput("");
    setEditing(false);
    setMergeMode(false);
    setSelectedForMerge([]);
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
      {/* Merge mode */}
      {mergeMode ? (
        <div className="space-y-2 mb-2">
          <p className="text-[10px] text-muted-foreground">点击标签选中要合并的项目</p>
          <div className="flex flex-wrap gap-1.5">
            {localTags.map(tag => {
              const selected = selectedForMerge.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedForMerge(prev => selected ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ring-1 transition-all ${selected ? "bg-primary text-primary-foreground ring-primary" : "bg-muted/50 text-muted-foreground ring-border"}`}
                >
                  #{tag}
                  {selected && <Check className="h-2.5 w-2.5 ml-0.5" />}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              placeholder="合并为标签名..."
              maxLength={50}
              className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20"
            />
            <button onClick={handleMerge} disabled={selectedForMerge.length < 2 || !mergeTarget.trim()} className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40">合并</button>
            <button onClick={() => { setMergeMode(false); setSelectedForMerge([]); }} className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground">取消</button>
          </div>
        </div>
      ) : (
        <>
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
            <button onClick={addTag} className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs transition-colors">+</button>
          </div>
        </>
      )}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          完成
        </button>
        {!mergeMode && localTags.length >= 2 && (
          <button
            onClick={() => setMergeMode(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground transition-colors"
            title="合并同类标签"
          >
            <Merge className="h-3 w-3" />
            合并同类项
          </button>
        )}
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
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [modalWord, setModalWord] = useState<{ word: string; vocabId: string; tags?: string[] } | null>(null);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<Set<string>>(new Set());
  const [editingMaterial, setEditingMaterial] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // Corpus inline editing state
  const [editingCorpus, setEditingCorpus] = useState<string | null>(null);
  const [ecWord, setEcWord] = useState("");
  const [ecPhonetic, setEcPhonetic] = useState("");
  const [ecDefinition, setEcDefinition] = useState("");
  const [ecNotes, setEcNotes] = useState("");
  const [ecTags, setEcTags] = useState<string[]>([]);
  const [ecTagInput, setEcTagInput] = useState("");
  const [ecSaving, setEcSaving] = useState(false);
  // Synonym cluster state
  const [synSearch, setSynSearch] = useState("");
  const [synLinked, setSynLinked] = useState<string[]>([]);
  const [synLoading, setSynLoading] = useState(false);
  const [synRecommendations, setSynRecommendations] = useState<{ fromLibrary: string[]; suggested: string[]; clusterName: string } | null>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  // Cluster display: vocab_id -> array of related words (from same clusters)
  const [clusterMap, setClusterMap] = useState<Record<string, { word: string; vocabId: string; clusterId: string; memberId: string }[]>>({});
  // Existing cluster members for the word being edited (loaded from DB)
  const [existingClusterMembers, setExistingClusterMembers] = useState<{ word: string; vocabId: string; clusterId: string; memberId: string }[]>([]);
  const [existingClusterId, setExistingClusterId] = useState<string | null>(null);
  const [clusterNotes, setClusterNotes] = useState("");
  const [clusterNotesOriginal, setClusterNotesOriginal] = useState("");
  const navigate = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [corpusRes, materialRes, membersRes] = await Promise.all([
      supabase
        .from("corpus_entries")
        .select("*, vocab_table(id, word, phonetic, chinese_definition, mastery_level)")
        .order("created_at", { ascending: false }),
      supabase
        .from("material_entries" as any)
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("synonym_cluster_members")
        .select("id, cluster_id, vocab_id, vocab_table:vocab_id(id, word)") as any,
    ]);

    if (corpusRes.error) console.error(corpusRes.error);
    if (materialRes.error) console.error(materialRes.error);

    setEntries((corpusRes.data as any) || []);
    setMaterials((materialRes.data as any) || []);

    // Build cluster map: for each vocab_id, find all other words in the same clusters
    if (membersRes.data) {
      const clusterGroups: Record<string, { vocabId: string; word: string; memberId: string }[]> = {};
      for (const m of membersRes.data as any[]) {
        const cid = m.cluster_id;
        if (!clusterGroups[cid]) clusterGroups[cid] = [];
        clusterGroups[cid].push({ vocabId: m.vocab_id, word: m.vocab_table?.word || "", memberId: m.id });
      }
      const map: Record<string, { word: string; vocabId: string; clusterId: string; memberId: string }[]> = {};
      for (const [clusterId, members] of Object.entries(clusterGroups)) {
        for (const member of members) {
          if (!map[member.vocabId]) map[member.vocabId] = [];
          for (const other of members) {
            if (other.vocabId !== member.vocabId && !map[member.vocabId].some(x => x.vocabId === other.vocabId)) {
              map[member.vocabId].push({ ...other, clusterId });
            }
          }
        }
      }
      setClusterMap(map);
    }

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const scrollToWord = (vocabId: string) => {
    const el = document.getElementById(`corpus-card-${vocabId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
    }
  };

  // Sub-tags derived dynamically from data
  const materialSubTags = useMemo(() => {
    const sources = new Set<string>();
    materials.forEach(m => { if (m.source) sources.add(m.source); });
    return Array.from(sources);
  }, [materials]);

  // Corpus: derive normalized category groups that have at least one entry
  const corpusCategoryGroups = useMemo(() => {
    // Collect all tags across all corpus entries (custom_tags)
    const tagCounts: Record<string, number> = {};
    entries.forEach(e => {
      (e.custom_tags || []).forEach(t => {
        const cat = (() => {
          for (const g of CORPUS_CATEGORY_GROUPS) {
            if (g.members.includes(t) || g.members.includes(normalizeTag(t))) return g.label;
          }
          return normalizeTag(t);
        })();
        tagCounts[cat] = (tagCounts[cat] || 0) + 1;
      });
      // Also count application_scenario as a category source
      const scenario = e.application_scenario;
      if (scenario) {
        const cat = (() => {
          for (const g of CORPUS_CATEGORY_GROUPS) {
            if (g.members.includes(scenario)) return g.label;
          }
          return scenario;
        })();
        // Don't double-count scenarios as categories here
      }
    });
    return Object.entries(tagCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }, [entries]);

  const currentSubTags = activeTab === "materials" ? materialSubTags : [];

  // Reset sub-tag when tab changes
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setActiveSubTag(null);
    setSearch("");
  };

  const filteredMaterials = useMemo(() => {
    let list = materials;
    if (activeSubTag) list = list.filter(m => m.source === activeSubTag);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(m =>
      m.content.toLowerCase().includes(q) ||
      (m.notes || "").toLowerCase().includes(q) ||
      (m.source || "").toLowerCase().includes(q) ||
      (m.tags || []).join(" ").toLowerCase().includes(q)
    );
  }, [materials, search, activeSubTag]);

  const filteredEntries = useMemo(() => {
    let list = entries;
    // Filter by normalized category: match any tag in the entry that maps to the selected category
    if (activeSubTag) {
      list = list.filter(e =>
        (e.custom_tags || []).some(t => tagMatchesCategory(t, activeSubTag))
      );
    }
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(e =>
      (e.vocab_table?.word || "").toLowerCase().includes(q) ||
      (e.vocab_table?.chinese_definition || "").toLowerCase().includes(q) ||
      (e.custom_tags || []).join(" ").toLowerCase().includes(q) ||
      (e.personal_notes || "").toLowerCase().includes(q) ||
      (e.source_text || "").toLowerCase().includes(q)
    );
  }, [entries, search, activeSubTag]);

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

  const startEditMaterial = (mat: MaterialEntry) => {
    setEditingMaterial(mat.id);
    setEditContent(mat.content);
    setEditNotes(mat.notes || "");
    setEditSource(mat.source || "");
  };

  const cancelEditMaterial = () => {
    setEditingMaterial(null);
    setEditContent("");
    setEditNotes("");
    setEditSource("");
  };

  const saveEditMaterial = async (matId: string) => {
    if (!editContent.trim()) { toast.error("内容不能为空"); return; }
    setEditSaving(true);
    try {
      const { error } = await supabase.from("material_entries" as any).update({
        content: editContent.trim().slice(0, 5000),
        notes: editNotes.trim().slice(0, 2000),
        source: editSource.trim().slice(0, 200),
      }).eq("id", matId);
      if (error) throw error;
      setMaterials(prev => prev.map(m => m.id === matId ? { ...m, content: editContent.trim(), notes: editNotes.trim() || null, source: editSource.trim() || null } : m));
      toast.success("素材已更新");
      cancelEditMaterial();
    } catch (e: any) {
      console.error(e);
      toast.error("更新失败");
    } finally {
      setEditSaving(false);
    }
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
    if (modalWord) setModalWord(prev => prev ? { ...prev, tags: newTags } : prev);
    toast.success("标签已更新");
  };

  // Corpus inline editing helpers
  const startEditCorpus = (entry: CorpusEntry) => {
    setEditingCorpus(entry.id);
    setEcWord(entry.vocab_table?.word || "");
    setEcPhonetic(entry.vocab_table?.phonetic || "");
    setEcDefinition(entry.vocab_table?.chinese_definition || "");
    setEcNotes(entry.personal_notes || "");
    setEcTags([...(entry.custom_tags || [])]);
    setEcTagInput("");
    setSynLinked([]);
    setSynRecommendations(null);
    setSynSearch("");
    // Load existing cluster members for this word
    const vocabId = entry.vocab_table?.id;
    if (vocabId && clusterMap[vocabId]?.length > 0) {
      const members = clusterMap[vocabId];
      setExistingClusterMembers(members);
      setExistingClusterId(members[0].clusterId);
      // Load cluster notes
      supabase.from("synonym_clusters").select("notes").eq("id", members[0].clusterId).single().then(({ data }) => {
        setClusterNotes((data as any)?.notes || "");
        setClusterNotesOriginal((data as any)?.notes || "");
      });
    } else {
      setExistingClusterMembers([]);
      setExistingClusterId(null);
      setClusterNotes("");
      setClusterNotesOriginal("");
    }
  };

  const cancelEditCorpus = () => {
    setEditingCorpus(null);
    setEcWord(""); setEcPhonetic(""); setEcDefinition(""); setEcNotes("");
    setEcTags([]); setEcTagInput("");
    setExistingClusterMembers([]); setExistingClusterId(null);
    setClusterNotes(""); setClusterNotesOriginal("");
  };

  const addEcTag = () => {
    const t = normalizeTag(ecTagInput.trim().replace(/^#/, ""));
    if (!t || ecTags.includes(t)) { setEcTagInput(""); return; }
    if (ecTags.length >= 20) { toast.error("最多20个标签"); return; }
    setEcTags(prev => [...prev, t]);
    setEcTagInput("");
  };

  const removeEcTag = (tag: string) => setEcTags(prev => prev.filter(t => t !== tag));

  const saveEditCorpus = async (entry: CorpusEntry) => {
    if (!ecWord.trim()) { toast.error("单词不能为空"); return; }
    if (!ecDefinition.trim()) { toast.error("释义不能为空"); return; }
    setEcSaving(true);
    try {
      // Update vocab_table
      if (entry.vocab_table) {
        const { error: vocabErr } = await supabase.from("vocab_table").update({
          word: ecWord.trim().toLowerCase(),
          phonetic: ecPhonetic.trim() || null,
          chinese_definition: ecDefinition.trim(),
        }).eq("id", entry.vocab_table.id);
        if (vocabErr) throw vocabErr;
      }
      // Update corpus_entries
      const normalizedTags = normalizeTags(ecTags);
      const { error: corpusErr } = await supabase.from("corpus_entries").update({
        personal_notes: ecNotes.trim() || null,
        custom_tags: normalizedTags,
      }).eq("id", entry.id);
      if (corpusErr) throw corpusErr;

      // Update local state
      setEntries(prev => prev.map(e => {
        if (e.id !== entry.id) return e;
        return {
          ...e,
          personal_notes: ecNotes.trim() || null,
          custom_tags: normalizedTags,
          vocab_table: e.vocab_table ? {
            ...e.vocab_table,
            word: ecWord.trim().toLowerCase(),
            phonetic: ecPhonetic.trim() || null,
            chinese_definition: ecDefinition.trim(),
          } : null,
        };
      }));
      toast.success("已更新");
      cancelEditCorpus();
    } catch (e: any) {
      console.error(e);
      toast.error("更新失败");
    } finally {
      setEcSaving(false);
    }
  };

  const STANDARD_TAG_OPTIONS = CORPUS_CATEGORY_GROUPS.map(g => g.label);

  // All vocab words for synonym search
  const allVocabWords = useMemo(() => entries.map(e => e.vocab_table?.word).filter(Boolean) as string[], [entries]);

  const vocabSearchResults = useMemo(() => {
    if (!synSearch.trim()) return [];
    const q = synSearch.toLowerCase();
    const existingWords = existingClusterMembers.map(m => m.word.toLowerCase());
    return allVocabWords.filter(w =>
      w.toLowerCase().includes(q) &&
      !synLinked.includes(w) &&
      w.toLowerCase() !== ecWord.toLowerCase() &&
      !existingWords.includes(w.toLowerCase())
    ).slice(0, 8);
  }, [synSearch, allVocabWords, synLinked, ecWord, existingClusterMembers]);

  const handleAIRecommend = async () => {
    if (!ecWord.trim()) return;
    setSynLoading(true);
    setSynRecommendations(null);
    try {
      const { data, error } = await supabase.functions.invoke("synonym-analyze", {
        body: { action: "recommend", words: [ecWord.trim()], allWords: allVocabWords },
      });
      if (error) throw error;
      setSynRecommendations(data);
      // Auto-add fromLibrary results to linked
      if (data?.fromLibrary) {
        setSynLinked(prev => {
          const next = [...prev];
          data.fromLibrary.forEach((w: string) => { if (!next.includes(w)) next.push(w); });
          return next;
        });
      }
    } catch (e: any) {
      console.error(e);
      toast.error("AI推荐失败");
    } finally {
      setSynLoading(false);
    }
  };

  const handleSaveCluster = async () => {
    if (synLinked.length === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find vocab IDs for linked words + current word
      const wordsToLink = [ecWord.toLowerCase(), ...synLinked.map(w => w.toLowerCase())];
      const { data: vocabs } = await supabase.from("vocab_table").select("id, word").in("word", wordsToLink);
      if (!vocabs || vocabs.length === 0) { toast.error("未找到匹配词汇"); return; }

      // Check if any of the new words already belong to other clusters
      const newVocabIds = vocabs.filter(v => v.word !== ecWord.toLowerCase()).map(v => v.id);
      let existingOtherClusters: { clusterId: string; clusterName: string; vocabIds: string[] }[] = [];
      if (newVocabIds.length > 0) {
        const { data: existingMembers } = await supabase
          .from("synonym_cluster_members")
          .select("cluster_id, vocab_id")
          .in("vocab_id", newVocabIds);
        if (existingMembers && existingMembers.length > 0) {
          // Group by cluster_id, exclude the current cluster
          const otherClusters: Record<string, string[]> = {};
          for (const m of existingMembers) {
            if (m.cluster_id !== existingClusterId) {
              if (!otherClusters[m.cluster_id]) otherClusters[m.cluster_id] = [];
              otherClusters[m.cluster_id].push(m.vocab_id);
            }
          }
          if (Object.keys(otherClusters).length > 0) {
            // Fetch cluster names
            const clusterIds = Object.keys(otherClusters);
            const { data: clusters } = await supabase.from("synonym_clusters").select("id, cluster_name").in("id", clusterIds);
            existingOtherClusters = clusterIds.map(cid => ({
              clusterId: cid,
              clusterName: clusters?.find(c => c.id === cid)?.cluster_name || "未命名",
              vocabIds: otherClusters[cid],
            }));
          }
        }
      }

      // If there are conflicting clusters, ask to merge
      if (existingOtherClusters.length > 0) {
        const clusterNames = existingOtherClusters.map(c => `「${c.clusterName}」`).join("、");
        const confirmed = window.confirm(
          `部分单词已属于其他词簇 ${clusterNames}。\n是否将它们合并为一个大的记忆簇？`
        );
        if (!confirmed) return;

        // Merge: move all members from other clusters to current/new cluster
        if (existingClusterId) {
          // Move members from other clusters to current cluster
          for (const oc of existingOtherClusters) {
            await supabase.from("synonym_cluster_members").update({ cluster_id: existingClusterId } as any).eq("cluster_id", oc.clusterId);
            await supabase.from("synonym_clusters").delete().eq("id", oc.clusterId);
          }
          // Add any new words not yet in the cluster
          const { data: currentMembers } = await supabase.from("synonym_cluster_members").select("vocab_id").eq("cluster_id", existingClusterId);
          const existingVocabIds = new Set((currentMembers || []).map(m => m.vocab_id));
          const newMembers = vocabs.filter(v => !existingVocabIds.has(v.id)).map(v => ({
            cluster_id: existingClusterId,
            vocab_id: v.id,
            user_id: user.id,
          }));
          if (newMembers.length > 0) await supabase.from("synonym_cluster_members").insert(newMembers);
          toast.success(`已合并词簇，共包含 ${(currentMembers?.length || 0) + newMembers.length} 个词`);
        } else {
          // Create new cluster, absorb all
          const clusterName = synRecommendations?.clusterName || `${ecWord} 同义词组`;
          const { data: cluster, error: cErr } = await supabase.from("synonym_clusters").insert({
            cluster_name: clusterName, user_id: user.id,
          }).select("id").single();
          if (cErr || !cluster) throw cErr;

          // Move members from other clusters
          for (const oc of existingOtherClusters) {
            await supabase.from("synonym_cluster_members").update({ cluster_id: cluster.id } as any).eq("cluster_id", oc.clusterId);
            await supabase.from("synonym_clusters").delete().eq("id", oc.clusterId);
          }
          // Add all vocabs
          const { data: currentMembers } = await supabase.from("synonym_cluster_members").select("vocab_id").eq("cluster_id", cluster.id);
          const existingVocabIds = new Set((currentMembers || []).map(m => m.vocab_id));
          const newMembers = vocabs.filter(v => !existingVocabIds.has(v.id)).map(v => ({
            cluster_id: cluster.id, vocab_id: v.id, user_id: user.id,
          }));
          if (newMembers.length > 0) await supabase.from("synonym_cluster_members").insert(newMembers);
          toast.success(`已创建并合并词簇「${clusterName}」`);
        }
      } else if (existingClusterId) {
        // Add to existing cluster
        const { data: currentMembers } = await supabase.from("synonym_cluster_members").select("vocab_id").eq("cluster_id", existingClusterId);
        const existingVocabIds = new Set((currentMembers || []).map(m => m.vocab_id));
        const newMembers = vocabs.filter(v => !existingVocabIds.has(v.id)).map(v => ({
          cluster_id: existingClusterId, vocab_id: v.id, user_id: user.id,
        }));
        if (newMembers.length === 0) { toast.info("这些词已在当前词簇中"); return; }
        const { error: mErr } = await supabase.from("synonym_cluster_members").insert(newMembers);
        if (mErr) throw mErr;
        toast.success(`已添加 ${newMembers.length} 个词到词簇`);
      } else {
        // Create new cluster
        const clusterName = synRecommendations?.clusterName || `${ecWord} 同义词组`;
        const { data: cluster, error: cErr } = await supabase.from("synonym_clusters").insert({
          cluster_name: clusterName, user_id: user.id,
        }).select("id").single();
        if (cErr || !cluster) throw cErr;
        const members = vocabs.map(v => ({
          cluster_id: cluster.id, vocab_id: v.id, user_id: user.id,
        }));
        const { error: mErr } = await supabase.from("synonym_cluster_members").insert(members);
        if (mErr) throw mErr;
        toast.success(`已创建词簇「${clusterName}」，包含 ${members.length} 个词`);
      }

      setSynLinked([]);
      setSynRecommendations(null);
      fetchAll();
    } catch (e: any) {
      console.error(e);
      toast.error("保存词簇失败");
    }
  };

  // Remove a member from a cluster (bidirectional)
  const handleRemoveClusterMember = async (memberId: string, vocabId: string) => {
    try {
      // Delete the member row
      const { error } = await supabase.from("synonym_cluster_members").delete().eq("id", memberId);
      if (error) throw error;
      // Update local state
      setExistingClusterMembers(prev => prev.filter(m => m.memberId !== memberId));
      // Check if only 1 member left in cluster - if so, delete the cluster entirely
      if (existingClusterId) {
        const { data: remaining } = await supabase.from("synonym_cluster_members").select("id").eq("cluster_id", existingClusterId);
        if (remaining && remaining.length <= 1) {
          // Delete remaining member and cluster
          await supabase.from("synonym_cluster_members").delete().eq("cluster_id", existingClusterId);
          await supabase.from("synonym_clusters").delete().eq("id", existingClusterId);
          setExistingClusterId(null);
          setExistingClusterMembers([]);
          toast.success("词簇已解散（成员不足）");
        } else {
          toast.success("已从词簇中移除");
        }
      }
      fetchAll();
    } catch (e: any) {
      console.error(e);
      toast.error("移除失败");
    }
  };

  // Save cluster notes
  const handleSaveClusterNotes = async () => {
    if (!existingClusterId || clusterNotes === clusterNotesOriginal) return;
    try {
      const { error } = await supabase.from("synonym_clusters").update({ notes: clusterNotes.trim() || null }).eq("id", existingClusterId);
      if (error) throw error;
      setClusterNotesOriginal(clusterNotes);
      toast.success("辨析笔记已保存");
    } catch (e: any) {
      toast.error("保存笔记失败");
    }
  };

  const handleCompareCluster = async (words: string[]) => {
    if (words.length < 2) { toast.error("至少需要2个词进行对比"); return; }
    setComparisonLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("synonym-analyze", {
        body: { action: "compare", words },
      });
      if (error) throw error;
      setComparisonData(data);
    } catch (e: any) {
      console.error(e);
      toast.error("辨析加载失败");
    } finally {
      setComparisonLoading(false);
    }
  };

  const [normalizing, setNormalizing] = useState(false);

  const handleNormalizeAllTags = async () => {
    // Find entries whose tags would change after normalization
    const toUpdate = entries.filter(e => {
      const original = e.custom_tags || [];
      const normalized = normalizeTags(original);
      return JSON.stringify(original) !== JSON.stringify(normalized);
    });

    if (toUpdate.length === 0) {
      toast.info("所有标签已是标准格式，无需修复 ✨");
      return;
    }

    setNormalizing(true);
    let successCount = 0;
    let failCount = 0;

    for (const entry of toUpdate) {
      const newTags = normalizeTags(entry.custom_tags || []);
      const { error } = await supabase
        .from("corpus_entries")
        .update({ custom_tags: newTags })
        .eq("id", entry.id);
      if (error) {
        failCount++;
      } else {
        successCount++;
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, custom_tags: newTags } : e));
      }
    }

    setNormalizing(false);

    if (failCount === 0) {
      toast.success(`归一化完成 ✅ 已修复 ${successCount} 条词条的标签`);
    } else {
      toast.warning(`归一化部分完成：成功 ${successCount} 条，失败 ${failCount} 条`);
    }
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
    <div className="max-w-3xl mx-auto px-4 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between pt-6 pb-4">
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

        {/* Sticky container: Tabs + Sub-tag chips */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pt-1 pb-3 -mx-4 px-4 border-b border-border/40 mb-4">
          {/* Tabs */}
          <div className="flex gap-3 mb-3">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
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

          {/* Sub-category chip bar */}
          {activeTab === "materials" && currentSubTags.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              <button
                onClick={() => setActiveSubTag(null)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  activeSubTag === null
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                }`}
              >
                全部
              </button>
              {currentSubTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveSubTag(activeSubTag === tag ? null : tag)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeSubTag === tag
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          {/* Corpus: normalized category groups chip bar + normalize button */}
          {activeTab === "corpus" && (
            <>
              {corpusCategoryGroups.length > 0 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
                  <button
                    onClick={() => setActiveSubTag(null)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      activeSubTag === null
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                    }`}
                  >
                    全部
                  </button>
                  {corpusCategoryGroups.map(({ label, count }) => (
                    <button
                      key={label}
                      onClick={() => setActiveSubTag(activeSubTag === label ? null : label)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                        activeSubTag === label
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                      }`}
                    >
                      {label}
                      <span className="opacity-70 text-[10px]">({count})</span>
                    </button>
                  ))}
                </div>
              )}
              {/* One-click normalize button */}
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleNormalizeAllTags}
                  disabled={normalizing || entries.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-primary/30 text-primary/70 text-xs font-medium hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title="扫描并批量修复所有词条中的英文、碎片化标签"
                >
                  {normalizing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  {normalizing ? "归一化中..." : "一键标签归一化"}
                </button>
              </div>
            </>
          )}

        </div>

        {/* Search */}
        <div className="relative mb-3">
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
                    const isEditing = editingMaterial === mat.id;
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
                              {!isEditing && mat.source && (
                                <span className="text-[10px] text-muted-foreground">· {mat.source}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => saveEditMaterial(mat.id)}
                                    disabled={editSaving}
                                    className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                                    title="保存"
                                  >
                                    {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    onClick={cancelEditMaterial}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="取消"
                                  >
                                    <XIcon className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditMaterial(mat)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                    title="编辑"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
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
                                </>
                              )}
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-3">
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                maxLength={5000}
                                rows={4}
                                className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none border focus:ring-2 focus:ring-primary/20 resize-none"
                              />
                              <input
                                type="text"
                                value={editSource}
                                onChange={(e) => setEditSource(e.target.value)}
                                placeholder="来源..."
                                maxLength={200}
                                className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20"
                              />
                              <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="笔记..."
                                maxLength={2000}
                                rows={2}
                                className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20 resize-none"
                              />
                            </div>
                          ) : (
                            <>
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
                            </>
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
                : (filteredEntries as CorpusEntry[]).map(entry => {
                    const isEditingThis = editingCorpus === entry.id;
                    return (
                    <motion.div
                      key={`corpus-${entry.id}`}
                      id={`corpus-card-${entry.vocab_table?.id || entry.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-card rounded-xl shadow-warm overflow-hidden border border-border cursor-pointer hover:border-primary/30 hover:bg-muted/20 transition-all"
                      onClick={() => {
                        if (!isEditingThis && entry.vocab_table) {
                          setModalWord({ word: entry.vocab_table.word, vocabId: entry.vocab_table.id, tags: entry.custom_tags || [] });
                        }
                      }}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            {isEditingThis ? (
                              <div className="space-y-2.5" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-2">
                                  <input value={ecWord} onChange={e => setEcWord(e.target.value)} placeholder="单词" maxLength={100}
                                    className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm font-semibold text-foreground outline-none border focus:ring-1 focus:ring-primary/20" />
                                  <input value={ecPhonetic} onChange={e => setEcPhonetic(e.target.value)} placeholder="音标" maxLength={100}
                                    className="w-28 bg-muted rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20" />
                                </div>
                                <input value={ecDefinition} onChange={e => setEcDefinition(e.target.value)} placeholder="中文释义" maxLength={500}
                                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none border focus:ring-1 focus:ring-primary/20" />
                                <textarea value={ecNotes} onChange={e => setEcNotes(e.target.value)} placeholder="例句笔记..." maxLength={2000} rows={2}
                                  className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20 resize-none" />
                                {/* Inline tag editing */}
                                <div>
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {ecTags.map(tag => (
                                      <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                                        #{tag}
                                        <button onClick={() => removeEcTag(tag)} className="hover:opacity-70 ml-0.5"><XIcon className="h-2.5 w-2.5" /></button>
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <select
                                      value=""
                                      onChange={e => {
                                        const v = e.target.value;
                                        if (v && !ecTags.includes(v)) setEcTags(prev => [...prev, v]);
                                      }}
                                      className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none border focus:ring-1 focus:ring-primary/20"
                                    >
                                      <option value="">选择标签...</option>
                                      {STANDARD_TAG_OPTIONS.filter(t => !ecTags.includes(t)).map(t => (
                                        <option key={t} value={t}>{t}</option>
                                      ))}
                                    </select>
                                    <input value={ecTagInput} onChange={e => setEcTagInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEcTag(); } }}
                                      placeholder="自定义标签" maxLength={50}
                                      className="w-28 bg-muted rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20" />
                                    <button onClick={addEcTag} className="px-2 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs">+</button>
                                  </div>
                                </div>
                                {/* Synonym Linking */}
                                <div className="border-t border-border pt-2.5">
                                  <p className="text-[10px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                                    <Link2 className="h-3 w-3 text-primary" />
                                    词族管理
                                  </p>
                                  {/* Current cluster members (removable) */}
                                  {existingClusterMembers.length > 0 && (
                                    <div className="mb-2.5">
                                      <p className="text-[10px] text-muted-foreground mb-1">当前词族成员：</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {existingClusterMembers.map(m => (
                                          <span key={m.memberId} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                                            {m.word}
                                            <button
                                              onClick={() => handleRemoveClusterMember(m.memberId, m.vocabId)}
                                              className="hover:opacity-70 ml-0.5"
                                              title={`从词簇中移除 ${m.word}`}
                                            >
                                              <XIcon className="h-2.5 w-2.5" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Cluster notes */}
                                  {existingClusterId && (
                                    <div className="mb-2.5">
                                      <p className="text-[10px] text-muted-foreground mb-1">辨析笔记：</p>
                                      <textarea
                                        value={clusterNotes}
                                        onChange={e => setClusterNotes(e.target.value)}
                                        placeholder="记录你的对比心得，如：vanish 多用于文学描写，decrease 更多用于学术图表描述..."
                                        maxLength={2000}
                                        rows={3}
                                        className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20 resize-none"
                                      />
                                      {clusterNotes !== clusterNotesOriginal && (
                                        <button
                                          onClick={handleSaveClusterNotes}
                                          className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors"
                                        >
                                          <Save className="h-3 w-3" />
                                          保存笔记
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {/* Add new linked words */}
                                  <p className="text-[10px] text-muted-foreground mb-1">添加近义/关联词：</p>
                                  {/* Newly linked words (not yet saved) */}
                                  {synLinked.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                      {synLinked.map(w => (
                                        <span key={w} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent text-accent-foreground text-[10px]">
                                          {w}
                                          <button onClick={() => setSynLinked(prev => prev.filter(x => x !== w))} className="hover:opacity-70 ml-0.5"><XIcon className="h-2.5 w-2.5" /></button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Search input */}
                                  <div className="flex gap-1.5 mb-1.5">
                                    <input
                                      value={synSearch}
                                      onChange={e => setSynSearch(e.target.value)}
                                      placeholder="搜索库中已有单词..."
                                      maxLength={50}
                                      className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none border focus:ring-1 focus:ring-primary/20"
                                    />
                                    <button
                                      onClick={handleAIRecommend}
                                      disabled={synLoading}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                                    >
                                      {synLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                      AI发现
                                    </button>
                                  </div>
                                  {/* Search results dropdown */}
                                  {vocabSearchResults.length > 0 && (
                                    <div className="bg-muted rounded-lg border mb-1.5 max-h-28 overflow-y-auto">
                                      {vocabSearchResults.map(w => (
                                        <button
                                          key={w}
                                          onClick={() => {
                                            if (synLinked.includes(w)) { toast.info(`${w} 已在待添加列表中`); return; }
                                            setSynLinked(prev => [...prev, w]);
                                            setSynSearch("");
                                          }}
                                          className="w-full text-left px-2.5 py-1.5 text-xs text-foreground hover:bg-primary/10 transition-colors"
                                        >
                                          {w}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {/* AI recommendations */}
                                  {synRecommendations?.suggested && synRecommendations.suggested.length > 0 && (
                                    <div className="mb-1.5">
                                      <p className="text-[10px] text-muted-foreground mb-1">AI推荐（不在库中）：</p>
                                      <div className="flex flex-wrap gap-1">
                                        {synRecommendations.suggested.map(w => (
                                          <button
                                            key={w}
                                            onClick={() => setSynLinked(prev => prev.includes(w) ? prev : [...prev, w])}
                                            className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] hover:bg-primary/10 hover:text-primary transition-colors"
                                          >
                                            + {w}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Save cluster + Compare */}
                                  {synLinked.length > 0 && (
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={handleSaveCluster}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                                      >
                                        <Link2 className="h-3 w-3" />
                                        {existingClusterId ? `添加到词簇（+${synLinked.length}词）` : `保存词簇（${synLinked.length + 1}词）`}
                                      </button>
                                      <button
                                        onClick={() => handleCompareCluster([ecWord, ...synLinked, ...existingClusterMembers.map(m => m.word)])}
                                        disabled={comparisonLoading}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                                      >
                                        {comparisonLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeftRight className="h-3 w-3" />}
                                        微观辨析
                                      </button>
                                    </div>
                                  )}
                                  {/* Compare button for existing members only */}
                                  {synLinked.length === 0 && existingClusterMembers.length > 0 && (
                                    <button
                                      onClick={() => handleCompareCluster([ecWord, ...existingClusterMembers.map(m => m.word)])}
                                      disabled={comparisonLoading}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                                    >
                                      {comparisonLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeftRight className="h-3 w-3" />}
                                      AI 生成深度辨析
                                    </button>
                                  )}
                                </div>
                                {/* Save / Cancel */}
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => saveEditCorpus(entry)} disabled={ecSaving}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
                                    {ecSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    保存
                                  </button>
                                  <button onClick={cancelEditCorpus}
                                    className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground">
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-base font-semibold text-foreground">{entry.vocab_table?.word}</h3>
                                  {entry.vocab_table?.phonetic && (
                                    <span className="text-[10px] text-muted-foreground font-mono">{entry.vocab_table.phonetic}</span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{entry.vocab_table?.chinese_definition}</p>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            {!isEditingThis && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEditCorpus(entry); }}
                                  className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                  title="编辑"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCorpus(entry.id); }}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {!isEditingThis && entry.personal_notes && (
                          <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2">📝 {entry.personal_notes}</p>
                        )}

                        {!isEditingThis && (
                          <>
                            {/* Related clusters capsules */}
                            {entry.vocab_table && (() => {
                              const related = clusterMap[entry.vocab_table.id] || [];
                              return related.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                  <Link2 className="h-3 w-3 text-primary/50 shrink-0" />
                                  {related.map(r => (
                                    <button
                                      key={r.vocabId}
                                      onClick={() => scrollToWord(r.vocabId)}
                                      className="px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-medium hover:bg-accent/80 transition-colors"
                                    >
                                      {r.word}
                                    </button>
                                  ))}
                                  <button
                                    onClick={() => handleCompareCluster([entry.vocab_table!.word, ...related.map(r => r.word)])}
                                    disabled={comparisonLoading}
                                    className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                                    title="AI 微观辨析"
                                  >
                                    {comparisonLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : <ArrowLeftRight className="h-3 w-3 inline" />}
                                    {" "}辨析
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEditCorpus(entry); }}
                                  className="flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-colors"
                                >
                                  <Plus className="h-3 w-3" />
                                  关联同类词
                                </button>
                              );
                            })()}
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className="tag-chip text-[10px] shrink-0">{entry.application_scenario}</span>
                            </div>
                            <TagEditor
                              tags={entry.custom_tags || []}
                              onSave={(newTags) => handleSaveCorpusTags(entry.id, newTags)}
                            />
                          </>
                        )}
                      </div>
                    </motion.div>
                    );
                  })
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

      {/* Synonym Comparison Dashboard */}
      <AnimatePresence>
        {comparisonData && (
          <SynonymComparisonDashboard
            data={comparisonData}
            onClose={() => setComparisonData(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
