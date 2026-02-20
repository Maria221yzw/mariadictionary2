import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark, ChevronRight, Loader2, Volume2, Plus, Eye, Copy, FilePlus } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AIWordData } from "@/pages/SearchPage";
import AddToCorpusDialog from "@/components/AddToCorpusDialog";
import WordFormSection from "@/components/WordFormSection";
import { useSpeech } from "@/hooks/useSpeech";
import MasterySelector from "@/components/MasterySelector";

interface MaterialEntry {
  id: string;
  content: string;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
  category: string;
}

export default function WordDetailPage() {
  const { word: wordKey } = useParams<{ word: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [wordData, setWordData] = useState<AIWordData | null>(null);
  const [vocabId, setVocabId] = useState<string | null>(null);
  const [lookupCount, setLookupCount] = useState<number>(0);
  const [masteryLevel, setMasteryLevel] = useState<number>(1);
  const [showCorpusDialog, setShowCorpusDialog] = useState(false);
  const [relatedMaterials, setRelatedMaterials] = useState<MaterialEntry[]>([]);
  const { speaking, speak } = useSpeech();

  useEffect(() => {
    if (!wordKey) return;
    const fetchWord = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("请先登录");
          setLoading(false);
          return;
        }

        const { data: fnData, error } = await supabase.functions.invoke("word-expand", {
          body: { word: decodeURIComponent(wordKey) },
        });
        if (error) throw error;
        setWordData(fnData);

        const { data: existing } = await supabase
          .from("vocab_table")
          .select("id, lookup_count, mastery_level")
          .eq("word", fnData.word || wordKey)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          const newCount = existing.lookup_count + 1;
          await supabase.from("vocab_table").update({ lookup_count: newCount }).eq("id", existing.id);
          setVocabId(existing.id);
          setLookupCount(newCount);
          setMasteryLevel((existing as any).mastery_level || 1);
        } else {
          const { data: inserted } = await supabase.from("vocab_table").insert({
            word: (fnData.word || wordKey).slice(0, 100),
            phonetic: (fnData.phonetic || "").slice(0, 200),
            chinese_definition: (fnData.coreDefinition || fnData.definitions?.[0]?.meaningCn || "").slice(0, 500),
            user_id: user.id,
          }).select("id, mastery_level").single();
          setVocabId(inserted?.id || null);
          setLookupCount(1);
          setMasteryLevel((inserted as any)?.mastery_level || 1);
        }

        // Fetch related materials that contain the searched word
        const wordLower = (fnData.word || decodeURIComponent(wordKey)).toLowerCase();
        const { data: matData } = await supabase
          .from("material_entries" as any)
          .select("id, content, notes, source, tags, category")
          .filter("content", "ilike", `%${wordLower}%`);
        setRelatedMaterials((matData as any) || []);

      } catch (e: any) {
        console.error(e);
        toast.error("加载失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    };
    fetchWord();
  }, [wordKey]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">AI 正在生成词条详情...</p>
      </div>
    );
  }

  if (!wordData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-2xl font-display text-foreground mb-2">未找到该词</p>
          <button onClick={() => navigate("/")} className="text-primary text-sm hover:underline">返回搜索</button>
        </div>
      </div>
    );
  }

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <motion.div variants={container} initial="hidden" animate="show">
        {/* Nav bar */}
        <motion.div variants={item} className="flex items-center justify-between mb-8">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm transition-colors">
            <ArrowLeft className="h-4 w-4" /> 返回
          </button>
          <button onClick={() => setShowCorpusDialog(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
            <Bookmark className="h-3.5 w-3.5" /> 加入语料库
          </button>
        </motion.div>

        {/* ===== Dictionary-style Header ===== */}
        <motion.div variants={item} className="bg-card rounded-2xl shadow-warm p-6 mb-4">
          {/* Word */}
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-display font-bold text-foreground tracking-tight">{wordData.word}</h1>
            {lookupCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                <Eye className="h-3 w-3" /> 已查 {lookupCount} 次
              </span>
            )}
          </div>

          {/* Mastery level selector */}
          {vocabId && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">掌握程度：</span>
              <MasterySelector
                vocabId={vocabId}
                currentLevel={masteryLevel}
                size="md"
                onUpdate={setMasteryLevel}
              />
              <span className="text-xs text-muted-foreground">L{masteryLevel}</span>
            </div>
          )}

          {/* Phonetics with TTS */}
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={() => speak(wordData.word, "en-GB")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors group"
            >
              <span className="font-mono">英</span>
              <span className="font-mono text-foreground">{wordData.phonetic || `/${wordData.word}/`}</span>
              <Volume2 className={`h-4 w-4 transition-all ${speaking ? "text-primary scale-110" : "group-hover:text-primary"}`} />
            </button>
            <button
              onClick={() => speak(wordData.word, "en-US")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors group"
            >
              <span className="font-mono">美</span>
              <span className="font-mono text-foreground">{wordData.phonetic || `/${wordData.word}/`}</span>
              <Volume2 className={`h-4 w-4 transition-all ${speaking ? "text-primary scale-110" : "group-hover:text-primary"}`} />
            </button>
          </div>

          {/* Core Chinese definition – prominent */}
          {wordData.coreDefinition && (
            <p className="mt-4 text-xl font-bold text-foreground leading-snug">
              {wordData.coreDefinition}
            </p>
          )}

          {/* POS definitions summary */}
          {wordData.definitions && wordData.definitions.length > 0 && (
            <div className="mt-3 space-y-1">
              {wordData.definitions.map((def, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  <span className="font-mono text-primary font-medium mr-1.5">{def.pos}</span>
                  {def.meaningCn}
                </p>
              ))}
            </div>
          )}
        </motion.div>

        {/* ===== Network definitions / Keyword tags ===== */}
        <motion.div variants={item} className="bg-card rounded-2xl shadow-warm p-5 mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">网络释义 · 关键词</h3>
          <div className="flex flex-wrap gap-2">
            {wordData.suggestedTags?.map(tag => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
            {wordData.difficulty && (
              <span className={`tag-chip ${wordData.difficulty === "高级" ? "!bg-accent/15 !text-accent" : ""}`}>
                {wordData.difficulty}
              </span>
            )}
            {/* Also show definitions as keyword chips */}
            {wordData.definitions?.map((def, i) => (
              <span key={`def-${i}`} className="tag-chip">{def.meaningCn}</span>
            ))}
          </div>
        </motion.div>

        {/* ===== Tabs ===== */}
        <motion.div variants={item}>
          <Tabs defaultValue="forms" className="w-full">
            <TabsList className="w-full bg-muted/50 p-1 rounded-xl mb-4">
              <TabsTrigger value="forms" className="flex-1 rounded-lg text-xs">词性变形</TabsTrigger>
              <TabsTrigger value="phrases" className="flex-1 rounded-lg text-xs">词组短语</TabsTrigger>
              <TabsTrigger value="examples" className="flex-1 rounded-lg text-xs">分类例句</TabsTrigger>
              <TabsTrigger value="etymology" className="flex-1 rounded-lg text-xs">词根词缀</TabsTrigger>
              <TabsTrigger value="synonyms" className="flex-1 rounded-lg text-xs">近义词</TabsTrigger>
              <TabsTrigger value="related" className="flex-1 rounded-lg text-xs">延展</TabsTrigger>
            </TabsList>

            {/* Word Forms */}
            <TabsContent value="forms">
              {wordData.wordForms && wordData.wordForms.length > 0 ? (
                <div className="space-y-3">
                  {wordData.wordForms.map((form, i) => (
                    <WordFormSection key={i} form={form} defaultOpen={i === 0} />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {wordData.definitions?.map((def, i) => (
                    <div key={i} className="bg-card rounded-xl p-4 shadow-warm">
                      <span className="text-xs font-mono text-primary font-medium">{def.pos}</span>
                      <p className="text-sm text-foreground mt-1 font-medium">{def.meaningCn}</p>
                      <p className="text-sm text-muted-foreground mt-1">{def.meaning}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Phrases & Collocations */}
            <TabsContent value="phrases">
              {wordData.phrases && wordData.phrases.length > 0 ? (
                <div className="space-y-2">
                  {wordData.phrases.map((p, i) => (
                    <div key={i} className="bg-card rounded-xl p-4 shadow-warm flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => navigate(`/word/${encodeURIComponent(p.phrase.toLowerCase())}`)}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {p.phrase}
                        </button>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.meaningCn}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (!vocabId) { toast.error("请稍后再试"); return; }
                          setShowCorpusDialog(true);
                        }}
                        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="加入语料库"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">暂无词组短语数据</p>
              )}
            </TabsContent>

            <TabsContent value="examples">
              <div className="space-y-3">
                {wordData.examples?.map((ex, i) => (
                  <div key={i} className="bg-card rounded-xl p-5 shadow-warm">
                    <span className="tag-chip mb-2">{ex.context}</span>
                    <p className="text-sm text-foreground mt-3 leading-relaxed font-medium">{ex.sentence}</p>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{ex.translation}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Etymology / Roots */}
            <TabsContent value="etymology">
              {wordData.etymology && wordData.etymology.length > 0 ? (
                <div className="space-y-3">
                  {wordData.etymology.map((ety, i) => (
                    <div key={i} className="bg-card rounded-xl p-5 shadow-warm">
                      <p className="text-sm font-semibold text-foreground">
                        <span className="font-mono text-primary mr-2">{ety.root}</span>
                        {ety.meaning}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {ety.relatedWords.map(w => (
                          <button
                            key={w}
                            onClick={() => navigate(`/word/${encodeURIComponent(w.toLowerCase())}`)}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            {w} <ChevronRight className="inline h-3 w-3 ml-0.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">暂无词根词缀数据</p>
              )}
            </TabsContent>

            <TabsContent value="synonyms">
              {wordData.synonymComparison && wordData.synonymComparison.length > 0 ? (
                <div className="bg-card rounded-xl shadow-warm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium text-foreground">近义词</th>
                        <th className="text-left p-3 font-medium text-foreground">语境差别</th>
                        <th className="text-left p-3 font-medium text-foreground">用法差异</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wordData.synonymComparison.map((s, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-3 font-medium">
                            <button
                              onClick={() => navigate(`/word/${encodeURIComponent(s.word.toLowerCase())}`)}
                              className="text-primary hover:underline"
                            >
                              {s.word}
                            </button>
                          </td>
                          <td className="p-3 text-foreground text-xs">{s.nuance}</td>
                          <td className="p-3 text-muted-foreground text-xs">{s.exampleDiff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">暂无近义词辨析数据</p>
              )}
            </TabsContent>

            <TabsContent value="related">
              <div className="space-y-3">
                {wordData.relatedWords?.map((group, i) => (
                  <div key={i} className="bg-card rounded-xl p-4 shadow-warm">
                    <p className="text-xs font-medium text-muted-foreground mb-3">{group.type}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.words.map(w => (
                        <button
                          key={w}
                          onClick={() => navigate(`/word/${encodeURIComponent(w.toLowerCase())}`)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {w} <ChevronRight className="inline h-3 w-3 ml-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* ===== Related Personal Materials ===== */}
        {relatedMaterials.length > 0 && (
          <motion.div variants={item} className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <FilePlus className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">我的语料例句</h3>
              <span className="text-xs text-muted-foreground">· {relatedMaterials.length} 条</span>
            </div>
            <div className="space-y-2.5">
              {relatedMaterials.map(mat => (
                <div key={mat.id} className="bg-card rounded-xl shadow-warm border border-primary/10 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground leading-relaxed font-medium flex-1">{mat.content}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(mat.content).then(() => toast.success("已复制")).catch(() => toast.error("复制失败"))}
                      className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="复制"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {mat.notes && <p className="text-xs text-muted-foreground mt-2">📝 {mat.notes}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {mat.source && (
                      <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px]">📖 {mat.source}</span>
                    )}
                    {mat.tags?.filter(t => t !== mat.source).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">#{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {showCorpusDialog && vocabId && wordData && (
        <AddToCorpusDialog
          wordData={wordData}
          vocabId={vocabId}
          onClose={() => setShowCorpusDialog(false)}
        />
      )}
    </div>
  );
}

