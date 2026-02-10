export interface WordEntry {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string[];
  definitions: { pos: string; meaning: string; meaningCn: string }[];
  examples: { context: string; sentence: string; translation: string }[];
  relatedWords: { type: string; words: string[] }[];
  tags: string[];
  difficulty: "基础" | "进阶" | "高级";
  savedAt?: string;
  notes?: string;
  category?: string;
}

export interface CorpusItem {
  id: string;
  type: "单词" | "固定搭配" | "语法点" | "优美句式";
  content: string;
  meaning: string;
  tags: string[];
  difficulty: "基础" | "进阶" | "高级";
  category: string;
  savedAt: string;
  reviewCount: number;
  mastery: number;
}

export interface ReviewQuestion {
  id: string;
  type: "fill-blank" | "translate";
  prompt: string;
  answer: string;
  options?: string[];
  relatedWord: string;
}

export const mockWords: Record<string, WordEntry> = {
  subtle: {
    id: "1",
    word: "Subtle",
    phonetic: "/ˈsʌt.əl/",
    partOfSpeech: ["adj."],
    definitions: [
      { pos: "adj.", meaning: "Not immediately obvious or noticeable; delicate or faint", meaningCn: "微妙的；精妙的；不易察觉的" },
      { pos: "adj.", meaning: "Making use of clever and indirect methods to achieve something", meaningCn: "巧妙的；狡猾的" },
    ],
    examples: [
      { context: "文学描述", sentence: "There was a subtle shift in her expression that only those who knew her well could detect.", translation: "她的表情发生了一种微妙的变化，只有熟悉她的人才能察觉。" },
      { context: "学术写作", sentence: "The author draws a subtle distinction between cultural assimilation and integration.", translation: "作者对文化同化和融合做出了精妙的区分。" },
      { context: "日常对话", sentence: "That's not very subtle — everyone can tell you're trying to change the subject.", translation: "你这也太明显了——谁都看得出来你想换话题。" },
    ],
    relatedWords: [
      { type: "近义词", words: ["Nuanced", "Delicate", "Understated", "Refined"] },
      { type: "反义词", words: ["Obvious", "Blatant", "Overt", "Conspicuous"] },
      { type: "形近词", words: ["Shuttle", "Subtitle", "Sublet"] },
    ],
    tags: ["形容词", "文学描述", "心理活动"],
    difficulty: "进阶",
  },
  ameliorate: {
    id: "2",
    word: "Ameliorate",
    phonetic: "/əˈmiː.li.ə.reɪt/",
    partOfSpeech: ["v."],
    definitions: [
      { pos: "v.", meaning: "To make something bad or unsatisfactory better; to improve", meaningCn: "改善；改良；使变好" },
    ],
    examples: [
      { context: "学术写作", sentence: "The new policy aims to ameliorate the living conditions of low-income families.", translation: "新政策旨在改善低收入家庭的生活条件。" },
      { context: "新闻报道", sentence: "International aid was sent to ameliorate the effects of the drought.", translation: "国际援助被送来以缓解干旱的影响。" },
      { context: "职场表达", sentence: "We need to ameliorate the workflow to reduce bottlenecks.", translation: "我们需要改善工作流程以减少瓶颈。" },
    ],
    relatedWords: [
      { type: "近义词", words: ["Alleviate", "Improve", "Enhance", "Mitigate"] },
      { type: "反义词", words: ["Worsen", "Deteriorate", "Aggravate", "Exacerbate"] },
      { type: "词根关联", words: ["Meliorate", "Amelioration", "Ameliorative"] },
    ],
    tags: ["动词", "学术用语", "正式表达"],
    difficulty: "高级",
  },
  alleviate: {
    id: "3",
    word: "Alleviate",
    phonetic: "/əˈliː.vi.eɪt/",
    partOfSpeech: ["v."],
    definitions: [
      { pos: "v.", meaning: "To make suffering, deficiency, or a problem less severe", meaningCn: "减轻；缓解；缓和" },
    ],
    examples: [
      { context: "医学语境", sentence: "This medication can alleviate the symptoms but not cure the disease.", translation: "这种药物可以减轻症状，但无法治愈疾病。" },
      { context: "社会议题", sentence: "Community programs help alleviate poverty in urban areas.", translation: "社区项目有助于缓解城市贫困问题。" },
    ],
    relatedWords: [
      { type: "近义词", words: ["Ameliorate", "Mitigate", "Relieve", "Ease"] },
      { type: "反义词", words: ["Aggravate", "Intensify", "Worsen"] },
    ],
    tags: ["动词", "正式表达", "医学语境"],
    difficulty: "进阶",
  },
};

export const mockCorpus: CorpusItem[] = [
  { id: "c1", type: "单词", content: "Subtle", meaning: "微妙的；精妙的", tags: ["形容词", "文学描述"], difficulty: "进阶", category: "文学评论", savedAt: "2024-01-15", reviewCount: 5, mastery: 72 },
  { id: "c2", type: "固定搭配", content: "In the wake of", meaning: "在……之后；紧随……而来", tags: ["介词短语", "新闻"], difficulty: "进阶", category: "新闻翻译", savedAt: "2024-01-14", reviewCount: 3, mastery: 45 },
  { id: "c3", type: "单词", content: "Ameliorate", meaning: "改善；改良", tags: ["动词", "学术用语"], difficulty: "高级", category: "经济", savedAt: "2024-01-13", reviewCount: 2, mastery: 30 },
  { id: "c4", type: "语法点", content: "虚拟语气倒装", meaning: "Were it not for... / Had I known...", tags: ["语法", "高级句式"], difficulty: "高级", category: "学术写作", savedAt: "2024-01-12", reviewCount: 4, mastery: 60 },
  { id: "c5", type: "优美句式", content: "It is not the strongest that survives, but the most adaptable.", meaning: "生存下来的不是最强壮的，而是最能适应变化的。", tags: ["名言", "翻译素材"], difficulty: "进阶", category: "文学评论", savedAt: "2024-01-11", reviewCount: 6, mastery: 85 },
  { id: "c6", type: "单词", content: "Alleviate", meaning: "减轻；缓解", tags: ["动词", "正式表达"], difficulty: "进阶", category: "经济", savedAt: "2024-01-10", reviewCount: 3, mastery: 55 },
  { id: "c7", type: "固定搭配", content: "By virtue of", meaning: "凭借；由于", tags: ["介词短语", "正式"], difficulty: "进阶", category: "学术写作", savedAt: "2024-01-09", reviewCount: 7, mastery: 90 },
  { id: "c8", type: "单词", content: "Ephemeral", meaning: "短暂的；转瞬即逝的", tags: ["形容词", "文学"], difficulty: "高级", category: "文学评论", savedAt: "2024-01-08", reviewCount: 1, mastery: 20 },
];

export const mockReviewQuestions: ReviewQuestion[] = [
  {
    id: "r1", type: "fill-blank",
    prompt: "The government introduced measures to ___ the housing crisis.",
    answer: "ameliorate",
    options: ["ameliorate", "deteriorate", "exaggerate", "elaborate"],
    relatedWord: "Ameliorate",
  },
  {
    id: "r2", type: "translate",
    prompt: "请翻译：她的表情发生了一种微妙的变化。",
    answer: "There was a subtle change in her expression.",
    relatedWord: "Subtle",
  },
  {
    id: "r3", type: "fill-blank",
    prompt: "This medication can ___ the pain but cannot eliminate it entirely.",
    answer: "alleviate",
    options: ["alleviate", "aggregate", "allocate", "alternate"],
    relatedWord: "Alleviate",
  },
  {
    id: "r4", type: "translate",
    prompt: "请翻译：社区项目有助于缓解城市贫困问题。",
    answer: "Community programs help alleviate poverty in urban areas.",
    relatedWord: "Alleviate",
  },
];

export const searchSuggestions = [
  "Subtle", "Ameliorate", "Alleviate", "Ephemeral", "Ubiquitous",
  "Paradigm", "Nuance", "Pragmatic", "Resilient", "Ambiguous"
];
