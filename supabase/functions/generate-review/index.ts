import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Scene definitions ────────────────────────────────────────────────────────
const SCENE_ORDER = ["academic", "professional", "colloquial", "literary", "exam"] as const;
type Scene = typeof SCENE_ORDER[number];

const SCENE_LABELS: Record<Scene, string> = {
  academic: "🎓 高阶学术",
  professional: "📌 职场商务",
  colloquial: "💬 地道口语",
  literary: "📖 文学表达",
  exam: "✍️ 考试应试",
};

// ─── Sentence builder instruction ────────────────────────────────────────────
const SENTENCE_BUILDER_RULE = `
**重要规则 - 碎片化组句 (Sentence Builder)**：
对于所有产出型题目，还必须提供：
- sentenceFragments: 将答案句拆分为 4-8 个单词/短语卡片（数组），每张卡片是一个独立的英文词或短语单元
- **绝对禁止** 提供任何干扰词！所有卡片必须恰好且仅能组成 answer 中的完整句子，实现 100% 词汇覆盖。distractorFragments 必须为空数组 []。
- 拆分规则：按自然语言节奏拆分，拆分后所有卡片按正确顺序拼接必须完整还原 answer 句。`;

// ═══════════════════════════════════════════════════════════════════════════════
// ACADEMIC PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildAcademicBasicPrompt(word: string, wordCn: string): string {
  return `你是高阶学术英语练习生成器，面向 GRE/IELTS/专八考生。
待练习单词：${word} (${wordCn})

生成【基础认知 - 学术语义建立】单题，严格遵守以下格式：

**step1.questionType = "definition_matching"**
- step1.academicDefinition：严谨的学术英文定义（Oxford Academic 风格），约 30-50 词
- step1.options：A/B/C/D 四个中文词条，格式 ["A. 改善，改进", "B. ...", "C. ...", "D. ..."]
- step1.answer：正确选项完整字符串

**step2.questionType = "register_distinction"**
- step2.prompt："A: [学术语体句] | B: [口语语体句]"（两句均含目标词）
- step2.options：["A. 句子A是学术语体", "B. 句子B是学术语体"]
- step2.answer：正确选项完整字符串
- step2.academicRoleExplanation：目标词在学术句中的语法/修辞作用（中文，30字内）

**step3.questionType = "collocation_cloze"**
- step3.promptCn：英文句子的中文翻译
- step3.answer：完整英文句（目标词用 **加粗**）
- step3.collocationNote：搭配的学术用法说明（中文，40字内）
- step3.registerFeature：该词在学术语域的特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象（非数组）格式：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.academic}",
  "step1": { "questionType": "definition_matching", "academicDefinition": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "register_distinction", "prompt": "...", "options": [...], "answer": "...", "academicRoleExplanation": "..." },
  "step3": { "questionType": "collocation_cloze", "promptCn": "...", "answer": "...", "collocationNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildAcademicAdvancedPrompt(word: string, wordCn: string): string {
  return `你是高阶学术英语练习生成器，当前难度：进阶运用。
待练习单词：${word} (${wordCn})

生成【进阶运用 - 学术修辞掌握】单题：

**step1.questionType = "nominalization"**
- step1.verbSentence：口语化英文句子（含目标词近义/原始形式）
- step1.options：A/B/C/D 四个改写版本
- step1.answer：最地道的学术名词化版本的完整选项字符串

**step2.questionType = "hedging"**
- step2.prompt：学术语境句，hedge词位置挖空用 ___
- step2.options：A/B/C/D 四个hedge词选项
- step2.answer：正确选项完整字符串
- step2.certaintyContext：确定程度说明（中文，20字内）

**step3.questionType = "logical_connector"**
- step3.sentenceA：英文实验结论句（含目标词）
- step3.sentenceB：逻辑关联的第二结论句
- step3.promptCn：两句话的中文概括，说明逻辑关系
- step3.answer：用正确学术衔接词合并的完整长难句（目标词用 **加粗**）
- step3.connectorNote：衔接词的学术功能说明（中文，30字内）
- step3.registerFeature：该词在学术语域的特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.academic}",
  "step1": { "questionType": "nominalization", "verbSentence": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "hedging", "prompt": "...", "options": [...], "answer": "...", "certaintyContext": "..." },
  "step3": { "questionType": "logical_connector", "sentenceA": "...", "sentenceB": "...", "promptCn": "...", "answer": "...", "connectorNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildAcademicNativePrompt(word: string, wordCn: string): string {
  return `你是高阶学术英语练习生成器，面向顶刊投稿/英语母语写作水平。当前难度：母语者水平。
待练习单词：${word} (${wordCn})

生成【母语者水平 - 语篇风格对齐】单题：

**step1.questionType = "paraphrasing"**
- step1.originalAbstract：60-80词的学术摘要片段（不含目标词，但语义上需要它）
- step1.options：A/B/C/D 四个对关键句的"同义升级"改写版本
- step1.answer：正确选项完整字符串

**step2.questionType = "register_flip"**
- step2.informalText：非正式的调研/观察记录（20-40词）
- step2.prompt："选出最符合顶刊学术规范的改写版本（须包含 ${word} 或其变体）"
- step2.options：A/B/C/D 四个改写版本
- step2.answer：正确选项完整字符串
- step2.registerContrast：对比两个版本的语域差异说明（中文，40字内）

**step3.questionType = "nuance_distinction"**（选择题，无需sentenceFragments）
- step3.scenario：极端精确的学术实验/研究场景描述（中文，40-60字）
- step3.promptCn："在此场景中，用于描述...的最精准词汇是？"
- step3.options：A/B/C/D 四个英文近义词
- step3.answer：正确选项完整字符串
- step3.nuanceExplanation：解析为何其他词不适用（中文，各15字内）
- step3.registerFeature：该词在学术语域的特征（中文，50字内）

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.academic}",
  "step1": { "questionType": "paraphrasing", "originalAbstract": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "register_flip", "informalText": "...", "prompt": "...", "options": [...], "answer": "...", "registerContrast": "..." },
  "step3": { "questionType": "nuance_distinction", "scenario": "...", "promptCn": "...", "options": [...], "answer": "...", "nuanceExplanation": "...", "registerFeature": "..." }
}
只返回 JSON 对象，不要任何其他文字。`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildProfessionalBasicPrompt(word: string, wordCn: string): string {
  return `你是职场商务英语练习题生成器，面向职场精英与商务沟通场景。
待练习单词：${word} (${wordCn})

生成【基础认知 - 商务语义建立】单题：

**step1.questionType = "business_sense"**
- step1.businessContext：典型商务场景（约 20-30 词）
- step1.options：A/B/C/D 四个中文释义选项
- step1.answer：正确选项完整字符串

**step2.questionType = "email_phrasing"**
- step2.emailContext：邮件类型说明（10字内）
- step2.prompt：完整商务邮件句子，目标词挖空用 ___
- step2.options：A/B/C/D 四个选项
- step2.answer：正确选项完整字符串
- step2.phrasingNote：该表达在邮件中的标准用法（中文，30字内）

**step3.questionType = "professional_collocation"**
- step3.businessAction：该搭配对应的商务动作（10字内）
- step3.promptCn：中文商务场景句子
- step3.answer：完整英文搭配句（目标词用 **加粗**）
- step3.collocationNote：搭配的商务用法说明（中文，40字内）
- step3.registerFeature：该词在职场商务语域的特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.professional}",
  "step1": { "questionType": "business_sense", "businessContext": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "email_phrasing", "emailContext": "...", "prompt": "...", "options": [...], "answer": "...", "phrasingNote": "..." },
  "step3": { "questionType": "professional_collocation", "businessAction": "...", "promptCn": "...", "answer": "...", "collocationNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildProfessionalAdvancedPrompt(word: string, wordCn: string): string {
  return `你是职场商务英语练习题生成器，当前难度：进阶运用。
待练习单词：${word} (${wordCn})

生成【进阶运用 - 商务修辞掌握】单题：

**step1.questionType = "politeness_paraphrasing"**
- step1.directStatement：直白甚至生硬的职场句子
- step1.options：A/B/C/D 四个委婉化改写版本（选项中目标词自然嵌入，无需加粗）
- step1.answer：最恰当的委婉版本的完整选项字符串

**step2.questionType = "conflict_deescalation"**
- step2.negativeScenario：负面职场场景描述（中文，30字内）
- step2.prompt：应对该场景的句子，目标词位置挖空用 ___
- step2.options：A/B/C/D 四个选项
- step2.answer：正确选项完整字符串
- step2.deescalationNote：该词如何发挥化解冲突的作用（中文，30字内）

**step3.questionType = "scenario_response"**
- step3.situation：具体的职场对话场景（中文，20字内）
- step3.promptCn：供用户翻译的中文回应句
- step3.answer：包含目标词的标准职场英文回应（目标词用 **加粗**）
- step3.scenarioNote：该回应的职场礼仪要点（中文，40字内）
- step3.registerFeature：该词在职场商务语域的特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.professional}",
  "step1": { "questionType": "politeness_paraphrasing", "directStatement": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "conflict_deescalation", "negativeScenario": "...", "prompt": "...", "options": [...], "answer": "...", "deescalationNote": "..." },
  "step3": { "questionType": "scenario_response", "situation": "...", "promptCn": "...", "answer": "...", "scenarioNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildProfessionalNativePrompt(word: string, wordCn: string): string {
  return `你是职场商务英语练习题生成器，面向高级商务人士，当前难度：母语者水平。
待练习单词：${word} (${wordCn})

生成【母语者水平 - 谈判策略与领导力表达】单题：

**step1.questionType = "negotiation_scripting"**
- step1.negotiationContext：商务谈判场景描述（中文，30字内）
- step1.negotiationGoal：己方谈判目标（中文，20字内）
- step1.options：A/B/C/D 四个谈判话术版本（选项中目标词自然嵌入，无需加粗）
- step1.answer：最佳谈判话术的完整选项字符串
- step1.strategyNote：解析该话术的谈判策略（中文，40字内）

**step2.questionType = "visionary_leadership"**
- step2.meetingType：演讲场景（10字内）
- step2.prompt：演讲稿关键句，目标词位置挖空用 ___
- step2.options：A/B/C/D 四个词汇选项
- step2.answer：正确选项完整字符串
- step2.leadershipNote：目标词在领导力语境下的感染力来源（中文，30字内）

**step3.questionType = "idiomatic_business"**
- step3.idiomScenario：使用目标词相关商务隐喻的真实场景（中文，30字内）
- step3.informalVer：直白表达该意思的普通句子（英文）
- step3.promptCn：要求改写为含地道商务隐喻的版本（中文提示）
- step3.answer：使用地道商务隐喻的标准版本（目标词用 **加粗**）
- step3.idiomExplanation：解析隐喻的文化来源与商务含义（中文，40字内）
- step3.registerFeature：该词在职场商务语域的特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.professional}",
  "step1": { "questionType": "negotiation_scripting", "negotiationContext": "...", "negotiationGoal": "...", "options": [...], "answer": "...", "strategyNote": "..." },
  "step2": { "questionType": "visionary_leadership", "meetingType": "...", "prompt": "...", "options": [...], "answer": "...", "leadershipNote": "..." },
  "step3": { "questionType": "idiomatic_business", "idiomScenario": "...", "informalVer": "...", "promptCn": "...", "answer": "...", "idiomExplanation": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLLOQUIAL PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildColloquialBasicPrompt(word: string, wordCn: string): string {
  return `你是地道口语英语练习题生成器，面向追求影视/日常会话地道表达的学习者。
待练习单词：${word} (${wordCn})

生成【基础认知 - 口语语境识别】单题：

**step1.questionType = "context_matching"**
- step1.dialogueContext：一段 2-3 行的影视/日常对白片段（目标词以自然口语方式出现，不加粗）
- step1.options：A/B/C/D 四个中文释义，考察用户对口语语境下词义的判断
- step1.answer：正确选项完整字符串

**step2.questionType = "colloquial_cloze"**
- step2.prompt：一句地道的非正式英文句子，目标词挖空用 ___
- step2.options：A/B/C/D 四个选项（英文词或短语）
- step2.answer：正确选项完整字符串
- step2.usageNote：该词在口语中的使用场景说明（中文，30字内）

**step3.questionType = "colloquial_builder"**
- step3.promptCn：一个地道的中文口语表达（供翻译）
- step3.answer：包含目标词的地道英文口语句（目标词用 **加粗**）
- step3.colloquialNote：该表达的口语文化背景说明（中文，40字内）
- step3.registerFeature：该词在口语场景下的色彩说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.colloquial}",
  "step1": { "questionType": "context_matching", "dialogueContext": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "colloquial_cloze", "prompt": "...", "options": [...], "answer": "...", "usageNote": "..." },
  "step3": { "questionType": "colloquial_builder", "promptCn": "...", "answer": "...", "colloquialNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildColloquialAdvancedPrompt(word: string, wordCn: string): string {
  return `你是地道口语英语练习题生成器，当前难度：进阶运用。
待练习单词：${word} (${wordCn})

生成【进阶运用 - 口语语境化组句】单题：

**step1.questionType = "register_colloquial"**
- step1.directStatement：一个正式/书面的英文句子
- step1.options：A/B/C/D 四个口语化改写版本（目标词自然嵌入，无需加粗）
- step1.answer：最地道最自然的口语版本的完整选项字符串

**step2.questionType = "idiom_context"**
- step2.socialContext：社交场景描述（中文，20字内）
- step2.prompt：一句含俚语/固定搭配的对话，目标词挖空用 ___
- step2.options：A/B/C/D 四个选项
- step2.answer：正确选项完整字符串
- step2.idiomNote：该搭配的口语文化含义（中文，30字内）

**step3.questionType = "colloquial_builder"**（地道口语组句）
- step3.promptCn：地道的中文口语或社交用语（供翻译）
- step3.answer：包含目标词的最地道英文口语表达（目标词用 **加粗**，可使用缩写如 don't, it's）
- step3.colloquialNote：该表达的地道性解析（中文，40字内）
- step3.registerFeature：该词在口语场景下的使用语境（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.colloquial}",
  "step1": { "questionType": "register_colloquial", "directStatement": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "idiom_context", "socialContext": "...", "prompt": "...", "options": [...], "answer": "...", "idiomNote": "..." },
  "step3": { "questionType": "colloquial_builder", "promptCn": "...", "answer": "...", "colloquialNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildColloquialNativePrompt(word: string, wordCn: string): string {
  return `你是地道口语英语练习题生成器，当前难度：母语者水平。
待练习单词：${word} (${wordCn})

生成【母语者水平 - 文化语境深度应对】单题：

**step1.questionType = "cultural_context"**
- step1.culturalBackground：文化背景说明（中文，30字内，如"英国工薪阶层的酒吧文化"）
- step1.dialogueSnippet：包含目标词的 3-4 行地道社交对话（不加粗）
- step1.options：A/B/C/D 四个对该对话深层含义的解读（中文）
- step1.answer：最准确深刻的解读的完整选项字符串

**step2.questionType = "slang_nuance"**
- step2.prompt：一段使用俚语/隐语的英文场景句，目标词挖空用 ___
- step2.options：A/B/C/D 四个近义俚语/口语词
- step2.answer：正确选项完整字符串
- step2.connotationNote：解析为何其他选项的色彩不合适（中文，40字内）

**step3.questionType = "colloquial_builder"**
- step3.promptCn：一段极地道的中文社交表达（含文化内涵，供翻译）
- step3.answer：包含目标词的极地道英文表达（目标词用 **加粗**）
- step3.colloquialNote：该表达的文化背景与地道性解析（中文，40字内）
- step3.registerFeature：该词在母语者语境下的色彩与使用场景（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.colloquial}",
  "step1": { "questionType": "cultural_context", "culturalBackground": "...", "dialogueSnippet": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "slang_nuance", "prompt": "...", "options": [...], "answer": "...", "connotationNote": "..." },
  "step3": { "questionType": "colloquial_builder", "promptCn": "...", "answer": "...", "colloquialNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LITERARY PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildLiteraryBasicPrompt(word: string, wordCn: string): string {
  return `你是文学英语练习生成器，面向英文文学阅读、创意写作与翻译实践学习者，当前难度：基础认知。
待练习单词：${word} (${wordCn})

生成【基础认知 - 文学语感建立】单题：

**step1.questionType = "imagery_mood"**
- step1.literaryPassage：30-50词的英文文学描写（经典名著风格，目标词出现其中，不加粗）
- step1.options：A/B/C/D 四个英文文学基调形容词（如 melancholic, sublime, ominous, elegiac），格式 "A. melancholic"
- step1.answer：正确选项完整字符串
- step1.moodNote：解析该段落的情感意象与基调（中文，40字内）
**严禁在 options 中使用中文！**

**step2.questionType = "connotation_distinction"**
- step2.connotationSentence：完整的英文文学句子，关键词处用 ___ 挖空
- step2.prompt = step2.connotationSentence
- step2.options：A/B/C/D 四个英文近义词（语义相近但文学色彩各异），格式 ["A. shimmered", ...]
- step2.answer：正确选项完整字符串
- step2.connotationNote：四个词在文学语境下的细微色彩差异（中文，80字内）

**step3.questionType = "rhetorical_device"**（修辞识别选择题，严禁sentenceFragments）
- step3.rhetoricalSentence：含明确修辞手法的英文文学例句（目标词出现其中，不加粗）
- step3.promptCn：该句的中文翻译
- step3.prompt = step3.rhetoricalSentence
- step3.options：A/B/C/D 四个修辞手法，格式 ["A. Metaphor（暗喻）", "B. Simile（明喻）", "C. Personification（拟人）", "D. Alliteration（头韵）"]
- step3.answer：正确选项完整字符串
- step3.rhetoricalNote：解析修辞手法的美学效果（中文，50字内）
- step3.registerFeature：该词在文学语域的风格特征（中文，30字内）

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.literary}",
  "step1": { "questionType": "imagery_mood", "literaryPassage": "...", "options": [...], "answer": "...", "moodNote": "..." },
  "step2": { "questionType": "connotation_distinction", "connotationSentence": "...", "prompt": "...", "options": [...], "answer": "...", "connotationNote": "..." },
  "step3": { "questionType": "rhetorical_device", "rhetoricalSentence": "...", "promptCn": "...", "prompt": "...", "options": [...], "answer": "...", "rhetoricalNote": "...", "registerFeature": "..." }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildLiteraryAdvancedPrompt(word: string, wordCn: string): string {
  return `你是文学英语练习生成器，面向创意写作与文学批评学习者，当前难度：进阶运用。
待练习单词：${word} (${wordCn})

生成【进阶运用 - 描写语言掌握】单题：

**step1.questionType = "show_dont_tell"**
- step1.blandStatement：平淡直接的情感陈述句（如 "She felt melancholy"）
- step1.options：A/B/C/D 四个文学化的描写性改写句（目标词自然嵌入，严禁 **word** 加粗标注，纯文本句子）
  正确选项通过具体动作/细节/意象展示情感；其余三项为较平淡或语法欠佳版本
- step1.answer：最佳改写的完整选项字符串（无任何加粗标记）

**step2.questionType = "descriptive_builder"**
- step2.prompt：一组被打散的文学词组描述（如"词组：[...]"）
- step2.options：A/B/C/D 四个重组版本（目标词用 **加粗**）
- step2.answer：节奏最佳版本的完整选项字符串
- step2.rhythmNote：获选版本的句式节奏优势（中文，40字内）

**step3.questionType = "sensory_details"**
- step3.emotionalTheme：情感主题（中文，5字内）
- step3.promptCn：调用五感写一句含目标词的感染力描写
- step3.answer：包含目标词的参考英文句（目标词用 **加粗**）
- step3.sensoryNote：调用了哪种感官及美学效果（中文，40字内）
- step3.registerFeature：该词在文学语域的风格特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.literary}",
  "step1": { "questionType": "show_dont_tell", "blandStatement": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "descriptive_builder", "prompt": "...", "options": [...], "answer": "...", "rhythmNote": "..." },
  "step3": { "questionType": "sensory_details", "emotionalTheme": "...", "promptCn": "...", "answer": "...", "sensoryNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildLiteraryNativePrompt(word: string, wordCn: string): string {
  return `你是文学英语练习生成器，面向文学批评、创意写作的高阶学习者，当前难度：母语者水平。
待练习单词：${word} (${wordCn})

生成【母语者水平 - 大师风格与深度文本分析】单题：

**step1.questionType = "stylistic_imitation"**
- step1.authorStyle：经典作家的风格标签（英文，15字内）
- step1.styleDescription：对该风格的简要描述（中文，30字内）
- step1.options：A/B/C/D 四段模仿同一作家风格的写作，仅一段最精准体现该风格且自然融入目标词（目标词用 **加粗**）
- step1.answer：最佳风格模仿的完整选项字符串

**step2.questionType = "explication"**
- step2.literaryFragment：30-50词的高难度文学选段（包含目标词，不加粗）
- step2.prompt："请选出对以下选段中目标词及意象的最深刻解读："
- step2.options：A/B/C/D 四个解读选项（从美学效果角度深度解读）
- step2.answer：最深刻解读的完整选项字符串
- step2.aestheticNote：补充说明该解读的美学价值（中文，40字内）

**step3.questionType = "perspective_shift"**
- step3.thirdPersonPassage：30-40词的第三人称描写（含目标词，不加粗）
- step3.promptCn："将以上第三人称描写改写为第一人称内心独白，保留目标词，并深化叙事声音的情感张力"
- step3.answer：最佳第一人称改写（目标词用 **加粗**）
- step3.perspectiveNote：视角转换对叙事声音的改变（中文，40字内）
- step3.registerFeature：该词在文学语域的高阶风格特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.literary}",
  "step1": { "questionType": "stylistic_imitation", "authorStyle": "...", "styleDescription": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "explication", "literaryFragment": "...", "prompt": "...", "options": [...], "answer": "...", "aestheticNote": "..." },
  "step3": { "questionType": "perspective_shift", "thirdPersonPassage": "...", "promptCn": "...", "answer": "...", "perspectiveNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM PROMPTS (NEW)
// ═══════════════════════════════════════════════════════════════════════════════

function buildExamBasicPrompt(word: string, wordCn: string): string {
  return `你是雅思/托福/专八考试英语练习题生成器，面向备考学生。
待练习单词：${word} (${wordCn})

生成【基础认知 - 考点词同义替换】单题：

**step1.questionType = "synonym_replacement"**（雅思/托福词汇题风格）
- step1.examContext：一个典型的考试阅读/听力场景句（目标词出现，不加粗，约 30-40 词）
- step1.options：A/B/C/D 四个英文同义词选项，考察考生对该词在考试语境下的精准替换能力
  格式 ["A. improve", "B. worsen", "C. clarify", "D. exaggerate"]
- step1.answer：正确选项完整字符串
- step1.examTip：该词在考试中的高频同义词记忆技巧（中文，30字内）

**step2.questionType = "exam_cloze"**（考试填空风格）
- step2.examType：考试类型（如"雅思阅读"、"托福听力"、"专八词汇"）
- step2.prompt：一个考试真题风格的句子，目标词挖空用 ___
- step2.options：A/B/C/D 四个选项（英文词汇）
- step2.answer：正确选项完整字符串
- step2.phrasingNote：为什么其他选项不对（中文，40字内）

**step3.questionType = "exam_sentence"**（考试真题风格组句）
- step3.promptCn：雅思/托福写作/翻译风格的中文句子（供翻译）
- step3.answer：包含目标词的标准考试英文句（目标词用 **加粗**）
- step3.examNote：该句在考试写作中的模板价值（中文，30字内）
- step3.registerFeature：该词的考试考点说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.exam}",
  "step1": { "questionType": "synonym_replacement", "examContext": "...", "options": [...], "answer": "...", "examTip": "..." },
  "step2": { "questionType": "exam_cloze", "examType": "...", "prompt": "...", "options": [...], "answer": "...", "phrasingNote": "..." },
  "step3": { "questionType": "exam_sentence", "promptCn": "...", "answer": "...", "examNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildExamAdvancedPrompt(word: string, wordCn: string): string {
  return `你是雅思/托福/专八考试英语练习题生成器，当前难度：进阶运用。
待练习单词：${word} (${wordCn})

生成【进阶运用 - 逻辑衔接与考试长难句】单题：

**step1.questionType = "logical_link"**（逻辑衔接题）
- step1.contextSetup：一个学术观点或论据（英文，30-40词，不含目标词）
- step1.options：A/B/C/D 四个用目标词作为逻辑衔接词/关键词的完整句，展示如何在复杂语境中推进论点（选项中目标词自然嵌入，无需加粗）
- step1.answer：最符合逻辑且最符合学术写作规范的选项的完整字符串

**step2.questionType = "exam_cloze"**
- step2.examType："雅思写作 Task 2 / 托福 Integrated Writing"
- step2.prompt：一个考试长难句，目标词挖空用 ___
- step2.options：A/B/C/D 四个选项（注重学术语域精准度）
- step2.answer：正确选项完整字符串
- step2.phrasingNote：该词在此处的语法功能与搭配逻辑（中文，40字内）

**step3.questionType = "exam_sentence"**（考试级长难句组句）
- step3.promptCn：雅思 Task 2 / 托福写作风格的中文论据句（供翻译，需逻辑严密）
- step3.answer：包含目标词的标准学术考试英文长难句（目标词用 **加粗**）
- step3.examNote：该句式的考试分值分析（中文，30字内）
- step3.registerFeature：该词的考试高频使用场景（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.exam}",
  "step1": { "questionType": "logical_link", "contextSetup": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "exam_cloze", "examType": "...", "prompt": "...", "options": [...], "answer": "...", "phrasingNote": "..." },
  "step3": { "questionType": "exam_sentence", "promptCn": "...", "answer": "...", "examNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

function buildExamNativePrompt(word: string, wordCn: string): string {
  return `你是雅思/托福/专八/TEM-8考试英语练习题生成器，当前难度：母语者水平。
待练习单词：${word} (${wordCn})

生成【母语者水平 - 专业翻译与TEM-8实战】单题：

**step1.questionType = "tem8_translation"**（TEM-8 阅读理解级别）
- step1.complexPassage：一段 60-80 词的高难度英文段落（包含目标词，不加粗，含复杂句式与文化典故）
- step1.options：A/B/C/D 四个对该段落核心论点的中文概括，考察深度阅读理解能力
- step1.answer：最精准的中文概括的完整选项字符串

**step2.questionType = "collocational_precision"**（高级词汇精准度）
- step2.professionalContext：专业翻译/学术写作场景（中文，30字内）
- step2.prompt：一个含有目标词空格的专业英文句子（___）
- step2.options：A/B/C/D 四个近义词（语义高度相似，但专业语境精准度各异）
- step2.answer：正确选项完整字符串
- step2.precisionNote：解析细微差异与专业判断依据（中文，50字内）

**step3.questionType = "exam_sentence"**（TEM-8 汉译英实战）
- step3.promptCn：TEM-8 级别的中文句子（含文化内涵、修辞或复杂逻辑关系，供翻译）
- step3.answer：出神入化的英文译文（目标词用 **加粗**）
- step3.examNote：该译文的亮点与翻译策略（中文，40字内）
- step3.registerFeature：该词在高级翻译与考试中的独特价值（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回单个 JSON 对象：
{
  "word": "${word}",
  "wordCn": "${wordCn}",
  "scenarioLabel": "${SCENE_LABELS.exam}",
  "step1": { "questionType": "tem8_translation", "complexPassage": "...", "options": [...], "answer": "..." },
  "step2": { "questionType": "collocational_precision", "professionalContext": "...", "prompt": "...", "options": [...], "answer": "...", "precisionNote": "..." },
  "step3": { "questionType": "exam_sentence", "promptCn": "...", "answer": "...", "examNote": "...", "registerFeature": "...", "sentenceFragments": [...], "distractorFragments": [] }
}
只返回 JSON 对象，不要任何其他文字。`;
}

// ─── Select prompt builder by scene + difficulty ──────────────────────────────
function getPromptBuilder(scene: Scene, difficulty: string): (word: string, wordCn: string) => string {
  const builders: Record<Scene, Record<string, (w: string, wc: string) => string>> = {
    academic: { basic: buildAcademicBasicPrompt, advanced: buildAcademicAdvancedPrompt, native: buildAcademicNativePrompt },
    professional: { basic: buildProfessionalBasicPrompt, advanced: buildProfessionalAdvancedPrompt, native: buildProfessionalNativePrompt },
    colloquial: { basic: buildColloquialBasicPrompt, advanced: buildColloquialAdvancedPrompt, native: buildColloquialNativePrompt },
    literary: { basic: buildLiteraryBasicPrompt, advanced: buildLiteraryAdvancedPrompt, native: buildLiteraryNativePrompt },
    exam: { basic: buildExamBasicPrompt, advanced: buildExamAdvancedPrompt, native: buildExamNativePrompt },
  };
  return builders[scene]?.[difficulty] || buildExamBasicPrompt;
}

// ─── Generate a single word question via AI ───────────────────────────────────
async function generateWordQuestion(
  word: string,
  wordCn: string,
  scene: Scene,
  difficulty: string,
  apiKey: string
): Promise<any> {
  const systemPrompt = getPromptBuilder(scene, difficulty)(word, wordCn);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请为单词 "${word}" (${wordCn}) 生成题目（按上方格式）。` },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("rate_limited");
    if (status === 402) throw new Error("quota_exceeded");
    throw new Error(`ai_error_${status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  return JSON.parse(jsonStr.trim());
}

// ─── Main handler ─────────────────────────────────────────────────────────────
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

    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    const { difficulty = "advanced", wordIds } = body;

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

    // Select 5 words (one per scene)
    let selected;
    if (wordIds && wordIds.length > 0) {
      // Use provided words, cycle through them for 5 scenes
      const pool = [...vocab];
      selected = SCENE_ORDER.map((_, i) => pool[i % pool.length]);
    } else {
      const lowMastery = vocab.filter(w => w.mastery_level < 4);
      const highMastery = vocab.filter(w => w.mastery_level >= 4);
      const pool = [...lowMastery.sort(() => Math.random() - 0.5), ...highMastery.sort(() => Math.random() - 0.5)];
      // We need exactly 5 words, cycling if needed
      selected = SCENE_ORDER.map((_, i) => pool[i % Math.max(pool.length, 1)]);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Generate 5 questions in parallel — one per scene
    const questionPromises = SCENE_ORDER.map((scene, i) => {
      const vocabWord = selected[i];
      return generateWordQuestion(
        vocabWord.word,
        vocabWord.chinese_definition,
        scene,
        difficulty,
        LOVABLE_API_KEY
      ).then(q => ({
        ...q,
        word: vocabWord.word,
        wordCn: vocabWord.chinese_definition,
        vocabId: vocabWord.id,
        masteryLevel: vocabWord.mastery_level,
        scene,
        scenarioLabel: SCENE_LABELS[scene],
        isAcademic: scene === "academic",
        isProfessional: scene === "professional",
        isLiterary: scene === "literary",
        isColloquial: scene === "colloquial",
        isExam: scene === "exam",
        difficulty,
      })).catch(err => {
        console.error(`Error generating ${scene} question:`, err);
        // Return a fallback minimal structure on error
        return {
          word: vocabWord.word,
          wordCn: vocabWord.chinese_definition,
          vocabId: vocabWord.id,
          masteryLevel: vocabWord.mastery_level,
          scene,
          scenarioLabel: SCENE_LABELS[scene],
          difficulty,
          step1: { options: ["A. 加载失败，请重试"], answer: "A. 加载失败，请重试" },
          step2: { prompt: "加载失败", options: ["A. 重试"], answer: "A. 重试" },
          step3: { promptCn: "加载失败", answer: "Retry", sentenceFragments: ["Retry"], distractorFragments: [] },
        };
      });
    });

    const wordsWithIds = await Promise.all(questionPromises);

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
