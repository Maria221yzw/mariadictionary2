import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate user
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
      return new Response(JSON.stringify({ error: "认证失败，请重新登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { word } = await req.json();
    if (!word || typeof word !== "string" || word.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid word" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `你是一位专业的英语语言学家和词典编纂者。用户会给你一个英文单词，请你返回以下 JSON 结构（所有解释性文字用中文，例句保持英文并配中文翻译）：

{
  "word": "单词原形",
  "phonetic": "音标",
  "coreDefinition": "该词最核心、最常用的中文释义（简洁精准，10字以内）",
  "partOfSpeech": ["词性数组"],
  "definitions": [{"pos": "词性", "meaning": "英文释义", "meaningCn": "中文释义"}],
  "wordForms": [
    {
      "word": "该词形（如 succeed）",
      "pos": "词性（如 v.）",
      "phonetic": "该词形的音标",
      "meaningCn": "该词性下的中文释义",
      "morphologies": [
        {"type": "past tense", "typeCn": "过去式", "form": "succeeded"},
        {"type": "present participle", "typeCn": "现在分词", "form": "succeeding"},
        {"type": "third person singular", "typeCn": "第三人称单数", "form": "succeeds"}
      ],
      "example": {"sentence": "英文例句", "translation": "中文翻译"}
    }
  ],
  "phrases": [
    {"phrase": "come across", "meaningCn": "偶然遇见；被理解"},
    {"phrase": "come up with", "meaningCn": "想出；提出"}
  ],
  "etymology": [
    {"root": "duct (拉丁语 ducere)", "meaning": "引导、带领", "relatedWords": ["conduct", "deduce", "introduce", "produce"]}
  ],
  "examples": [
    {"context": "正式文书风格", "sentence": "英文例句", "translation": "中文翻译"},
    {"context": "口语交流风格", "sentence": "英文例句", "translation": "中文翻译"},
    {"context": "学术论文风格", "sentence": "英文例句", "translation": "中文翻译"}
  ],
  "relatedWords": [
    {"type": "近义词", "words": ["词1","词2","词3"]},
    {"type": "反义词", "words": ["词1","词2"]},
    {"type": "形近词", "words": ["词1","词2"]}
  ],
  "synonymComparison": [
    {"word": "近义词1", "nuance": "语境差别说明（中文）", "exampleDiff": "用法差异举例（中文）"},
    {"word": "近义词2", "nuance": "语境差别说明（中文）", "exampleDiff": "用法差异举例（中文）"}
  ],
  "suggestedTags": ["建议标签1", "建议标签2"],
  "difficulty": "基础/进阶/高级"
}

重要规则：
1. wordForms 必须覆盖该词的所有常见词性变化形式（名词、动词、形容词、副词等），每种词性都要有独立条目
2. 每个 wordForm 条目必须包含该词形的所有词汇变形（复数、过去式、现在分词、比较级等），并附带中文标注
3. 每个 wordForm 条目必须配有一个地道的英文例句及中文翻译
4. coreDefinition 必须是最精准的中文核心释义，简洁有力
5. 例句必须地道、自然，分别体现正式文书、口语交流、学术论文三种风格
6. 近义词辨析必须具体说明语境细微差别（Nuance），不要笼统
7. 所有中文必须准确流畅
8. phrases 必须列出该单词15-20个最地道、最常用的词组、固定搭配和习惯用语，每个配中文释义，尽可能全面覆盖
9. etymology 必须列出该单词的词根词缀信息，包括词根的语源（如拉丁语、希腊语）、含义，以及3-5个同根词
10. 只返回 JSON，不要任何其他文字`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: word },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ error: "服务暂时不可用，请稍后重试" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Extract JSON from content (may be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    
    const parsed = JSON.parse(jsonStr.trim());

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("word-expand error:", e);
    return new Response(JSON.stringify({ error: "服务暂时不可用，请稍后重试" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
