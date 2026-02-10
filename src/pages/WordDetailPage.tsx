import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark, AlertTriangle, Volume2, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { mockWords } from "@/lib/mockData";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function WordDetailPage() {
  const { word: wordKey } = useParams<{ word: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState("");

  const entry = wordKey ? mockWords[wordKey.toLowerCase()] : null;

  if (!entry) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-2xl font-display text-foreground mb-2">未找到该词</p>
          <button onClick={() => navigate("/")} className="text-primary text-sm hover:underline">返回搜索</button>
        </div>
      </div>
    );
  }

  // Check related word connections
  const relatedInCorpus = wordKey?.toLowerCase() === "ameliorate"
    ? { word: "Alleviate", daysAgo: 3, similarity: "缓解/改善" }
    : null;

  const handleSave = (type: "corpus" | "difficult") => {
    toast.success(type === "corpus" ? `"${entry.word}" 已存入语料库` : `"${entry.word}" 已标记为难点`);
  };

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <motion.div variants={container} initial="hidden" animate="show">
        {/* Back + actions */}
        <motion.div variants={item} className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <div className="flex gap-2">
            <button onClick={() => handleSave("corpus")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <Bookmark className="h-3.5 w-3.5" />
              存入语料库
            </button>
            <button onClick={() => handleSave("difficult")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <AlertTriangle className="h-3.5 w-3.5" />
              标记难点
            </button>
          </div>
        </motion.div>

        {/* Word header */}
        <motion.div variants={item} className="mb-8">
          <div className="flex items-end gap-3 mb-2">
            <h1 className="text-4xl font-display font-bold text-foreground">{entry.word}</h1>
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors mb-1">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <p className="text-muted-foreground font-mono text-sm">{entry.phonetic}</p>
          <div className="flex gap-2 mt-3">
            {entry.tags.map(tag => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
            <span className={`tag-chip ${entry.difficulty === "高级" ? "!bg-accent/15 !text-accent" : ""}`}>
              {entry.difficulty}
            </span>
          </div>
        </motion.div>

        {/* Related word alert */}
        {relatedInCorpus && (
          <motion.div variants={item} className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-6">
            <p className="text-sm text-foreground">
              <span className="font-medium text-primary">💡 语料关联：</span>你 {relatedInCorpus.daysAgo} 天前存过
              <button onClick={() => navigate("/word/alleviate")} className="font-semibold text-primary hover:underline mx-1">"{relatedInCorpus.word}"</button>
              ，它们都有「{relatedInCorpus.similarity}」的意思，但用法有何不同？
            </p>
          </motion.div>
        )}

        {/* Tabs */}
        <motion.div variants={item}>
          <Tabs defaultValue="definition" className="w-full">
            <TabsList className="w-full bg-muted/50 p-1 rounded-xl mb-4">
              <TabsTrigger value="definition" className="flex-1 rounded-lg text-xs">基础释义</TabsTrigger>
              <TabsTrigger value="examples" className="flex-1 rounded-lg text-xs">应用场景</TabsTrigger>
              <TabsTrigger value="related" className="flex-1 rounded-lg text-xs">思维延展</TabsTrigger>
              <TabsTrigger value="notes" className="flex-1 rounded-lg text-xs">笔记</TabsTrigger>
            </TabsList>

            <TabsContent value="definition">
              <div className="space-y-3">
                {entry.definitions.map((def, i) => (
                  <div key={i} className="bg-card rounded-xl p-4 shadow-warm">
                    <span className="text-xs font-mono text-primary font-medium">{def.pos}</span>
                    <p className="text-sm text-foreground mt-1">{def.meaning}</p>
                    <p className="text-sm text-muted-foreground mt-1">{def.meaningCn}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="examples">
              <div className="space-y-3">
                {entry.examples.map((ex, i) => (
                  <div key={i} className="bg-card rounded-xl p-4 shadow-warm">
                    <span className="tag-chip mb-2">{ex.context}</span>
                    <p className="text-sm text-foreground mt-2 leading-relaxed">{ex.sentence}</p>
                    <p className="text-xs text-muted-foreground mt-2">{ex.translation}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="related">
              <div className="space-y-3">
                {entry.relatedWords.map((group, i) => (
                  <div key={i} className="bg-card rounded-xl p-4 shadow-warm">
                    <p className="text-xs font-medium text-muted-foreground mb-2">{group.type}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.words.map(w => {
                        const isClickable = mockWords[w.toLowerCase()];
                        return (
                          <button
                            key={w}
                            onClick={() => isClickable && navigate(`/word/${w.toLowerCase()}`)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isClickable ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-muted text-foreground"}`}
                          >
                            {w}
                            {isClickable && <ChevronRight className="inline h-3 w-3 ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notes">
              <div className="bg-card rounded-xl p-4 shadow-warm">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="记录你的学习心得、教授的讲解要点..."
                  className="w-full h-40 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => toast.success("笔记已保存")}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    保存笔记
                  </button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>
    </div>
  );
}
