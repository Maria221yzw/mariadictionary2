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
- 在 step1.businessContext 中给出一个典型商务场景（如邮件开头、会议发言、合同条款），约 20-30 词
- 说明目标词在商务语境下的特殊含义（如 appreciation 在商务中常指"增值"而非"感激"）
- options：4 个中文释义选项（含正确的商务义项 + 3 个语义相关但不准确的干扰项）
- answer：正确的商务义项

**第二步：标准化邮件填空 (Standard Email Phrasing)**
- step2.questionType = "email_phrasing"
- step2.emailContext = 邮件类型说明（如"会议邀约邮件"、"项目进度汇报"、"客户投诉回复"），10字内
- step2.prompt = 一个完整的商务邮件句子，目标词挖空用 ___（保持真实邮件措辞风格）
- options：4个选项（正确答案 + 3个语感相近的商务词汇干扰项）
- answer：正确答案
- step2.phrasingNote：说明该表达在邮件中的标准用法（中文，30字内）

**第三步：专业固定搭配 (Professional Collocations)**
- step3.questionType = "professional_collocation"
- step3.businessAction = 该搭配对应的商务动作（如"签署协议"、"达成共识"、"推进项目"），10字内
- step3.promptCn = 一个中文商务场景句子，供用户理解语境
- step3.answer = 完整英文搭配句（目标词用 **加粗** 标记）
- step3.collocationNote = 该搭配的商务用法说明（中文，40字内，如"reach a consensus: 在商务英语中是'达成共识'的标准表达，常见于会议纪要和谈判收尾"）
- step3.registerFeature = 该词在职场商务语域的特征说明（中文，30字内）

返回 JSON 数组，每个元素格式：
[
  {
    "word": "leverage",
    "wordCn": "利用，借力",
    "step1": {
      "questionType": "business_sense",
      "businessContext": "In the quarterly board meeting, the CFO explained how the company would leverage its existing partnerships to expand into new markets.",
      "options": ["利用优势资源达成目标", "强行施压他方", "借款融资运营", "衡量绩效指标"],
      "answer": "利用优势资源达成目标"
    },
    "step2": {
      "questionType": "email_phrasing",
      "emailContext": "项目合作提案邮件",
      "prompt": "We believe we can ___ our combined expertise to deliver exceptional results for this project.",
      "options": ["leverage", "manipulate", "exploit", "utilize forcefully"],
      "answer": "leverage",
      "phrasingNote": "leverage our expertise 是商务英语中'发挥综合优势'的标准表达，语气积极正面"
    },
    "step3": {
      "questionType": "professional_collocation",
      "businessAction": "借力资源优势",
      "promptCn": "我们应当充分利用现有的客户关系网络来加速市场拓展。",
      "answer": "We should fully **leverage** our existing client network to accelerate market expansion.",
      "collocationNote": "leverage + 资源类名词：是商务英语高频搭配，传达'战略性借力'的积极内涵，区别于带负面色彩的 exploit",
      "registerFeature": "职场商务高频词，常见于战略提案、投资报告和商务演示文稿"
    }
  }
]

规则：
1. 每个单词恰好生成一组三步题
2. 商务场景须真实，反映实际职场沟通（邮件/会议/谈判）
3. step2 的句子须符合真实商务邮件措辞风格，不得过于学术化
4. step3 搭配须是商务英语中真实存在的固定表达
5. 只返回 JSON 数组，不要任何其他文字`;
}

function buildProfessionalAdvancedPrompt(wordList: string): string {
  return `你是职场商务英语练习题生成器，面向需要处理复杂职场互动的专业人士，当前难度：进阶运用。以下是待练习的单词列表：
${wordList}

对每个单词生成【进阶运用 - 商务修辞掌握】三步题，严格遵守以下要求：

**第一步：委婉化改写 (Politeness Paraphrasing)**
- step1.questionType = "politeness_paraphrasing"
- step1.directStatement = 一个直白甚至生硬的职场句子（如直接拒绝、批评、催促）
- options：4个改写版本，其中一个使用目标词、语气委婉得体的最佳版本
- answer：正确的委婉化版本（目标词用 **加粗** 标记）
- 干扰项：同样含目标词但措辞过于强硬、语气不当或逻辑有误的版本

**第二步：冲突化解话术 (Conflict De-escalation)**
- step2.questionType = "conflict_deescalation"
- step2.negativeScenario = 一个负面职场场景描述（如项目延期、预算被削减、客户投诉），中文，30字内
- step2.prompt = 一个应对该场景的邮件/对话句子，目标词位置挖空用 ___
- options：4个选项（含能化解冲突的正确答案 + 3个语感相近但效果不佳的词）
- answer：正确选项
- step2.deescalationNote = 解释该词如何在此场景中发挥化解冲突的作用（中文，30字内）

**第三步：职场情境应对 (Scenario Response)**
- step3.questionType = "scenario_response"
- step3.situation = 一个具体的职场对话场景（如"老板突然临时派任务"），中文，20字内
- step3.promptCn = 基于该情境，供用户翻译的中文回应句（需体现职场礼仪）
- step3.answer = 包含目标词的标准职场英文回应（目标词用 **加粗** 标记，3-5句）
- step3.scenarioNote = 该回应的职场礼仪要点说明（中文，40字内）
- step3.registerFeature = 该词在职场商务语域的特征说明（中文，30字内）

返回 JSON 数组格式：
[
  {
    "word": "accommodate",
    "wordCn": "配合，迁就，安排",
    "step1": {
      "questionType": "politeness_paraphrasing",
      "directStatement": "We can't do that. The deadline is fixed and there's no room for changes.",
      "options": [
        "While we strive to **accommodate** all requests, the current timeline constraints make adjustments unfeasible at this stage.",
        "We will try to **accommodate** your needs but the deadline is not moving.",
        "Unfortunately, we cannot **accommodate** this at all since we are fully booked.",
        "Your request has been noted but **accommodating** it would cause significant disruption."
      ],
      "answer": "While we strive to **accommodate** all requests, the current timeline constraints make adjustments unfeasible at this stage."
    },
    "step2": {
      "questionType": "conflict_deescalation",
      "negativeScenario": "客户对项目延期表示强烈不满并威胁取消合同",
      "prompt": "We sincerely apologize for the inconvenience and are fully committed to ___ your concerns with the utmost priority.",
      "options": ["addressing", "ignoring", "deflecting", "minimizing"],
      "answer": "addressing",
      "deescalationNote": "addressing your concerns 传达了'正面处理客户诉求'的积极态度，有效降低对方对抗情绪"
    },
    "step3": {
      "questionType": "scenario_response",
      "situation": "跨部门同事临时请求协助完成紧急报告",
      "promptCn": "我们很乐意配合这次的紧急需求，请告诉我们您具体需要哪些支持，我们会尽快安排。",
      "answer": "We are happy to **accommodate** this urgent request. Could you please share the specific support you need so we can prioritize accordingly and revert to you at the earliest convenience?",
      "scenarioNote": "accommodate + 请求类名词体现职业弹性；revert to you 是商务英语'回复您'的标准表达",
      "registerFeature": "accommodate 在职场中传达合作与弹性，常出现于跨部门沟通和客户服务场景"
    }
  }
]

规则：
1. 委婉化任务：directStatement 须明显生硬，正确选项须真实体现职场礼仪改写
2. 冲突化解：negativeScenario 须真实、紧张，正确选项须有实质性的情绪安抚效果
3. 情境应对：situation 须具体，answer 须符合真实职场语气，不能过于书面化
4. 只返回 JSON 数组，不要任何其他文字`;
}

function buildProfessionalNativePrompt(wordList: string): string {
  return `你是职场商务英语练习题生成器，面向需要掌握谈判策略与领导力沟通的高级商务人士，当前难度：母语者水平。以下是待练习的单词列表：
${wordList}

对每个单词生成【母语者水平 - 谈判策略与领导力表达】三步题：

**第一步：谈判博弈模拟 (Negotiation Scripting)**
- step1.questionType = "negotiation_scripting"
- step1.negotiationContext = 一个商务谈判场景描述（如供应商价格谈判、薪资谈判、合同条款商议），中文，30字内
- step1.negotiationGoal = 己方谈判目标（中文，20字内）
- options：4个谈判话术版本，其中一个使用目标词、最能实现目标的策略性表达
- answer：最佳谈判话术（目标词用 **加粗** 标记）
- step1.strategyNote = 解析该话术的谈判策略（中文，40字内，如"先让步再加码"、"设定锚点"）

**第二步：愿景与领导力演说 (Visionary Leadership)**
- step2.questionType = "visionary_leadership"
- step2.meetingType = 演讲场景（如"全员大会开场"、"Q4战略发布"、"危机应对动员"），10字内
- step2.prompt = 一段演讲稿中的关键句，目标词位置挖空用 ___
- options：4个词汇选项（含正确的有感染力的目标词 + 3个语义相近但力度不足的词）
- answer：正确答案
- step2.leadershipNote = 解析目标词在领导力语境下的感染力来源（中文，30字内）

**第三步：地道商务隐喻 (Idiomatic Business Expressions)**
- step3.questionType = "idiomatic_business"
- step3.idiomScenario = 一个使用目标词相关商务隐喻的真实场景（中文，30字内）
- step3.informalVer = 一个直白表达该意思的普通句子（英文）
- step3.promptCn = 要求改写为含地道商务隐喻的版本（中文提示）
- step3.answer = 使用地道商务隐喻的标准版本（目标词用 **加粗** 标记）
- step3.idiomExplanation = 解析该隐喻的文化来源与商务含义（中文，40字内）
- step3.registerFeature = 该词在职场商务语域的特征说明（中文，30字内）

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
        "We hear your concerns, and I want to be transparent: we are already **pivoting** our go-to-market strategy based on early user data, which actually reduces the risk you've identified.",
        "We understand your hesitation and we are willing to **pivot** our entire business model if that's what you need.",
        "Our team is ready to **pivot** anytime you say so — flexibility is our core value.",
        "We've already made a **pivot**, so your concerns are no longer valid."
      ],
      "answer": "We hear your concerns, and I want to be transparent: we are already **pivoting** our go-to-market strategy based on early user data, which actually reduces the risk you've identified.",
      "strategyNote": "先承认顾虑（建立信任），再主动披露行动（降低不确定性），最后重新框架为'降低风险'——经典的谈判'化守为攻'"
    },
    "step2": {
      "questionType": "visionary_leadership",
      "meetingType": "战略转型全员大会",
      "prompt": "This is not a retreat — this is a strategic ___. We are not abandoning our vision; we are finding a smarter path to it.",
      "options": ["pivot", "withdrawal", "compromise", "detour"],
      "answer": "pivot",
      "leadershipNote": "pivot 在商务语境中暗含'敏捷应变'的正面内涵，将战略转变重新框定为主动掌控而非被动撤退"
    },
    "step3": {
      "questionType": "idiomatic_business",
      "idiomScenario": "初创公司在发现原有方向不奏效后迅速调整商业模式",
      "informalVer": "We changed our business direction when things weren't working out.",
      "promptCn": "用硅谷创业文化中的标准说法，将上述句子改写为更具商业语感的版本（须包含 pivot）",
      "answer": "Faced with stagnating traction, the founding team made a decisive **pivot** — shifting from a B2C subscription model to an enterprise SaaS solution within a single quarter.",
      "idiomExplanation": "pivot 源自篮球运动（单脚转身换方向），在硅谷创业文化中演变为'战略转型'的标志性词汇，已成为商业媒体和投资圈的核心术语",
      "registerFeature": "pivot 是商务英语高频词，尤其在创投、战略咨询和产品管理场景中，传达'有数据支撑的敏捷决策'的专业感"
    }
  }
]

规则：
1. 每个步骤必须体现母语者水平的策略精确度，干扰项不能太明显错误
2. 谈判模拟须设计真实的利益博弈，最佳选项应体现具体策略（如锚定、框架重构、条件互换）
3. 演说题必须体现领导力语言的感染力，而非普通商务表达
4. 商务隐喻必须有真实的文化来源，不能是生造的表达
5. 只返回 JSON 数组，不要任何其他文字`;
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
    const isProfessional = scenario === "professional";
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
        isProfessional,
        academicDifficulty: isAcademic ? difficulty : null,
        professionalDifficulty: isProfessional ? difficulty : null,
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
