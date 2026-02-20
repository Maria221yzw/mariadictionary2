import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Academic question type metadata per difficulty ───────────────────────────
const ACADEMIC_STEP_META: Record<string, [string, string, string]> = {
  basic: [
    "定义辨析 / Definition Matching",
    "语域识别 / Register Distinction",
    "学术搭配填空 / Collocation Cloze",
  ],
  advanced: [
    "名词化改写 / Nominalization Task",
    "语气委婉化 / Hedging Analysis",
    "逻辑衔接重组 / Logical Connector",
  ],
  native: [
    "摘要重构 / Abstract Paraphrasing",
    "语域转换 / Register Flipping",
    "近义微观辨析 / Nuance Distinction",
  ],
};

// ─── Academic system prompts by difficulty ────────────────────────────────────

function buildAcademicBasicPrompt(wordList: string): string {
  return `你是高阶学术英语练习生成器，面向 GRE/IELTS/专八考生。以下是待练习的单词列表：
${wordList}

对每个单词生成【基础认知 - 学术语义建立】三步题，严格遵守以下格式和要求：

**第一步：学术定义辨析 (Definition Matching)**
- step1.questionType = "definition_matching"
- 在 step1.academicDefinition 中给出一段严谨的学术英文定义（参考 Oxford Academic 或 Merriam-Webster Academic 风格），约 30-50 词
- options：4 个中文词条（含正确释义 + 3 个语义相近的干扰词）
- answer：正确的中文释义

**第二步：语域辨析 (Register Distinction)**
- step2.questionType = "register_distinction"
- 给出两个含目标词的句子：sentenceA（学术语体）、sentenceB（非正式/口语语体）
- step2.prompt 中展示这两个句子并标注空白，格式："A: [句子A] | B: [句子B]"
- options：["句子A是学术语体", "句子B是学术语体"]
- answer：正确选项
- step2.academicRoleExplanation：说明目标词在学术句子中的语法/修辞作用（中文，30字内）

**第三步：学术搭配填空 (Collocation Cloze)**
- step3.questionType = "collocation_cloze"
- 给出一句来自学术论文风格的句子，目标词挖空用 ___
- step3.promptCn = 该英文句子的中文翻译（让用户理解语境）
- step3.answer = 完整英文句子（目标词用 **加粗** 标记）
- step3.collocationNote = 该搭配的学术用法说明（如 "conduct a study: conduct 在学术语境专指'实施/开展研究'"，中文，40字内）
- step3.registerFeature = 该词在学术语域的特征说明（中文，30字内，如"多用于正式书面语，位于论文引言或方法论部分"）

返回 JSON 数组，每个元素格式：
[
  {
    "word": "ameliorate",
    "wordCn": "改善，改进",
    "step1": {
      "questionType": "definition_matching",
      "academicDefinition": "To make (a bad or unsatisfactory situation) better; to improve conditions through systematic intervention. Often used in policy discourse and social science literature.",
      "options": ["改善，改进", "恶化，加剧", "阐述，陈述", "评估，衡量"],
      "answer": "改善，改进"
    },
    "step2": {
      "questionType": "register_distinction",
      "prompt": "A: The new welfare policies were designed to ameliorate chronic poverty in rural communities. | B: The new rules are meant to make things better for poor people in the countryside.",
      "options": ["句子A是学术语体", "句子B是学术语体"],
      "answer": "句子A是学术语体",
      "academicRoleExplanation": "ameliorate 在句中作不定式动词，与被动式 designed to 搭配，体现政策导向的客观性"
    },
    "step3": {
      "questionType": "collocation_cloze",
      "promptCn": "政府实施了一系列措施，旨在改善城乡之间的经济不平等状况。",
      "answer": "The government implemented a series of measures aimed at **ameliorating** socioeconomic disparities between urban and rural areas.",
      "collocationNote": "aimed at ameliorating: aimed at + 动名词，是学术英语中表达政策目标的固定框架",
      "registerFeature": "正式书面语，多见于政策分析与社会科学论文的问题陈述部分"
    }
  }
]

规则：
1. 每个单词恰好生成一组三步题
2. 学术定义须严谨，不得使用循环定义
3. step2 的两个句子内容应平行，仅语体不同
4. step3 句子须体现真实学术搭配
5. 只返回 JSON 数组，不要任何其他文字`;
}

function buildAcademicAdvancedPrompt(wordList: string): string {
  return `你是高阶学术英语练习生成器，面向 GRE/IELTS/专八考生，当前难度：进阶运用。以下是待练习的单词列表：
${wordList}

对每个单词生成【进阶运用 - 学术修辞掌握】三步题，严格遵守以下要求：

**第一步：名词化改写 (Nominalization Task)**
- step1.questionType = "nominalization"
- step1.verbSentence = 一个动词/形容词语气较强的口语化英文句子（含目标词的近义/原始形式）
- options：4个改写版本，其中一个是最地道的学术"名词化"版本
- answer：正确的名词化改写版本
- 干扰项应是同样含目标词但名词化不完整或语法有误的版本

**第二步：学术语气委婉化 (Hedging Analysis)**
- step2.questionType = "hedging"
- step2.prompt = 一段学术语境句，其中关键 hedge 词位置挖空用 ___
- options：4个 hedge 词选项（如 suggest, appear, potentially, may, seem to indicate 等）
- answer：根据语义确定程度，填入最合适的 hedge 词
- step2.certaintyContext = 解释此处确定程度（中文，20字内，如"实验数据有一定支持，但不充分"）

**第三步：逻辑衔接重组 (Logical Connector)**
- step3.questionType = "logical_connector"
- step3.sentenceA = 一个英文实验/研究结论句（含目标词）
- step3.sentenceB = 与 sentenceA 逻辑关联的第二个结论句（可以是转折/递进/因果）
- step3.promptCn = 这两句话的中文概括，说明逻辑关系
- step3.answer = 用正确学术衔接词将两句合并的完整长难句（目标词用 **加粗**）
- step3.connectorNote = 所用衔接词的学术功能说明（中文，30字内）
- step3.registerFeature = 该词在学术语域的特征说明（中文，30字内）

返回 JSON 数组格式：
[
  {
    "word": "mitigate",
    "wordCn": "减轻，缓解",
    "step1": {
      "questionType": "nominalization",
      "verbSentence": "Researchers found that the drug can make side effects less severe.",
      "options": [
        "Researchers demonstrated that the drug **mitigates** the severity of side effects.",
        "Researchers find that the drug mitigating the side effect severity.",
        "The drug has been find to mitigate the severe of side effects.",
        "Mitigation of side effects is found possible by the drug."
      ],
      "answer": "Researchers demonstrated that the drug **mitigates** the severity of side effects."
    },
    "step2": {
      "questionType": "hedging",
      "prompt": "The data ___ that extended exposure to the compound may contribute to neurological deterioration.",
      "options": ["proves", "suggests", "guarantees", "confirms"],
      "answer": "suggests",
      "certaintyContext": "数据有一定关联，但尚未建立因果关系"
    },
    "step3": {
      "questionType": "logical_connector",
      "sentenceA": "The intervention successfully **mitigated** the acute inflammatory response in test subjects.",
      "sentenceB": "Long-term efficacy remains uncertain without extended longitudinal studies.",
      "promptCn": "干预措施有效缓解了急性炎症反应，但长期效果仍需更多研究验证。（转折关系）",
      "answer": "Although the intervention successfully **mitigated** the acute inflammatory response in test subjects, long-term efficacy remains uncertain without extended longitudinal studies.",
      "connectorNote": "Although 引导让步状语从句，是学术英语中表达有限肯定+转折限制的核心框架",
      "registerFeature": "mitigate 是学术英语高频动词，常见于医学/政策论文的结果与讨论部分"
    }
  }
]

规则：
1. 名词化任务：verbSentence 须明显口语化，正确选项须体现真实学术名词化改写
2. hedging 任务：确定程度需与选项合理匹配，不能让所有选项都同等合适
3. 逻辑衔接：两个结论句须在内容上真实关联，不能是随机拼凑
4. 只返回 JSON 数组，不要任何其他文字`;
}

function buildAcademicNativePrompt(wordList: string): string {
  return `你是高阶学术英语练习生成器，面向顶刊投稿/英语母语写作水平。当前难度：母语者水平。以下是待练习的单词列表：
${wordList}

对每个单词生成【母语者水平 - 语篇风格对齐】三步题：

**第一步：摘要重构 (Abstract Paraphrasing)**
- step1.questionType = "paraphrasing"
- step1.originalAbstract = 一段 60-80 词的学术摘要片段（不含目标词，但语义上需要它）
- options：4 个对该摘要关键句的"同义升级"改写版本
- 正确答案：使用目标词且语义忠实、学术层次最高的版本
- 干扰项：语义偏移、词性错用、或用词过于口语化的版本
- answer：正确选项的完整文本

**第二步：语域转换 (Register Flipping)**
- step2.questionType = "register_flip"
- step2.informalText = 一段非正式的调研/观察记录（20-40词，包含目标词的近义口语表达）
- step2.prompt = 根据该非正式文本，选出最符合顶刊发表标准的学术改写版本（目标词必须出现）
- options：4个改写版本
- answer：最符合学术规范的版本
- step2.registerContrast = 对比两个版本的语域差异说明（中文，40字内）

**第三步：近义词微观辨析 (Nuance Distinction)**
- step3.questionType = "nuance_distinction"
- step3.scenario = 一个极端精确的学术实验/研究场景描述（中文，40-60字）
- step3.promptCn = 基于该场景，选出"唯一正确"的目标词（目标词 vs 1-2 个近义词）
- options：3-4 个英文近义词
- answer：唯一正确的词
- step3.nuanceExplanation = 解析为什么其他词不适用（每个词一条，中文，各15字内）
- step3.registerFeature = 该词在学术语域的特征说明，包含典型搭配和语篇位置（中文，50字内）

返回 JSON 数组格式：
[
  {
    "word": "scrutinize",
    "wordCn": "仔细审查，详细检查",
    "step1": {
      "questionType": "paraphrasing",
      "originalAbstract": "This study examines the regulatory frameworks governing pharmaceutical approvals in three major economies. The authors look closely at policy documents from 2010 to 2023, paying particular attention to inconsistencies in approval criteria.",
      "options": [
        "This study **scrutinizes** the regulatory frameworks governing pharmaceutical approvals across three major economies, with particular attention to inconsistencies in approval criteria during 2010–2023.",
        "This study checks the regulatory frameworks for pharmaceutical approvals in three economies, focusing on inconsistencies.",
        "The paper scrutinized pharmaceutical regulation policies in three economies between 2010 and 2023.",
        "Regulatory frameworks for drug approvals were looked at in three major countries over 13 years."
      ],
      "answer": "This study **scrutinizes** the regulatory frameworks governing pharmaceutical approvals across three major economies, with particular attention to inconsistencies in approval criteria during 2010–2023."
    },
    "step2": {
      "questionType": "register_flip",
      "informalText": "We went through all the data really carefully and found a bunch of problems with how the numbers were reported.",
      "prompt": "选出最符合顶刊学术规范的改写版本（须包含 scrutinize 或其变体）",
      "options": [
        "The research team **scrutinized** the dataset rigorously, identifying systematic discrepancies in the reported figures.",
        "The team scrutinized all the data and found a lot of reporting problems.",
        "We scrutinized the data and there were issues with how numbers were reported.",
        "All data was scrutinized and several problems with number reporting have been found."
      ],
      "answer": "The research team **scrutinized** the dataset rigorously, identifying systematic discrepancies in the reported figures.",
      "registerContrast": "非正式版用 went through / found a bunch of（口语化）；学术版用 scrutinized rigorously + identifying systematic discrepancies（被动逻辑主语+正式名词化）"
    },
    "step3": {
      "questionType": "nuance_distinction",
      "scenario": "一项元分析研究需要在方法论章节描述研究团队对23篇已发表临床试验报告的原始数据进行逐项核对与批判性审查，以识别统计报告中的系统性偏差。",
      "promptCn": "在此场景中，用于描述研究团队审查行为的最精准词汇是？",
      "options": ["examine", "scrutinize", "investigate", "review"],
      "answer": "scrutinize",
      "nuanceExplanation": "examine: 泛指检查，缺乏'批判性逐项核查'含义；investigate: 强调发现未知问题，偏向调查而非核对；review: 指综述性回顾，不强调批判性细节；scrutinize: 唯一强调逐项、批判性、高强度的仔细审查",
      "registerFeature": "scrutinize 是学术英语高强度审查动词，常见于方法论章节（'the authors scrutinized each trial report'），强调主动批判性介入，区别于 examine 的中性审视"
    }
  }
]

规则：
1. 每个步骤必须体现母语者水平的精确度，干扰项不能太明显错误
2. nuance_distinction 必须设计极端精确的场景使唯一答案清晰
3. paraphrasing 的干扰项必须在学术圈真实存在（非荒谬错误）
4. 只返回 JSON 数组，不要任何其他文字`;
}

// ─── Generic (non-academic) system prompt ────────────────────────────────────

function buildGenericPrompt(scenarioContext: string, difficultyContext: string, wordList: string): string {
  return `你是英语三阶段复习题生成器。当前练习配置：
- 场景：${scenarioContext}
- 难度：${difficultyContext}

对于每个单词，你需要生成三道递进式题目，所有题目必须严格契合以上配置的场景和难度：

**第一步：释义识别 (recognition)**
- 显示英文单词，让用户从4个中文释义中选出正确答案
- 3个干扰项应是含义相近但不同的中文释义

**第二步：语境填空 (application)**
- 给出一个契合${scenarioContext}的地道英文句子，目标单词位置用 ___ 表示
- 提供4个选项（含正确答案和3个词性/拼写相似的干扰词）
- 句子难度需符合${difficultyContext}

**第三步：汉译英 (production)**
- 给出一个中文句子（需符合${scenarioContext}的风格），用户需翻译成包含目标单词的英文句子
- 提供参考答案，并标注目标单词在句中的位置（用 **word** 加粗标记）

返回 JSON 数组：
[
  {
    "word": "ameliorate",
    "wordCn": "改善，改进",
    "step1": {
      "options": ["改善，改进", "恶化，退化", "夸大，夸张", "阐述，详述"],
      "answer": "改善，改进"
    },
    "step2": {
      "prompt": "The new policy aims to ___ living conditions in rural areas.",
      "options": ["ameliorate", "deteriorate", "exaggerate", "elaborate"],
      "answer": "ameliorate"
    },
    "step3": {
      "promptCn": "政府正在采取措施改善农村地区的医疗条件。",
      "answer": "The government is taking measures to **ameliorate** healthcare conditions in rural areas."
    }
  }
]

规则：
1. 每个单词恰好生成一组三步题
2. 干扰项必须是真实词汇/释义，难度相当
3. 句子要地道自然，严格契合指定场景风格
4. 只返回 JSON 数组，不要其他文字
5. step3 的 answer 中用 **word** 标记目标单词

单词列表：
${wordList}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未登录，请先登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "认证失败" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    const { scenario, difficulty, scenarioPrompt, difficultyPrompt, wordIds } = body;

    // Fetch vocab
    let vocabQuery = supabase
      .from("vocab_table")
      .select("id, word, chinese_definition, phonetic, mastery_level")
      .order("mastery_level", { ascending: true })
      .limit(50);

    if (wordIds && wordIds.length > 0) {
      vocabQuery = supabase
        .from("vocab_table")
        .select("id, word, chinese_definition, phonetic, mastery_level")
        .in("id", wordIds);
    }

    const { data: vocab, error: vocabError } = await vocabQuery;

    if (vocabError) {
      console.error("vocab fetch error:", vocabError);
      return new Response(JSON.stringify({ error: "获取词库失败" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!vocab || vocab.length === 0) {
      return new Response(JSON.stringify({ words: [], empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Select words
    let selected;
    if (wordIds && wordIds.length > 0) {
      selected = vocab;
    } else {
      const lowMastery = vocab.filter(w => w.mastery_level < 4);
      const highMastery = vocab.filter(w => w.mastery_level >= 4);
      const pool = [...lowMastery.sort(() => Math.random() - 0.5), ...highMastery.sort(() => Math.random() - 0.5)];
      selected = pool.slice(0, Math.min(6, pool.length));
    }

    const wordList = selected.map(w => `${w.word} (${w.chinese_definition})`).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ─── Choose prompt strategy ───────────────────────────────────────────────
    const isAcademic = scenario === "academic";
    let systemPrompt: string;
    let stepMeta: [string, string, string] | null = null;

    if (isAcademic) {
      const diff = difficulty as "basic" | "advanced" | "native";
      stepMeta = ACADEMIC_STEP_META[diff] || ACADEMIC_STEP_META.advanced;
      if (diff === "basic") {
        systemPrompt = buildAcademicBasicPrompt(wordList);
      } else if (diff === "native") {
        systemPrompt = buildAcademicNativePrompt(wordList);
      } else {
        systemPrompt = buildAcademicAdvancedPrompt(wordList);
      }
    } else {
      const scenarioContext = scenarioPrompt || "通用英语学习语境";
      const difficultyContext = difficultyPrompt || "进阶运用难度";
      systemPrompt = buildGenericPrompt(scenarioContext, difficultyContext, wordList);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: isAcademic
              ? `请为以下单词生成学术专项练习题（按上方格式）：\n${wordList}`
              : `请为以下单词生成三阶段复习题：\n${wordList}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      console.error("AI gateway error:", status);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "请求过于频繁，请稍后再试" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI 额度不足，请充值" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI 服务暂时不可用" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const words = JSON.parse(jsonStr.trim());

    // Attach vocab ids + scenario metadata
    const wordsWithIds = words.map((w: any) => {
      const match = selected.find(s => s.word.toLowerCase() === w.word.toLowerCase());
      return {
        ...w,
        vocabId: match?.id || null,
        masteryLevel: match?.mastery_level || 1,
        // Pass through the step label metadata for the frontend
        stepMeta: stepMeta || null,
        isAcademic,
        academicDifficulty: isAcademic ? difficulty : null,
      };
    });

    return new Response(JSON.stringify({ words: wordsWithIds, empty: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-review error:", e);
    return new Response(JSON.stringify({ error: "服务暂时不可用" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
