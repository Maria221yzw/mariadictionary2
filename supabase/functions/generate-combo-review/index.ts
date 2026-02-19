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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "认证失败" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { words } = await req.json();
    if (!words || !Array.isArray(words) || words.length < 2) {
      return new Response(JSON.stringify({ error: "请至少选择2个单词" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wordList = words.map((w: any) => `${w.word} (${w.chinese_definition})`).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `你是一个高级英语组合记忆练习生成器，专为雅思/专八考生设计。用户会提供一组 2-5 个单词，你需要生成四类题目和一份总结。

所有返回必须为严格 JSON，格式如下：

{
  "narrativeCloze": {
    "passage": "一段50-100词的连贯英文短文（新闻/学术/商务风格），目标词位置用 (1), (2), (3)... 标记",
    "blanks": ["word1", "word2", "word3"],
    "distractors": ["distractor1", "distractor2"]
  },
  "nuanceQuestions": [
    {
      "sentenceA": "一个英文句子，空格用___标记",
      "sentenceB": "另一个英文句子，空格用___标记",
      "wordA": "适合句子A的词",
      "wordB": "适合句子B的词",
      "explanationA": "为什么wordA更适合A（中文，20字内）",
      "explanationB": "为什么wordB更适合B（中文，20字内）"
    }
  ],
  "collocationQuestions": [
    {
      "word": "目标单词",
      "correctPrep": "正确的介词/搭配词",
      "options": ["to", "with", "for", "into"],
      "exampleSentence": "包含正确搭配的例句"
    }
  ],
  "synthesisQuestions": [
    {
      "targetWords": ["word1", "word2"],
      "chineseSentences": ["中文简单句1", "中文简单句2"],
      "referenceSentence": "使用目标词将两句合并后的英文长难句参考答案",
      "hint": "简短的中文提示，引导用户如何合并（15字内）"
    }
  ],
  "summary": {
    "relationship": "这组词的逻辑关系类型（如：因果关系、对比关系、同类主题等）",
    "explanation": "50-80字的中文解析，说明这几个词之间的语义网络和记忆联系"
  }
}

规则：
1. narrativeCloze: 短文需自然流畅，blanks 按出现顺序列出，distractors 增加2个同难度干扰词
2. nuanceQuestions: 只在有近义词对时生成，最多2题。如无近义词可返回空数组
3. collocationQuestions: 每个选定单词生成一道搭配题，options包含4个选项
4. synthesisQuestions: 从选定单词中取2个词为一组，生成1-2道句子合并题。给出两个简短中文句子，要求用户使用指定的两个英文单词合并重写为一个高级长难句。referenceSentence必须自然地包含这两个目标词
5. summary: 必须提供，分析词汇间的逻辑联系
6. 只返回JSON，不要任何其他文字`;

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
          { role: "user", content: `请为以下单词组合生成组合记忆练习题：\n${wordList}` },
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

    const questions = JSON.parse(jsonStr.trim());

    return new Response(JSON.stringify(questions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-combo-review error:", e);
    return new Response(JSON.stringify({ error: "服务暂时不可用" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
