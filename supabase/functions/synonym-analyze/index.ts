import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { action, words, allWords } = await req.json();

    let prompt = "";
    if (action === "recommend") {
      // Given a target word, recommend synonyms from allWords list
      prompt = `你是一个英语词汇专家。用户的词汇库中有以下单词：${allWords.join(", ")}

用户想为单词「${words[0]}」寻找近义词/关联词。

请从词汇库中找出与「${words[0]}」语义相近或相关的词汇，如果词汇库中没有合适的词，也可以推荐不在库中的常见近义词。

返回JSON格式（不要markdown代码块）：
{
  "fromLibrary": ["库中找到的近义词"],
  "suggested": ["推荐的不在库中的近义词"],
  "clusterName": "这组词的中文概括名称（如'减少/下降'）"
}`;
    } else if (action === "compare") {
      // Generate nuance comparison for a group of words
      prompt = `你是一个英语词汇辨析专家。请对以下近义词组进行微观辨析：

词组：${words.join(", ")}

请返回JSON格式（不要markdown代码块）：
{
  "clusterName": "这组词的中文概括（如'减少/下降'）",
  "words": [
    {
      "word": "单词",
      "semanticFocus": "语义重心（中文简述）",
      "register": "语域：Academic/Formal/Neutral/Informal",
      "commonCollocations": ["高频搭配1", "高频搭配2", "高频搭配3"],
      "exampleEn": "一个典型英文例句",
      "exampleZh": "对应中文翻译"
    }
  ],
  "sharedMeaning": "这组词的共同语义核心（中文）",
  "keyDifferences": [
    "差异点1（中文简述）",
    "差异点2",
    "差异点3"
  ],
  "nonInterchangeable": [
    {
      "context": "在某个语境下",
      "correct": "应该用的词",
      "wrong": "不能用的词",
      "reason": "原因"
    }
  ]
}`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          { role: "system", content: "你是英语词汇辨析专家。只返回纯JSON，不要包裹在代码块中。" },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "请求过于频繁，请稍后再试" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI服务异常" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const parsed = JSON.parse(content);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("synonym-analyze error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
