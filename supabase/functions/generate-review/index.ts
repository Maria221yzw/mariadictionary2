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

    // Fetch user's vocab, prioritize low mastery
    const { data: vocab, error: vocabError } = await supabase
      .from("vocab_table")
      .select("id, word, chinese_definition, phonetic, mastery_level")
      .order("mastery_level", { ascending: true })
      .limit(50);

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

    // Prioritize mastery_level < 4, then fill with others
    const lowMastery = vocab.filter(w => w.mastery_level < 4);
    const highMastery = vocab.filter(w => w.mastery_level >= 4);
    const pool = [...lowMastery.sort(() => Math.random() - 0.5), ...highMastery.sort(() => Math.random() - 0.5)];
    const selected = pool.slice(0, Math.min(6, pool.length));

    const wordList = selected.map(w => `${w.word} (${w.chinese_definition})`).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `你是英语三阶段复习题生成器。对于每个单词，你需要生成三道递进式题目：

**第一步：释义识别 (recognition)**
- 显示英文单词，让用户从4个中文释义中选出正确答案
- 3个干扰项应是含义相近但不同的中文释义

**第二步：语境填空 (application)**  
- 给出一个地道的英文句子，目标单词位置用 ___ 表示
- 提供4个选项（含正确答案和3个词性/拼写相似的干扰词）
- 句子要体现该词的典型搭配

**第三步：汉译英 (production)**
- 给出一个中文句子，用户需翻译成包含目标单词的英文句子
- 提供参考答案，并标注目标单词在句中的位置（用 **word** 加粗标记）

返回 JSON 数组，每个元素代表一个单词的三步题目：
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
3. 句子要地道自然，体现真实语境
4. 只返回 JSON 数组，不要其他文字
5. step3 的 answer 中用 **word** 标记目标单词`;

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
          { role: "user", content: `请为以下单词生成三阶段复习题：\n${wordList}` },
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

    // Attach vocab ids for mastery update
    const wordsWithIds = words.map((w: any) => {
      const match = selected.find(s => s.word.toLowerCase() === w.word.toLowerCase());
      return {
        ...w,
        vocabId: match?.id || null,
        masteryLevel: match?.mastery_level || 1,
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
