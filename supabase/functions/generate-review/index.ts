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

// ─── Sentence builder instruction (appended to step 3 in all prompts) ──────────
const SENTENCE_BUILDER_RULE = `
**重要规则 - 碎片化组句 (Sentence Builder)**：
对于所有产出型题目（step3），除了提供 answer 完整句外，还必须提供：
- step3.sentenceFragments: 将答案句拆分为 4-8 个单词/短语卡片（数组），每张卡片是一个独立的英文词或短语单元
- **绝对禁止** 提供任何干扰词！所有卡片必须恰好且仅能组成 answer 中的完整句子，实现 100% 词汇覆盖。不要设置 distractorFragments 字段（或设为空数组 []）。
- 拆分规则：按自然语言节奏拆分，如 ["The government", "implemented", "a series of measures", "aimed at", "ameliorating", "socioeconomic disparities", "between urban", "and rural areas"]
- 拆分后所有卡片拼接（按正确顺序）必须完整还原 answer 句，无多余词、无遗漏词。`;

// ─── Academic system prompts by difficulty ────────────────────────────────────

function buildAcademicBasicPrompt(wordList: string): string {
  return `你是高阶学术英语练习生成器，面向 GRE/IELTS/专八考生。以下是待练习的单词列表：
${wordList}

对每个单词生成【基础认知 - 学术语义建立】三步题，严格遵守以下格式和要求：

**第一步：学术定义辨析 (Definition Matching)**
- step1.questionType = "definition_matching"
- 在 step1.academicDefinition 中给出一段严谨的学术英文定义（参考 Oxford Academic 或 Merriam-Webster Academic 风格），约 30-50 词
- options：A, B, C, D 四个中文词条（含正确释义 + 3 个语义相近的干扰词），格式为 ["A. 改善，改进", "B. 恶化，加剧", "C. 阐述，陈述", "D. 评估，衡量"]
- answer：正确选项的完整字符串（如 "A. 改善，改进"）

**第二步：语域辨析 (Register Distinction)**
- step2.questionType = "register_distinction"
- 给出两个含目标词的句子：sentenceA（学术语体）、sentenceB（非正式/口语语体）
- step2.prompt 中展示这两个句子，格式："A: [句子A] | B: [句子B]"
- options：["A. 句子A是学术语体", "B. 句子B是学术语体"]
- answer：正确选项的完整字符串
- step2.academicRoleExplanation：说明目标词在学术句子中的语法/修辞作用（中文，30字内）

**第三步：学术搭配填空 (Collocation Cloze)**
- step3.questionType = "collocation_cloze"
- 给出一句来自学术论文风格的句子，目标词挖空用 ___
- step3.promptCn = 该英文句子的中文翻译（让用户理解语境）
- step3.answer = 完整英文句子（目标词用 **加粗** 标记）
- step3.collocationNote = 该搭配的学术用法说明（中文，40字内）
- step3.registerFeature = 该词在学术语域的特征说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组，每个元素格式：
[
  {
    "word": "ameliorate",
    "wordCn": "改善，改进",
    "step1": {
      "questionType": "definition_matching",
      "academicDefinition": "To make (a bad or unsatisfactory situation) better; to improve conditions through systematic intervention. Often used in policy discourse and social science literature.",
      "options": ["A. 改善，改进", "B. 恶化，加剧", "C. 阐述，陈述", "D. 评估，衡量"],
      "answer": "A. 改善，改进"
    },
    "step2": {
      "questionType": "register_distinction",
      "prompt": "A: The new welfare policies were designed to ameliorate chronic poverty in rural communities. | B: The new rules are meant to make things better for poor people in the countryside.",
      "options": ["A. 句子A是学术语体", "B. 句子B是学术语体"],
      "answer": "A. 句子A是学术语体",
      "academicRoleExplanation": "ameliorate 在句中作不定式动词，与被动式 designed to 搭配，体现政策导向的客观性"
    },
    "step3": {
      "questionType": "collocation_cloze",
      "promptCn": "政府实施了一系列措施，旨在改善城乡之间的经济不平等状况。",
      "answer": "The government implemented a series of measures aimed at **ameliorating** socioeconomic disparities between urban and rural areas.",
      "collocationNote": "aimed at ameliorating: aimed at + 动名词，是学术英语中表达政策目标的固定框架",
      "registerFeature": "正式书面语，多见于政策分析与社会科学论文的问题陈述部分",
      "sentenceFragments": ["The government", "implemented", "a series of measures", "aimed at", "ameliorating", "socioeconomic disparities", "between urban", "and rural areas"],
      "distractorFragments": []
    }
  }
]

规则：
1. 每个单词恰好生成一组三步题
2. 学术定义须严谨，不得使用循环定义
3. step1 options 必须是 A/B/C/D 四选项格式
4. step2 options 必须是 A/B 两选项格式（对应两句话）
5. step3 句子须体现真实学术搭配，sentenceFragments 必须恰好且完整地覆盖 answer 句，distractorFragments 必须为空数组 []
6. 只返回 JSON 数组，不要任何其他文字`;
}

function buildAcademicAdvancedPrompt(wordList: string): string {
  return `你是高阶学术英语练习生成器，面向 GRE/IELTS/专八考生，当前难度：进阶运用。以下是待练习的单词列表：
${wordList}

对每个单词生成【进阶运用 - 学术修辞掌握】三步题，严格遵守以下要求：

**第一步：名词化改写 (Nominalization Task)**
- step1.questionType = "nominalization"
- step1.verbSentence = 一个动词/形容词语气较强的口语化英文句子（含目标词的近义/原始形式）
- options：A, B, C, D 四个改写版本格式为 ["A. 版本1", "B. 版本2", "C. 版本3", "D. 版本4"]，其中一个是最地道的学术"名词化"版本
- answer：正确选项的完整字符串（如 "A. Researchers demonstrated..."）

**第二步：学术语气委婉化 (Hedging Analysis)**
- step2.questionType = "hedging"
- step2.prompt = 一段学术语境句，其中关键 hedge 词位置挖空用 ___
- options：A, B, C, D 四个 hedge 词选项格式为 ["A. suggests", "B. proves", "C. guarantees", "D. confirms"]
- answer：正确选项的完整字符串（如 "A. suggests"）
- step2.certaintyContext = 解释此处确定程度（中文，20字内）

**第三步：逻辑衔接重组 (Logical Connector)**
- step3.questionType = "logical_connector"
- step3.sentenceA = 一个英文实验/研究结论句（含目标词）
- step3.sentenceB = 与 sentenceA 逻辑关联的第二个结论句
- step3.promptCn = 这两句话的中文概括，说明逻辑关系
- step3.answer = 用正确学术衔接词将两句合并的完整长难句（目标词用 **加粗**）
- step3.connectorNote = 所用衔接词的学术功能说明（中文，30字内）
- step3.registerFeature = 该词在学术语域的特征说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组格式：
[
  {
    "word": "mitigate",
    "wordCn": "减轻，缓解",
    "step1": {
      "questionType": "nominalization",
      "verbSentence": "Researchers found that the drug can make side effects less severe.",
      "options": [
        "A. Researchers demonstrated that the drug **mitigates** the severity of side effects.",
        "B. Researchers find that the drug mitigating the side effect severity.",
        "C. The drug has been find to mitigate the severe of side effects.",
        "D. Mitigation of side effects is found possible by the drug."
      ],
      "answer": "A. Researchers demonstrated that the drug **mitigates** the severity of side effects."
    },
    "step2": {
      "questionType": "hedging",
      "prompt": "The data ___ that extended exposure to the compound may contribute to neurological deterioration.",
      "options": ["A. suggests", "B. proves", "C. guarantees", "D. confirms"],
      "answer": "A. suggests",
      "certaintyContext": "数据有一定关联，但尚未建立因果关系"
    },
    "step3": {
      "questionType": "logical_connector",
      "sentenceA": "The intervention successfully **mitigated** the acute inflammatory response in test subjects.",
      "sentenceB": "Long-term efficacy remains uncertain without extended longitudinal studies.",
      "promptCn": "干预措施有效缓解了急性炎症反应，但长期效果仍需更多研究验证。（转折关系）",
      "answer": "Although the intervention successfully **mitigated** the acute inflammatory response in test subjects, long-term efficacy remains uncertain without extended longitudinal studies.",
      "connectorNote": "Although 引导让步状语从句，是学术英语中表达有限肯定+转折限制的核心框架",
      "registerFeature": "mitigate 是学术英语高频动词，常见于医学/政策论文的结果与讨论部分",
      "sentenceFragments": ["Although", "the intervention", "successfully mitigated", "the acute inflammatory response", "in test subjects,", "long-term efficacy", "remains uncertain", "without extended longitudinal studies"],
      "distractorFragments": []
    }
  }
]

规则：
1. step1 options 必须是 A/B/C/D 四选项格式，answer 是完整选项字符串
2. step2 options 必须是 A/B/C/D 四选项格式，answer 是完整选项字符串（仅词或短词组）
3. sentenceFragments 必须恰好且完整地覆盖 answer 句，distractorFragments 必须为空数组 []
4. 只返回 JSON 数组，不要任何其他文字`;
}

function buildAcademicNativePrompt(wordList: string): string {
  return `你是高阶学术英语练习生成器，面向顶刊投稿/英语母语写作水平。当前难度：母语者水平。以下是待练习的单词列表：
${wordList}

对每个单词生成【母语者水平 - 语篇风格对齐】三步题：

**第一步：摘要重构 (Abstract Paraphrasing)**
- step1.questionType = "paraphrasing"
- step1.originalAbstract = 一段 60-80 词的学术摘要片段（不含目标词，但语义上需要它）
- options：A, B, C, D 四个对该摘要关键句的"同义升级"改写版本，格式为 ["A. 版本1", "B. 版本2", "C. 版本3", "D. 版本4"]
- answer：正确选项的完整字符串

**第二步：语域转换 (Register Flipping)**
- step2.questionType = "register_flip"
- step2.informalText = 一段非正式的调研/观察记录（20-40词）
- step2.prompt = 选出最符合顶刊发表标准的学术改写版本（目标词必须出现）
- options：A, B, C, D 四个改写版本，格式为 ["A. 版本1", "B. 版本2", "C. 版本3", "D. 版本4"]
- answer：正确选项的完整字符串
- step2.registerContrast = 对比两个版本的语域差异说明（中文，40字内）

**第三步：近义词微观辨析 (Nuance Distinction)**
- step3.questionType = "nuance_distinction"
- step3.scenario = 一个极端精确的学术实验/研究场景描述（中文，40-60字）
- step3.promptCn = 基于该场景，选出"唯一正确"的目标词
- options：A, B, C, D 四个英文近义词，格式为 ["A. examine", "B. scrutinize", "C. investigate", "D. review"]
- answer：正确选项的完整字符串（如 "B. scrutinize"）
- step3.nuanceExplanation = 解析为什么其他词不适用（每个词一条，中文，各15字内）
- step3.registerFeature = 该词在学术语域的特征说明（中文，50字内）

注意：第三步是选择题，不需要 sentenceFragments。

返回 JSON 数组格式：
[
  {
    "word": "scrutinize",
    "wordCn": "仔细审查，详细检查",
    "step1": {
      "questionType": "paraphrasing",
      "originalAbstract": "This study examines the regulatory frameworks governing pharmaceutical approvals in three major economies. The authors look closely at policy documents from 2010 to 2023, paying particular attention to inconsistencies in approval criteria.",
      "options": [
        "A. This study **scrutinizes** the regulatory frameworks governing pharmaceutical approvals across three major economies, with particular attention to inconsistencies in approval criteria during 2010–2023.",
        "B. This study checks the regulatory frameworks for pharmaceutical approvals in three economies, focusing on inconsistencies.",
        "C. The paper scrutinized pharmaceutical regulation policies in three economies between 2010 and 2023.",
        "D. Regulatory frameworks for drug approvals were looked at in three major countries over 13 years."
      ],
      "answer": "A. This study **scrutinizes** the regulatory frameworks..."
    },
    "step2": {
      "questionType": "register_flip",
      "informalText": "We went through all the data really carefully and found a bunch of problems with how the numbers were reported.",
      "prompt": "选出最符合顶刊学术规范的改写版本（须包含 scrutinize 或其变体）",
      "options": [
        "A. The research team **scrutinized** the dataset rigorously, identifying systematic discrepancies in the reported figures.",
        "B. The team scrutinized all the data and found a lot of reporting problems.",
        "C. We scrutinized the data and there were issues with how numbers were reported.",
        "D. All data was scrutinized and several problems with number reporting have been found."
      ],
      "answer": "A. The research team **scrutinized** the dataset rigorously...",
      "registerContrast": "非正式版用 went through / found a bunch of（口语化）；学术版用 scrutinized rigorously + identifying systematic discrepancies（被动逻辑主语+正式名词化）"
    },
    "step3": {
      "questionType": "nuance_distinction",
      "scenario": "一项元分析研究需要在方法论章节描述研究团队对23篇已发表临床试验报告的原始数据进行逐项核对与批判性审查，以识别统计报告中的系统性偏差。",
      "promptCn": "在此场景中，用于描述研究团队审查行为的最精准词汇是？",
      "options": ["A. examine", "B. scrutinize", "C. investigate", "D. review"],
      "answer": "B. scrutinize",
      "nuanceExplanation": "A. examine: 泛指检查，缺乏批判性逐项核查含义；C. investigate: 强调发现未知问题，偏向调查；D. review: 指综述性回顾，不强调批判性细节",
      "registerFeature": "scrutinize 是学术英语高强度审查动词，常见于方法论章节，强调主动批判性介入"
    }
  }
]

规则：
1. 所有选项必须是 A/B/C/D 格式，answer 是完整选项字符串
2. 第三步 nuance_distinction 是选择题，不需要 sentenceFragments
3. 只返回 JSON 数组，不要任何其他文字`;
}

// ─── Professional question type metadata per difficulty ──────────────────────
const PROFESSIONAL_STEP_META: Record<string, [string, string, string]> = {
  basic: [
    "商务义项辨析 / Business Sense",
    "标准邮件填空 / Email Phrasing",
    "专业固定搭配 / Professional Collocations",
  ],
  advanced: [
    "委婉化改写 / Politeness Paraphrasing",
    "冲突化解话术 / Conflict De-escalation",
    "职场情境应对 / Scenario Response",
  ],
  native: [
    "谈判博弈模拟 / Negotiation Scripting",
    "领导力演说 / Visionary Leadership",
    "地道商务隐喻 / Idiomatic Business",
  ],
};

// ─── Professional system prompts by difficulty ────────────────────────────────

function buildProfessionalBasicPrompt(wordList: string): string {
  return `你是职场商务英语练习题生成器，面向职场精英与商务沟通场景。以下是待练习的单词列表：
${wordList}

对每个单词生成【基础认知 - 商务语义建立】三步题，严格遵守以下格式和要求：

**第一步：商务义项辨析 (Business Sense Selection)**
- step1.questionType = "business_sense"
- 在 step1.businessContext 中给出一个典型商务场景（约 20-30 词）
- options：A, B, C, D 四个中文释义选项，格式为 ["A. 释义1", "B. 释义2", "C. 释义3", "D. 释义4"]
- answer：正确选项的完整字符串

**第二步：标准化邮件填空 (Standard Email Phrasing)**
- step2.questionType = "email_phrasing"
- step2.emailContext = 邮件类型说明（10字内）
- step2.prompt = 一个完整的商务邮件句子，目标词挖空用 ___
- options：A, B, C, D 四个选项，格式为 ["A. leverage", "B. manipulate", "C. exploit", "D. utilize"]
- answer：正确选项的完整字符串（如 "A. leverage"）
- step2.phrasingNote：说明该表达在邮件中的标准用法（中文，30字内）

**第三步：专业固定搭配 (Professional Collocations)**
- step3.questionType = "professional_collocation"
- step3.businessAction = 该搭配对应的商务动作（10字内）
- step3.promptCn = 一个中文商务场景句子
- step3.answer = 完整英文搭配句（目标词用 **加粗** 标记）
- step3.collocationNote = 该搭配的商务用法说明（中文，40字内）
- step3.registerFeature = 该词在职场商务语域的特征说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组，每个元素格式：
[
  {
    "word": "leverage",
    "wordCn": "利用，借力",
    "step1": {
      "questionType": "business_sense",
      "businessContext": "In the quarterly board meeting, the CFO explained how the company would leverage its existing partnerships to expand into new markets.",
      "options": ["A. 利用优势资源达成目标", "B. 强行施压他方", "C. 借款融资运营", "D. 衡量绩效指标"],
      "answer": "A. 利用优势资源达成目标"
    },
    "step2": {
      "questionType": "email_phrasing",
      "emailContext": "项目合作提案邮件",
      "prompt": "We believe we can ___ our combined expertise to deliver exceptional results for this project.",
      "options": ["A. leverage", "B. manipulate", "C. exploit", "D. utilize forcefully"],
      "answer": "A. leverage",
      "phrasingNote": "leverage our expertise 是商务英语中发挥综合优势的标准表达，语气积极正面"
    },
    "step3": {
      "questionType": "professional_collocation",
      "businessAction": "借力资源优势",
      "promptCn": "我们应当充分利用现有的客户关系网络来加速市场拓展。",
      "answer": "We should fully **leverage** our existing client network to accelerate market expansion.",
      "collocationNote": "leverage + 资源类名词：是商务英语高频搭配，传达战略性借力的积极内涵",
      "registerFeature": "职场商务高频词，常见于战略提案、投资报告和商务演示文稿",
      "sentenceFragments": ["We should", "fully leverage", "our existing", "client network", "to accelerate", "market expansion"],
      "distractorFragments": []
    }
  }
]

规则：
1. 每个单词恰好生成一组三步题
2. 所有 options 必须是 A/B/C/D 格式，answer 是完整选项字符串
3. sentenceFragments 必须恰好且完整地覆盖 answer 句，distractorFragments 必须为空数组 []
4. 只返回 JSON 数组，不要任何其他文字`;
}

function buildProfessionalAdvancedPrompt(wordList: string): string {
  return `你是职场商务英语练习题生成器，面向需要处理复杂职场互动的专业人士，当前难度：进阶运用。以下是待练习的单词列表：
${wordList}

对每个单词生成【进阶运用 - 商务修辞掌握】三步题，严格遵守以下要求：

**第一步：委婉化改写 (Politeness Paraphrasing)**
- step1.questionType = "politeness_paraphrasing"
- step1.directStatement = 一个直白甚至生硬的职场句子
- options：A, B, C, D 四个改写版本，格式为 ["A. 版本1", "B. 版本2", "C. 版本3", "D. 版本4"]
- answer：正确的委婉化版本的完整选项字符串

**第二步：冲突化解话术 (Conflict De-escalation)**
- step2.questionType = "conflict_deescalation"
- step2.negativeScenario = 一个负面职场场景描述（中文，30字内）
- step2.prompt = 一个应对该场景的邮件/对话句子，目标词位置挖空用 ___
- options：A, B, C, D 四个选项，格式为 ["A. addressing", "B. ignoring", "C. deflecting", "D. minimizing"]
- answer：正确选项的完整字符串
- step2.deescalationNote = 解释该词如何在此场景中发挥化解冲突的作用（中文，30字内）

**第三步：职场情境应对 (Scenario Response)**
- step3.questionType = "scenario_response"
- step3.situation = 一个具体的职场对话场景（中文，20字内）
- step3.promptCn = 基于该情境，供用户翻译的中文回应句
- step3.answer = 包含目标词的标准职场英文回应（目标词用 **加粗** 标记，3-5句）
- step3.scenarioNote = 该回应的职场礼仪要点说明（中文，40字内）
- step3.registerFeature = 该词在职场商务语域的特征说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组格式：
[
  {
    "word": "accommodate",
    "wordCn": "配合，迁就，安排",
    "step1": {
      "questionType": "politeness_paraphrasing",
      "directStatement": "We can't do that. The deadline is fixed and there's no room for changes.",
      "options": [
        "A. While we strive to **accommodate** all requests, the current timeline constraints make adjustments unfeasible at this stage.",
        "B. We will try to **accommodate** your needs but the deadline is not moving.",
        "C. Unfortunately, we cannot **accommodate** this at all since we are fully booked.",
        "D. Your request has been noted but **accommodating** it would cause significant disruption."
      ],
      "answer": "A. While we strive to **accommodate** all requests, the current timeline constraints make adjustments unfeasible at this stage."
    },
    "step2": {
      "questionType": "conflict_deescalation",
      "negativeScenario": "客户对项目延期表示强烈不满并威胁取消合同",
      "prompt": "We sincerely apologize for the inconvenience and are fully committed to ___ your concerns with the utmost priority.",
      "options": ["A. addressing", "B. ignoring", "C. deflecting", "D. minimizing"],
      "answer": "A. addressing",
      "deescalationNote": "addressing your concerns 传达了正面处理客户诉求的积极态度，有效降低对方对抗情绪"
    },
    "step3": {
      "questionType": "scenario_response",
      "situation": "跨部门同事临时请求协助完成紧急报告",
      "promptCn": "我们很乐意配合这次的紧急需求，请告诉我们您具体需要哪些支持，我们会尽快安排。",
      "answer": "We are happy to **accommodate** this urgent request. Could you please share the specific support you need so we can prioritize accordingly and revert to you at the earliest convenience?",
      "scenarioNote": "accommodate + 请求类名词体现职业弹性；revert to you 是商务英语回复您的标准表达",
      "registerFeature": "accommodate 在职场中传达合作与弹性，常出现于跨部门沟通和客户服务场景",
      "sentenceFragments": ["We are happy to", "accommodate", "this urgent request.", "Could you please share", "the specific support you need", "so we can", "prioritize accordingly"],
      "distractorFragments": []
    }
  }
]

规则：
1. step1 options 必须是 A/B/C/D 四选项格式
2. step2 options 必须是 A/B/C/D 四选项格式
3. sentenceFragments 必须恰好且完整地覆盖 answer 句，distractorFragments 必须为空数组 []
4. 只返回 JSON 数组，不要任何其他文字`;
}

function buildProfessionalNativePrompt(wordList: string): string {
  return `你是职场商务英语练习题生成器，面向需要掌握谈判策略与领导力沟通的高级商务人士，当前难度：母语者水平。以下是待练习的单词列表：
${wordList}

对每个单词生成【母语者水平 - 谈判策略与领导力表达】三步题：

**第一步：谈判博弈模拟 (Negotiation Scripting)**
- step1.questionType = "negotiation_scripting"
- step1.negotiationContext = 一个商务谈判场景描述（中文，30字内）
- step1.negotiationGoal = 己方谈判目标（中文，20字内）
- options：A, B, C, D 四个谈判话术版本，格式为 ["A. 版本1", "B. 版本2", "C. 版本3", "D. 版本4"]
- answer：最佳谈判话术的完整选项字符串
- step1.strategyNote = 解析该话术的谈判策略（中文，40字内）

**第二步：愿景与领导力演说 (Visionary Leadership)**
- step2.questionType = "visionary_leadership"
- step2.meetingType = 演讲场景（10字内）
- step2.prompt = 一段演讲稿中的关键句，目标词位置挖空用 ___
- options：A, B, C, D 四个词汇选项，格式为 ["A. pivot", "B. withdrawal", "C. compromise", "D. detour"]
- answer：正确选项的完整字符串（如 "A. pivot"）
- step2.leadershipNote = 解析目标词在领导力语境下的感染力来源（中文，30字内）

**第三步：地道商务隐喻 (Idiomatic Business Expressions)**
- step3.questionType = "idiomatic_business"
- step3.idiomScenario = 使用目标词相关商务隐喻的真实场景（中文，30字内）
- step3.informalVer = 直白表达该意思的普通句子（英文）
- step3.promptCn = 要求改写为含地道商务隐喻的版本（中文提示）
- step3.answer = 使用地道商务隐喻的标准版本（目标词用 **加粗** 标记）
- step3.idiomExplanation = 解析该隐喻的文化来源与商务含义（中文，40字内）
- step3.registerFeature = 该词在职场商务语域的特征说明（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组格式：
[
  {
    "word": "pivot",
    "wordCn": "转型，转变策略",
    "step1": {
      "questionType": "negotiation_scripting",
      "negotiationContext": "创业公司与VC进行A轮融资谈判，投资方对当前商业模式表示疑虑",
      "negotiationGoal": "在不完全妥协的前提下消除顾虑并促成投资",
      "options": [
        "A. We hear your concerns, and I want to be transparent: we are already **pivoting** our go-to-market strategy based on early user data, which actually reduces the risk you've identified.",
        "B. We understand your hesitation and we are willing to **pivot** our entire business model if that's what you need.",
        "C. Our team is ready to **pivot** anytime you say so — flexibility is our core value.",
        "D. We've already made a **pivot**, so your concerns are no longer valid."
      ],
      "answer": "A. We hear your concerns, and I want to be transparent: we are already **pivoting** our go-to-market strategy...",
      "strategyNote": "先承认顾虑（建立信任），再主动披露行动（降低不确定性），最后重新框架为降低风险——经典的谈判化守为攻"
    },
    "step2": {
      "questionType": "visionary_leadership",
      "meetingType": "战略转型全员大会",
      "prompt": "This is not a retreat — this is a strategic ___. We are not abandoning our vision; we are finding a smarter path to it.",
      "options": ["A. pivot", "B. withdrawal", "C. compromise", "D. detour"],
      "answer": "A. pivot",
      "leadershipNote": "pivot 在商务语境中暗含敏捷应变的正面内涵，将战略转变重新框定为主动掌控而非被动撤退"
    },
    "step3": {
      "questionType": "idiomatic_business",
      "idiomScenario": "初创公司在发现原有方向不奏效后迅速调整商业模式",
      "informalVer": "We changed our business direction when things weren't working out.",
      "promptCn": "用硅谷创业文化中的标准说法，将上述句子改写为更具商业语感的版本（须包含 pivot）",
      "answer": "Faced with stagnating traction, the founding team made a decisive **pivot** — shifting from a B2C subscription model to an enterprise SaaS solution within a single quarter.",
      "idiomExplanation": "pivot 源自篮球运动（单脚转身换方向），在硅谷创业文化中演变为战略转型的标志性词汇",
      "registerFeature": "pivot 是商务英语高频词，尤其在创投、战略咨询和产品管理场景中",
      "sentenceFragments": ["Faced with stagnating traction,", "the founding team", "made a decisive pivot", "— shifting from", "a B2C subscription model", "to an enterprise SaaS solution", "within a single quarter"],
      "distractorFragments": []
    }
  }
]

规则：
1. 所有 options 必须是 A/B/C/D 格式，answer 是完整选项字符串
2. sentenceFragments 必须恰好且完整地覆盖 answer 句，distractorFragments 必须为空数组 []
3. 只返回 JSON 数组，不要任何其他文字`;
}

// ─── Literary question type metadata per difficulty ───────────────────────────
const LITERARY_STEP_META: Record<string, [string, string, string]> = {
  basic: [
    "意象与情感匹配 / Imagery & Mood",
    "词汇色彩辨析 / Connotation",
    "修辞手法识别 / Rhetorical Devices",
  ],
  advanced: [
    "展示而非讲述 / Show Don't Tell",
    "描写性组句 / Descriptive Builder",
    "移情与感官描写 / Sensory Details",
  ],
  native: [
    "风格模仿创作 / Stylistic Imitation",
    "文本深度细读 / Explication",
    "叙事视角转换 / Perspective Shift",
  ],
};

// ─── Literary system prompts by difficulty ────────────────────────────────────

function buildLiteraryBasicPrompt(wordList: string): string {
  return `你是文学英语练习生成器，面向英文文学阅读、创意写作与翻译实践学习者，当前难度：基础认知。以下是待练习的单词列表：
${wordList}

对每个单词生成【基础认知 - 文学语感建立】三步题，严格遵守以下格式：

**第一步：意象与情感匹配 (Imagery & Mood Matching)**
- step1.questionType = "imagery_mood"
- step1.literaryPassage：给出一段 30-50 词的英文文学描写（可引自经典英美文学名著，或自创同等风格），营造鲜明的情感氛围。目标词必须出现在段落中（加粗）。
- options：A, B, C, D 四个**英文**文学基调形容词（专业文学术语，如 melancholic, desolate, sublime, ominous, elegiac, exuberant 等），每项格式为 "A. melancholic"，其中正确答案必须是最能概括该段落基调的词
- answer：正确选项的完整字符串（如 "A. melancholic"）
- step1.moodNote：解析该段落的情感意象与基调（中文，40字内）

**重要**：options 必须是英文文学形容词，不允许使用中文！

**第二步：文学词汇色彩辨析 (Nuance Cloze)**
- step2.questionType = "connotation_distinction"
- step2.connotationSentence：给出一个完整的具有强烈文学色彩的英文句子，在关键词（目标词或其近义词）处用 ___ 挖空。例："The lake ___ in the silver moonlight, as if the stars had drowned beneath its surface."
- step2.prompt = step2.connotationSentence（直接使用该句子作为 prompt，让前端渲染挖空效果）
- options：A, B, C, D 四个英文近义词（语义上相近但文学色彩各异的词），格式为 ["A. shimmered", "B. glittered", "C. gleamed", "D. sparkled"]，正确答案必须是最符合该句文学语境色彩的词（目标词优先）
- answer：正确选项的完整字符串（如 "A. shimmered"）
- step2.connotationNote：解析四个词在文学语境下的细微色彩差异（中文，80字内），说明为何正确答案最贴合该场景

**第三步：修辞手法识别 (Rhetorical Device Identification)**
- step3.questionType = "rhetorical_device"
- step3.rhetoricalSentence：给出一个含有明确修辞手法的英文文学例句（目标词出现其中，加粗）
- step3.promptCn：该句的中文翻译（仅翻译，不加其他文字）
- step3.prompt = step3.rhetoricalSentence（前端显示用）
- options：A, B, C, D 四个修辞手法选项，格式为 ["A. Metaphor（暗喻）", "B. Simile（明喻）", "C. Personification（拟人）", "D. Alliteration（头韵）"]（根据实际例句选择合适的四种修辞手法）
- answer：正确选项的完整字符串（如 "A. Metaphor（暗喻）"）
- step3.rhetoricalNote：解析该修辞手法在句中的美学效果（中文，50字内）
- step3.registerFeature：该词在文学语域的风格特征说明（中文，30字内）

**注意：第三步是修辞识别选择题，严禁提供 sentenceFragments，不需要碎片组句。**

返回 JSON 数组，每个元素格式：
[
  {
    "word": "desolate",
    "wordCn": "荒凉的，孤寂的",
    "step1": {
      "questionType": "imagery_mood",
      "literaryPassage": "The moors stretched endlessly before her, a **desolate** expanse of grey heather under a weeping sky. Not a soul stirred; even the wind seemed to mourn.",
      "options": ["A. melancholic", "B. serene", "C. exuberant", "D. sublime"],
      "answer": "A. melancholic",
      "moodNote": "灰色石楠、哭泣的天空与无风的荒原共同渲染出哥特式的哀恸与孤绝"
    },
    "step2": {
      "questionType": "connotation_distinction",
      "connotationSentence": "The abandoned estate lay ___ beneath the autumn fog, its crumbling walls exhaling centuries of sorrow.",
      "prompt": "The abandoned estate lay ___ beneath the autumn fog, its crumbling walls exhaling centuries of sorrow.",
      "options": ["A. desolate", "B. empty", "C. bare", "D. deserted"],
      "answer": "A. desolate",
      "connotationNote": "desolate兼具物质荒废与情感孤绝的双重维度，最贴合此处建筑与情感共鸣的文学语境；empty过于平淡；bare偏重物理上的裸露；deserted仅指无人"
    },
    "step3": {
      "questionType": "rhetorical_device",
      "rhetoricalSentence": "Loneliness was a **desolate** moor stretching to the horizon of her heart.",
      "promptCn": "孤独是一片延伸至她内心地平线的荒原。",
      "prompt": "Loneliness was a **desolate** moor stretching to the horizon of her heart.",
      "options": ["A. Metaphor（暗喻）", "B. Simile（明喻）", "C. Personification（拟人）", "D. Alliteration（头韵）"],
      "answer": "A. Metaphor（暗喻）",
      "rhetoricalNote": "暗喻将抽象的孤独等同于具象的荒原，省略比较词，使情感的空洞感获得空间的物质化呈现",
      "registerFeature": "desolate 是文学英语中描绘情感孤绝与荒野意境的核心词汇，常见于哥特式、浪漫主义作品"
    }
  }
]

规则：
1. step1 options 必须是四个**英文**文学形容词（专业术语），严禁使用中文
2. step2 必须提供一个完整的英文文学句子（含挖空 ___），options 是四个英文近义词
3. step3 是选择题（修辞识别），严禁提供 sentenceFragments 字段
4. 文学语料优先引用英美名著，或自创同等美学水准的段落
5. 只返回 JSON 数组，不要任何其他文字`;
}

function buildLiteraryAdvancedPrompt(wordList: string): string {
  return `你是文学英语练习生成器，面向有志于创意写作与文学批评的学习者，当前难度：进阶运用。以下是待练习的单词列表：
${wordList}

对每个单词生成【进阶运用 - 描写语言掌握】三步题，严格遵守以下格式：

**第一步："展示而非讲述"改写 (Show, Don't Tell)**
- step1.questionType = "show_dont_tell"
- step1.blandStatement = 一个平淡、直接的情感陈述句（如 "She felt melancholy"），用简单动词/形容词直接陈述情感，不含任何文学修辞
- options：A, B, C, D 四个文学化的描写性改写句，格式为 ["A. 改写版本1", "B. 改写版本2", "C. 改写版本3", "D. 改写版本4"]
  * 所有四个选项都必须包含目标词（自然嵌入，无需加粗，严禁使用 **word** 标注）
  * 正确选项（通常为A）通过具体动作、细节或意象"展示"题干中的情感，而非简单重复含义；其余三项为较平淡或语法欠佳的对比版本
- answer：最佳改写的完整选项字符串（不含任何加粗标记）

**第二步：描写性组句 (Descriptive Sentence Builder)**
- step2.questionType = "descriptive_builder"
- step2.prompt = 给出一组被打散的文学词组，要求选出节奏最优美、修饰语位置最恰当的组合句
- options：A, B, C, D 四个重组版本，格式为 ["A. 版本1", "B. 版本2", "C. 版本3", "D. 版本4"]（目标词加粗）
- answer：节奏最佳版本的完整选项字符串
- step2.rhythmNote：解析获选版本的句式节奏优势（中文，40字内）

**第三步：移情与感官描写 (Empathy & Sensory Details)**
- step3.questionType = "sensory_details"
- step3.emotionalTheme = 情感主题（中文，5字内，如"孤独"）
- step3.promptCn = 要求：调用五感中与目标词最相关的感官，为上述情感主题写一句具有感染力的英文描写（参考答案）
- step3.answer = 包含目标词的参考英文句子（目标词用 **加粗** 标记）
- step3.sensoryNote = 解析该句调用了哪种感官，以及美学效果（中文，40字内）
- step3.registerFeature = 该词在文学语域的风格特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组格式：
[
  {
    "word": "wither",
    "wordCn": "枯萎，凋谢；衰退",
    "step1": {
      "questionType": "show_dont_tell",
      "blandStatement": "The old man was getting weaker.",
      "options": [
        "A. Day by day, his hands withered into pale knots of bone, and the light behind his eyes grew thin as winter sun.",
        "B. The old man was withering away slowly, becoming weaker.",
        "C. He was becoming weak, like something that withers in the cold.",
        "D. His strength was withering; he was getting old and frail."
      ],
      "answer": "A. Day by day, his hands withered into pale knots of bone, and the light behind his eyes grew thin as winter sun."
    },
    "step2": {
      "questionType": "descriptive_builder",
      "prompt": "词组：[once-proud / the roses / in silence / withered / along the garden wall]",
      "options": [
        "A. The once-proud roses **withered** in silence along the garden wall.",
        "B. Along the garden wall, in silence, the once-proud roses **withered**.",
        "C. The roses, once-proud, **withered** along the garden wall in silence.",
        "D. **Withered** in silence, the once-proud roses along the garden wall."
      ],
      "answer": "A. The once-proud roses **withered** in silence along the garden wall.",
      "rhythmNote": "前置修饰语 once-proud 形成记忆中的对比；in silence 置于动词后，让凋谢的动作充满了无声的仪式感"
    },
    "step3": {
      "questionType": "sensory_details",
      "emotionalTheme": "失落",
      "promptCn": "以"失落"为情感主题，调用嗅觉或触觉，写一句含有 wither 的感染力描写",
      "answer": "The scent of **withered** jasmine clung to her collar — a ghost of sweetness she could never quite release.",
      "sensoryNote": "嗅觉（scent）唤起记忆，**withered** 修饰茉莉暗指消逝的美好，ghost of sweetness 将失落物质化为萦绕不去的幽灵",
      "registerFeature": "wither 在文学语域中兼具视觉与情感双重意象，常出现于哥特式、象征主义及现代诗歌",
      "sentenceFragments": ["The scent of", "withered jasmine", "clung to her collar", "— a ghost of sweetness", "she could never quite release"],
      "distractorFragments": []
    }
  }
]

规则：
1. 所有 options 必须是 A/B/C/D 格式，answer 是完整选项字符串
2. step1 options 中严禁使用 **word** 加粗标注，所有选项均为纯文本英文句子
3. sentenceFragments 必须恰好且完整地覆盖 step3.answer 句，distractorFragments 为空数组 []
4. 只返回 JSON 数组，不要任何其他文字`;
}

function buildLiteraryNativePrompt(wordList: string): string {
  return `你是文学英语练习生成器，面向文学批评、创意写作与深度阅读的高阶学习者，当前难度：母语者水平。以下是待练习的单词列表：
${wordList}

对每个单词生成【母语者水平 - 大师风格与深度文本分析】三步题：

**第一步：风格模仿创作 (Stylistic Imitation)**
- step1.questionType = "stylistic_imitation"
- step1.authorStyle = 一位经典作家的风格标签（英文，15字内，如 "Hemingway's iceberg minimalism"）
- step1.styleDescription = 对该风格的简要描述（中文，30字内）
- options：A, B, C, D 四段模仿同一作家风格围绕同一主题的写作，格式为 ["A. 文段1", "B. 文段2", "C. 文段3", "D. 文段4"]，仅一段最精准地体现该风格且自然地融入目标词
- answer：最佳风格模仿的完整选项字符串

**第二步：文本深度细读 (Explication de Texte Fragment)**
- step2.questionType = "explication"
- step2.literaryFragment = 一段 30-50 词的高难度文学选段（现代诗歌、意识流片段或意象派散文），包含目标词
- step2.prompt = "请选出对以下选段中目标词及意象的最深刻解读："
- options：A, B, C, D 四个解读选项，格式为 ["A. 解读1", "B. 解读2", "C. 解读3", "D. 解读4"]，从多层含义和美学效果角度进行深度解读
- answer：最深刻解读的完整选项字符串
- step2.aestheticNote：补充说明该解读的美学价值所在（中文，40字内）

**第三步：叙事视角转换 (Narrative Perspective Shift)**
- step3.questionType = "perspective_shift"
- step3.thirdPersonPassage = 一段 30-40 词的第三人称描写（包含目标词）
- step3.promptCn = "将以上第三人称描写改写为第一人称内心独白，保留目标词，并深化叙事声音的情感张力"
- step3.answer = 最佳第一人称改写（目标词用 **加粗** 标记）
- step3.perspectiveNote = 解析视角转换对叙事声音的改变（中文，40字内）
- step3.registerFeature = 该词在文学语域的高阶风格特征（中文，30字内）
${SENTENCE_BUILDER_RULE}

返回 JSON 数组格式：
[
  {
    "word": "ephemeral",
    "wordCn": "短暂的，转瞬即逝的",
    "step1": {
      "questionType": "stylistic_imitation",
      "authorStyle": "Virginia Woolf's stream of consciousness",
      "styleDescription": "伍尔夫式：意识流动、感官叠加、时间非线性、女性内省视角",
      "options": [
        "A. She thought — or did not think, only felt — how **ephemeral** everything was: the tea cooling in the cup, the light on the wall, Richard, all of it dissolving before she could name what held her.",
        "B. Beauty is **ephemeral**. I stood there, watching the sunset fade, and I knew nothing lasts. That is the truth of things.",
        "C. The **ephemeral** quality of the moment struck her as she looked at the flowers. They would die soon, she realized, just like everything else.",
        "D. She said to herself: all is **ephemeral**. The flowers, the light, her own thoughts — gone before she could catch them."
      ],
      "answer": "A. She thought — or did not think, only felt — how **ephemeral** everything was: the tea cooling in the cup, the light on the wall, Richard, all of it dissolving before she could name what held her."
    },
    "step2": {
      "questionType": "explication",
      "literaryFragment": "What is love? A breath, **ephemeral** as fog on glass — pressed to the surface for one urgent moment, then gone, leaving only the ghost of warmth on cold transparency.",
      "prompt": "请选出对以上选段中 ephemeral 及其周边意象的最深刻解读：",
      "options": [
        "A. 选段以雾气喻爱情，ephemeral 在此强化了爱的短暂性；\"ghost of warmth\"构成悖论式意象——消逝之物留下可感的痕迹，暗示记忆比爱情本身更持久，这才是选段的真正主题。",
        "B. 作者用比喻说明爱情是短暂的，like fog 是明喻，ephemeral 是形容词修饰 fog，整体表达了悲观主义的爱情观。",
        "C. ephemeral 意思是短暂，与 fog 搭配说明爱情像雾一样容易消散，cold transparency 象征冷漠，体现了现代主义对情感的疏离态度。",
        "D. 选段采用明喻手法，将爱情比作玻璃上的雾，说明爱情不真实、不稳定，ephemeral 是主旨词，揭示虚无主义哲学。"
      ],
      "answer": "A. 选段以雾气喻爱情，ephemeral 在此强化了爱的短暂性...",
      "aestheticNote": "最深刻的解读不止于\"短暂\"本义，而是挖掘出悖论张力：消逝之物留下痕迹，让ephemeral承载了比字面更复杂的时间哲学"
    },
    "step3": {
      "questionType": "perspective_shift",
      "thirdPersonPassage": "She lingered in the garden, aware that the cherry blossoms were **ephemeral**, and that she too would someday be a memory in someone else's story.",
      "promptCn": "将以上第三人称描写改写为第一人称内心独白，保留 ephemeral，并深化叙事声音的情感张力",
      "answer": "I linger here, knowing these blossoms are **ephemeral** — knowing I, too, am someone else's story in the making, a footnote already fading at the edges.",
      "perspectiveNote": "第一人称将客观陈述变为当下的自我凝视；\"I, too\"引入主体对自身消逝的正视，情感张力从旁观的哀愁升级为直面死亡的存在主义意识",
      "registerFeature": "ephemeral 是文学与哲学双栖词汇，在意识流、自然书写及存在主义文学中均有高频出现，携带显著的时间哲学维度",
      "sentenceFragments": ["I linger here,", "knowing these blossoms", "are ephemeral", "— knowing I, too,", "am someone else's story", "in the making,", "a footnote already", "fading at the edges"],
      "distractorFragments": []
    }
  }
]

规则：
1. 所有 options 必须是 A/B/C/D 格式，answer 是完整选项字符串
2. sentenceFragments 必须恰好且完整地覆盖 step3.answer 句，distractorFragments 为空数组 []
3. 文学选段须具备真实的美学水准，避免平淡的练习体语言
4. 只返回 JSON 数组，不要任何其他文字`;
}

// ─── Generic (non-academic) system prompt ────────────────────────────────────

function buildGenericPrompt(scenarioContext: string, difficultyContext: string, wordList: string): string {
  return `你是英语三阶段复习题生成器。当前练习配置：
- 场景：${scenarioContext}
- 难度：${difficultyContext}

对于每个单词，你需要生成三道递进式题目，所有题目必须严格契合以上配置的场景和难度：

**第一步：释义识别 (recognition)**
- 显示英文单词，让用户从A, B, C, D四个中文释义中选出正确答案
- options 格式：["A. 改善，改进", "B. 恶化，退化", "C. 夸大，夸张", "D. 阐述，详述"]
- answer：正确选项的完整字符串（如 "A. 改善，改进"）
- 3个干扰项应是含义相近但不同的中文释义

**第二步：语境填空 (application)**
- 给出一个契合${scenarioContext}的地道英文句子，目标单词位置用 ___ 表示
- options 格式：["A. ameliorate", "B. deteriorate", "C. exaggerate", "D. elaborate"]
- answer：正确选项的完整字符串（如 "A. ameliorate"）
- 句子难度需符合${difficultyContext}

**第三步：碎片化组句 (sentence builder)**
- 给出一个中文句子（需符合${scenarioContext}的风格），用户需拼出包含目标单词的英文句子
- step3.answer：参考答案完整句（目标单词用 **word** 加粗标记）
- step3.sentenceFragments：将 answer 拆分为 4-8 个词/短语卡片的数组
- step3.distractorFragments：1-2 个干扰词/短语卡片的数组

返回 JSON 数组：
[
  {
    "word": "ameliorate",
    "wordCn": "改善，改进",
    "step1": {
      "options": ["A. 改善，改进", "B. 恶化，退化", "C. 夸大，夸张", "D. 阐述，详述"],
      "answer": "A. 改善，改进"
    },
    "step2": {
      "prompt": "The new policy aims to ___ living conditions in rural areas.",
      "options": ["A. ameliorate", "B. deteriorate", "C. exaggerate", "D. elaborate"],
      "answer": "A. ameliorate"
    },
    "step3": {
      "promptCn": "政府正在采取措施改善农村地区的医疗条件。",
      "answer": "The government is taking measures to **ameliorate** healthcare conditions in rural areas.",
      "sentenceFragments": ["The government", "is taking measures", "to ameliorate", "healthcare conditions", "in rural areas"],
      "distractorFragments": []
    }
  }
]

规则：
1. 每个单词恰好生成一组三步题
2. 所有 options 必须是 A/B/C/D 格式，answer 是完整选项字符串
3. 干扰项必须是真实词汇/释义，难度相当
4. 句子要地道自然，严格契合指定场景风格
5. sentenceFragments 必须恰好且完整地覆盖 answer 句，distractorFragments 必须为空数组 []
6. 只返回 JSON 数组，不要其他文字

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
    const isProfessional = scenario === "professional";
    const isLiterary = scenario === "literary";
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
    } else if (isProfessional) {
      const diff = difficulty as "basic" | "advanced" | "native";
      stepMeta = PROFESSIONAL_STEP_META[diff] || PROFESSIONAL_STEP_META.advanced;
      if (diff === "basic") {
        systemPrompt = buildProfessionalBasicPrompt(wordList);
      } else if (diff === "native") {
        systemPrompt = buildProfessionalNativePrompt(wordList);
      } else {
        systemPrompt = buildProfessionalAdvancedPrompt(wordList);
      }
    } else if (isLiterary) {
      const diff = difficulty as "basic" | "advanced" | "native";
      stepMeta = LITERARY_STEP_META[diff] || LITERARY_STEP_META.advanced;
      if (diff === "basic") {
        systemPrompt = buildLiteraryBasicPrompt(wordList);
      } else if (diff === "native") {
        systemPrompt = buildLiteraryNativePrompt(wordList);
      } else {
        systemPrompt = buildLiteraryAdvancedPrompt(wordList);
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
              : isProfessional
              ? `请为以下单词生成职场商务专项练习题（按上方格式）：\n${wordList}`
              : isLiterary
              ? `请为以下单词生成文学表达专项练习题（按上方格式）：\n${wordList}`
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
        stepMeta: stepMeta || null,
        isAcademic,
        isProfessional,
        isLiterary,
        academicDifficulty: isAcademic ? difficulty : null,
        professionalDifficulty: isProfessional ? difficulty : null,
        literaryDifficulty: isLiterary ? difficulty : null,
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
