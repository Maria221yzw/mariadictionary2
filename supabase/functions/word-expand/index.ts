import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
  "word": "单词",
  "phonetic": "音标",
  "partOfSpeech": ["词性数组"],
  "definitions": [{"pos": "词性", "meaning": "英文释义", "meaningCn": "中文释义"}],
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
1. 例句必须地道、自然，分别体现正式文书、口语交流、学术论文三种风格
2. 近义词辨析必须具体说明语境细微差别（Nuance），不要笼统
3. 所有中文必须准确流畅
4. 只返回 JSON，不要任何其他文字`;

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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "请求过于频繁，请稍后再试" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI 额度已用尽，请充值" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI 服务暂时不可用" }), {
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
