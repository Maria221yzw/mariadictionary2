import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Fetch user's vocab
    const { data: vocab, error: vocabError } = await supabase
      .from("vocab_table")
      .select("word, chinese_definition, phonetic")
      .limit(50);

    if (vocabError) {
      console.error("vocab fetch error:", vocabError);
      return new Response(JSON.stringify({ error: "获取词库失败" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!vocab || vocab.length === 0) {
      return new Response(JSON.stringify({ questions: [], empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick up to 6 random words
    const shuffled = [...vocab].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(6, shuffled.length));

    const wordList = selected.map(w => `${w.word} (${w.chinese_definition})`).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `你是英语练习题生成器。根据用户提供的单词列表，为每个单词生成一道练习题。

题目类型交替使用：
- fill-blank（选词填空）：给出一个英文句子，其中正确答案的位置用 ___ 表示。提供4个选项（含正确答案和3个同难度干扰项）。
- translate（场景翻译）：给出一个中文句子，要求用户翻译成英文，翻译中需用到该单词。提供参考答案。

返回 JSON 数组，格式：
[
  {
    "type": "fill-blank",
    "prompt": "The policy aims to ___ the crisis.",
    "answer": "ameliorate",
    "options": ["ameliorate", "deteriorate", "exaggerate", "elaborate"],
    "relatedWord": "Ameliorate"
  },
  {
    "type": "translate",
    "prompt": "请翻译：社区项目有助于缓解城市贫困。",
    "answer": "Community programs help alleviate urban poverty.",
    "relatedWord": "Alleviate"
  }
]

规则：
1. 每个单词恰好生成一道题
2. fill-blank 和 translate 交替出现
3. 干扰项必须是真实英文单词，且词性与正确答案一致
4. 句子要地道自然
5. 只返回 JSON 数组，不要其他文字`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `请为以下单词生成练习题：\n${wordList}` },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ error: "AI 服务暂时不可用" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const questions = JSON.parse(jsonStr.trim());

    // Add ids
    const withIds = questions.map((q: Record<string, unknown>, i: number) => ({
      ...q,
      id: `r${i + 1}`,
    }));

    return new Response(JSON.stringify({ questions: withIds, empty: false }), {
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
