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
// Q1-3: recognition (MCQ, Chinese options, choose meaning from English context)
// Q4-7: cloze (MCQ, fill the blank in English sentence)
// Q8-10: sentence builder (arrange fragments into English sentence)
type QType = "recognition" | "cloze" | "builder";

interface Q {
  qIndex: number;       // 0-9
  qType: QType;
  scene: Scene;
  scenarioLabel: string;
  // recognition fields
  contextSentence?: string;  // English sentence with word in context
  options?: string[];        // Chinese options for recognition; English for cloze
  answer?: string;           // correct option string
  // cloze fields
  clozeSentence?: string;    // sentence with ___ blank
  // builder fields
  promptCn?: string;         // Chinese sentence for translation
  builderAnswer?: string;    // full English answer sentence
  sentenceFragments?: string[];
  // extra context notes
  explanationCn?: string;    // short Chinese note shown after reveal
}

interface WordResult {
  vocabId: string;
  word: string;
  wordCn: string;
  phonetic: string | null;
  masteryLevel: number;
  questions: Q[];
}

// ─── Pick a random scene from the pool ───────────────────────────────────────
function pickScene(avoid?: Scene): Scene {
  const pool = avoid ? ALL_SCENES.filter(s => s !== avoid) : [...ALL_SCENES];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Build the mega-prompt for 10 questions ──────────────────────────────────
function buildTenQuestionPrompt(word: string, wordCn: string, difficulty: string, scenes: Scene[]): string {
  const difficultyNote = difficulty === "basic"
    ? "基础认知（辨析与识别）：语境较简单，释义直接，句子结构清晰"
    : difficulty === "advanced"
      ? "进阶运用（改写与逻辑）：语境有一定挑战性，考查语义细节与搭配"
      : "母语者水平（综合产出）：学术/文学/商务复杂语境，高难度词汇运用";

  const sceneLabels = scenes.map((s, i) => `Q${i + 1}场景：${SCENE_LABELS[s]}（${s}）`).join("\n");

  return `你是专业英语词汇练习生成器。当前单词：${word}（${wordCn}）。难度：${difficultyNote}。

请按以下规格生成 10 道练习题（按 Q1-Q10 顺序），场景分配如下：
${sceneLabels}

【题型规则】
Q1-Q3：看英选义（recognition）—— 提供一个英文语境句，4个中文含义选项，选出该词在此语境中的最准确意思
Q4-Q7：选词填空（cloze）—— 提供一个带___空白的英文句子，4个英文词/短语选项，填入最合适的答案
Q8-Q10：碎片组句（builder）—— 提供一段中文，用户需把英文碎片拼成完整句子

【通用禁令】
- 题目及选项中严禁对目标词加粗（\`**${word}**\`格式）
- 选词填空中，目标词的形式可以是原形、派生词或搭配短语
- 碎片组句：sentenceFragments 必须恰好拼出 builderAnswer，严禁干扰片段，片段数量 4-7 个

【返回格式】严格 JSON 数组，共 10 个对象：
[
  {
    "qIndex": 0,
    "qType": "recognition",
    "scene": "academic",
    "contextSentence": "The researcher's findings were intended to ameliorate conditions in urban areas.",
    "options": ["A. 加剧，恶化", "B. 改善，减轻", "C. 记录，保存", "D. 挑战，质疑"],
    "answer": "B. 改善，减轻",
    "explanationCn": "ameliorate 在学术语境中指改善或减轻不利状况"
  },
  {
    "qIndex": 3,
    "qType": "cloze",
    "scene": "professional",
    "clozeSentence": "The new policy will ___ the communication gap between departments.",
    "options": ["A. ameliorate", "B. exacerbate", "C. consolidate", "D. perpetuate"],
    "answer": "A. ameliorate",
    "explanationCn": "ameliorate 表示改善，与 communication gap 搭配自然"
  },
  {
    "qIndex": 7,
    "qType": "builder",
    "scene": "exam",
    "promptCn": "这些改革措施有效地改善了贫困地区的生活条件。",
    "builderAnswer": "These reforms effectively ameliorated living conditions in impoverished areas.",
    "sentenceFragments": ["These reforms", "effectively", "ameliorated", "living conditions", "in impoverished areas."],
    "explanationCn": "ameliorate + 名词短语：改善某方面状况，常见于正式写作"
  }
  ...（共10个）
]

仅返回 JSON 数组，不含其他文字。每个 recognition 题必须有 contextSentence + options + answer + explanationCn。每个 cloze 题必须有 clozeSentence + options + answer + explanationCn。每个 builder 题必须有 promptCn + builderAnswer + sentenceFragments + explanationCn。`;
}

// ─── Call AI to generate 10 questions for one word ───────────────────────────
async function generateTenQuestions(
  vocabId: string,
  word: string,
  wordCn: string,
  phonetic: string | null,
  masteryLevel: number,
  difficulty: string,
  apiKey: string
): Promise<WordResult> {
  // Assign 10 scenes: distribute across all 5 scenes, mix them up
  // Q1-3 recognition: 3 different scenes
  // Q4-7 cloze: 4 different scenes (cycle)
  // Q8-10 builder: 3 different scenes
  const shuffledScenes = [...ALL_SCENES].sort(() => Math.random() - 0.5);
  const scenes: Scene[] = [
    shuffledScenes[0], shuffledScenes[1], shuffledScenes[2],        // Q1-3
    shuffledScenes[3], shuffledScenes[4], shuffledScenes[0], shuffledScenes[1],  // Q4-7
    shuffledScenes[2], shuffledScenes[3], shuffledScenes[4],        // Q8-10
  ];

  const prompt = buildTenQuestionPrompt(word, wordCn, difficulty, scenes);

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

  // Enrich with scenarioLabel and ensure qType coverage
  const enriched: Q[] = questions.slice(0, 10).map((q, i) => ({
    ...q,
    qIndex: i,
    scenarioLabel: SCENE_LABELS[q.scene as Scene] || SCENE_LABELS.academic,
    scene: q.scene || scenes[i],
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
    const { difficulty = "advanced", wordIds } = body;

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

    // Generate 10 questions per word, sequentially to avoid rate limiting
    const results: WordResult[] = [];
    for (const w of selectedWords) {
      try {
        const result = await generateTenQuestions(
          w.id, w.word, w.chinese_definition, w.phonetic, w.mastery_level,
          difficulty, LOVABLE_API_KEY
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
