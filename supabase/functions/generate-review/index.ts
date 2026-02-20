import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Scene pool ───────────────────────────────────────────────────────────────
const ALL_SCENES = ["academic", "professional", "colloquial", "literary", "exam"] as const;
type Scene = typeof ALL_SCENES[number];

const SCENE_LABELS: Record<Scene, string> = {
  academic:     "🎓 高阶学术",
  professional: "📌 职场商务",
  colloquial:   "💬 地道口语",
  literary:     "📖 文学表达",
  exam:         "✍️ 考试应试",
};

// ─── 10-question sequence: type metadata ─────────────────────────────────────
type QType = "recognition" | "cloze" | "builder" | "error_correction" | "register_matching" | "synonym_nuance" | "definition_matching" | "translation";

interface Q {
  qIndex: number;
  qType: QType;
  scene: Scene;
  scenarioLabel: string;
  // recognition / cloze / error_correction / register_matching / synonym_nuance / definition_matching fields
  contextSentence?: string;
  options?: string[];
  answer?: string;
  // cloze
  clozeSentence?: string;
  // error_correction
  errorSentence?: string;      // sentence with intentional error
  // register_matching
  informalSentence?: string;   // the informal/colloquial sentence to rewrite
  targetRegister?: string;     // "学术正式" | "职场商务"
  // synonym_nuance
  synonymContext?: string;     // precise context sentence (blank)
  synonymPool?: string[];      // 4 near-synonyms
  // definition_matching
  englishDefinition?: string;  // English dictionary definition
  // translation (full sentence free-writing)
  chinesePrompt?: string;      // Chinese sentence shown to user
  translationAnswer?: string;  // Reference English sentence
  // builder fields
  promptCn?: string;
  builderAnswer?: string;
  sentenceFragments?: string[];
  // extra context notes
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

// ─── TypeConfig from frontend ────────────────────────────────────────────────
interface TypeConfig {
  enabled: boolean;
  count: number;
}

// ─── Build the mega-prompt based on typeConfig ───────────────────────────────
function buildCustomPrompt(word: string, wordCn: string, difficulty: string, typeConfig: Record<string, TypeConfig>): string {
  const difficultyNote = difficulty === "basic"
    ? "基础认知（辨析与识别）：语境较简单，释义直接，句子结构清晰"
    : difficulty === "advanced"
      ? "进阶运用（改写与逻辑）：语境有一定挑战性，考查语义细节与搭配"
      : "母语者水平（综合产出）：学术/文学/商务复杂语境，高难度词汇运用";

  // Build question specs list
  const specs: string[] = [];
  let qIdx = 0;

  const addSpec = (type: string, count: number, spec: string) => {
    for (let i = 0; i < count; i++) {
      specs.push(`Q${qIdx + 1}（${type}）：${spec}`);
      qIdx++;
    }
  };

  if (typeConfig.recognition?.enabled) {
    addSpec("recognition", typeConfig.recognition.count,
      "看英选义 —— 提供一个英文语境句，4个中文含义选项，选出该词在此语境中的最准确意思");
  }
  if (typeConfig.cloze?.enabled) {
    addSpec("cloze", typeConfig.cloze.count,
      "选词填空 —— 提供一个带___空白的英文句子，4个英文词/短语选项，填入最合适的答案");
  }
  if (typeConfig.builder?.enabled) {
    addSpec("builder", typeConfig.builder.count,
      "碎片组句 —— 提供一段中文，用户需把英文碎片拼成完整句子（4-7个碎片，严禁干扰片段）");
  }
  if (typeConfig.error_correction?.enabled) {
    addSpec("error_correction", typeConfig.error_correction.count,
      "语篇纠错 —— 提供一个含目标词的英文句子，但在搭配、语序或语域上故意制造一个错误。4选1，选出最正确的改错方案");
  }
  if (typeConfig.register_matching?.enabled) {
    addSpec("register_matching", typeConfig.register_matching.count,
      "语域风格对齐 —— 给出一个非正式的口语表达，要求用目标词将其改写为指定正式度等级（学术正式 或 职场商务）。4选1，选出最符合目标语域的句子");
  }
  if (typeConfig.synonym_nuance?.enabled) {
    addSpec("synonym_nuance", typeConfig.synonym_nuance.count,
      "近义词辨析 —— 设定一个极端精确的学术或文学语境，给出4个近义词。任务：选出在当前语境下最地道、最不可替代的那个词");
  }
  if (typeConfig.definition_matching?.enabled) {
    addSpec("definition_matching", typeConfig.definition_matching.count,
      "英文释义配对 —— 提供目标词的纯英文学术定义（来自Oxford或Merriam-Webster风格）。4选1，选出与该英文释义完全匹配的单词");
  }
  if (typeConfig.translation?.enabled) {
    addSpec("translation", typeConfig.translation.count,
      "全句翻译拼写 —— 提供一个包含目标词中文意思的中文句子（chinesePrompt）。学习者需自由输入完整英文译句。提供地道的参考译文（translationAnswer）。严禁显示任何英文提示");
  }

  if (specs.length === 0) {
    // Fallback: 3 recognition + 4 cloze + 3 builder
    addSpec("recognition", 3, "看英选义");
    addSpec("cloze", 4, "选词填空");
    addSpec("builder", 3, "碎片组句");
  }

  const totalQ = qIdx;

  return `你是专业英语词汇练习生成器。当前单词：${word}（${wordCn}）。难度：${difficultyNote}。

请按以下规格生成 ${totalQ} 道练习题：
${specs.join("\n")}

【通用禁令】
- 题目及选项中严禁对目标词加粗（\`**${word}**\`格式）
- 选词填空中，目标词的形式可以是原形、派生词或搭配短语
- 碎片组句：sentenceFragments 必须恰好拼出 builderAnswer，严禁干扰片段，片段数量 4-7 个
- 场景需覆盖多样（academic, professional, colloquial, literary, exam 中随机选取）

【返回格式】严格 JSON 数组，共 ${totalQ} 个对象，每个对象包含：
- qIndex (0-based)
- qType ("recognition"|"cloze"|"builder"|"error_correction"|"register_matching"|"synonym_nuance"|"definition_matching")
- scene ("academic"|"professional"|"colloquial"|"literary"|"exam")
- 对应题型的字段：
  recognition: contextSentence, options (4个中文), answer, explanationCn
  cloze: clozeSentence(含___), options (4个英文), answer, explanationCn
  builder: promptCn, builderAnswer, sentenceFragments, explanationCn
  error_correction: errorSentence, options (4个英文修正方案), answer, explanationCn
  register_matching: informalSentence, targetRegister, options (4个英文句子), answer, explanationCn
  synonym_nuance: synonymContext(含___), synonymPool (4个英文近义词), options(4个如"A. alter"), answer, explanationCn
  definition_matching: englishDefinition, options (4个英文词), answer, explanationCn
  translation: chinesePrompt(中文原句，含目标词中文意思), translationAnswer(地道英文参考译文), explanationCn

仅返回 JSON 数组，不含其他文字。`;
}

// ─── Call AI to generate questions for one word ───────────────────────────────
async function generateQuestions(
  vocabId: string,
  word: string,
  wordCn: string,
  phonetic: string | null,
  masteryLevel: number,
  difficulty: string,
  typeConfig: Record<string, TypeConfig>,
  apiKey: string
): Promise<WordResult> {
  const prompt = buildCustomPrompt(word, wordCn, difficulty, typeConfig);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "你是专业英语词汇练习生成器。严格按照用户指定的 JSON 格式返回内容，不要任何额外解释。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "[]";

  let jsonStr = content.trim();
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let questions: Q[];
  try {
    const parsed = JSON.parse(jsonStr);
    questions = Array.isArray(parsed) ? parsed : [];
  } catch {
    questions = [];
  }

  // Enrich with scenarioLabel
  const enriched: Q[] = questions.map((q, i) => ({
    ...q,
    qIndex: i,
    scenarioLabel: SCENE_LABELS[q.scene as Scene] || SCENE_LABELS.academic,
    scene: q.scene || ALL_SCENES[i % ALL_SCENES.length],
  }));

  return {
    vocabId,
    word,
    wordCn,
    phonetic,
    masteryLevel,
    questions: enriched,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "认证失败" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    const { difficulty = "advanced", wordIds, typeConfig } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch vocab
    let vocabQuery = supabase
      .from("vocab_table")
      .select("id, word, chinese_definition, phonetic, mastery_level")
      .eq("user_id", user.id)
      .limit(50);

    if (wordIds && wordIds.length > 0) {
      vocabQuery = supabase
        .from("vocab_table")
        .select("id, word, chinese_definition, phonetic, mastery_level")
        .in("id", wordIds);
    }

    const { data: vocab, error: vocabError } = await vocabQuery;
    if (vocabError) throw vocabError;
    if (!vocab || vocab.length === 0) {
      return new Response(JSON.stringify({ empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Select words to practice — when wordIds provided, use those; otherwise pick low mastery
    let selectedWords: typeof vocab;
    if (wordIds && wordIds.length > 0) {
      selectedWords = vocab;
    } else {
      const low = vocab.filter(w => w.mastery_level < 4).sort(() => Math.random() - 0.5);
      const high = vocab.filter(w => w.mastery_level >= 4).sort(() => Math.random() - 0.5);
      const pool = [...low, ...high];
      // Default: up to 3 words when none selected
      selectedWords = pool.slice(0, 3);
    }

    if (selectedWords.length === 0) {
      return new Response(JSON.stringify({ empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default typeConfig if not provided (legacy: 3 recognition + 4 cloze + 3 builder)
    const resolvedTypeConfig: Record<string, TypeConfig> = typeConfig || {
      recognition: { enabled: true, count: 3 },
      cloze: { enabled: true, count: 4 },
      builder: { enabled: true, count: 3 },
    };

    // Generate questions per word, sequentially to avoid rate limiting
    const results: WordResult[] = [];
    for (const w of selectedWords) {
      try {
        const result = await generateQuestions(
          w.id, w.word, w.chinese_definition, w.phonetic, w.mastery_level,
          difficulty, resolvedTypeConfig, LOVABLE_API_KEY
        );
        results.push(result);
      } catch (e) {
        console.error(`Failed to generate for word ${w.word}:`, e);
        // Skip failed words rather than failing the whole request
      }
    }

    if (results.length === 0) {
      return new Response(JSON.stringify({ error: "生成练习题失败，请重试" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ words: results, empty: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("generate-review error:", e);
    const status = e?.status || 500;
    if (status === 429) {
      return new Response(JSON.stringify({ error: "请求过于频繁，请稍后再试" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (status === 402) {
      return new Response(JSON.stringify({ error: "AI 额度不足" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "服务暂时不可用" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
