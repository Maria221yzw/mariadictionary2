import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userTranslation, referenceSentence, chinesePrompt, targetWords } = await req.json();

    if (!userTranslation || !referenceSentence || !chinesePrompt) {
      return new Response(JSON.stringify({ error: "缺少必要参数" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `你是一位专业的英语翻译评分教师，专攻CATTI/专八翻译评分。请严格按照以下标准评分并给出反馈。

返回严格JSON格式：
{
  "score": 85,
  "level": "良好",
  "dimensions": [
    {"name": "语义准确度", "score": 20, "max": 30, "comment": "简短评价"},
    {"name": "目标词汇使用", "score": 25, "max": 30, "comment": "简短评价"},
    {"name": "语法与句式", "score": 20, "max": 20, "comment": "简短评价"},
    {"name": "表达地道性", "score": 20, "max": 20, "comment": "简短评价"}
  ],
  "highlights": ["做得好的点1", "做得好的点2"],
  "improvements": ["改进建议1", "改进建议2"],
  "correctedVersion": "如果用户的翻译有明显错误，给出修正版本；如果基本正确则返回空字符串"
}

评分标准：
- 语义准确度(30分)：译文是否忠实传达中文原意，有无遗漏或曲解
- 目标词汇使用(30分)：是否正确使用了指定的目标词汇，词形变化是否正确
- 语法与句式(20分)：语法是否正确，句式是否通顺
- 表达地道性(20分)：是否符合英语表达习惯，用词是否地道

level 对应：90-100优秀，75-89良好，60-74及格，60以下需加强

规则：
1. 只返回JSON，不要其他文字
2. 评价用中文，简洁有针对性
3. improvements 最多3条，每条不超过30字
4. 如果用户完全没有使用目标词汇，目标词汇使用得分应为0`;

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
            content: `中文原句：${chinesePrompt}\n目标词汇：${(targetWords || []).join(", ")}\n参考译文：${referenceSentence}\n用户译文：${userTranslation}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
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
      return new Response(JSON.stringify({ error: "AI 服务暂时不可用" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const result = JSON.parse(jsonStr.trim());

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-translation error:", e);
    return new Response(JSON.stringify({ error: "评分服务暂时不可用" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
