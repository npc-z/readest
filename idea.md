# 渐进式语言脚手架阅读器

## Product Prototype / PRD v0.1

> **状态：Draft / 用于与 AI Agent 进一步讨论**
>
> 本项目暂定名称：`Scaffold Reader`
>
> 核心理念：**不要等学会一门语言之后才开始阅读，而是通过可渐进撤除的语言脚手架，让学习者从一开始就阅读真正感兴趣的内容。**

---

# 1. 产品概述

## 1.1 要解决的问题

语言学习者在初级阶段通常面临一个矛盾：

> **真正想阅读的内容太难，而适合当前水平的内容太无聊。**

传统学习路径通常是：

```text
背单词
    ↓
学习语法
    ↓
分级阅读
    ↓
更多词汇
    ↓
更高级分级阅读
    ↓
尝试原著
    ↓
大量生词
    ↓
回到分级阅读
```

这个过程存在两个问题：

1. 初期需要大量进行脱离语境的词汇记忆；
2. 学习者很长时间无法阅读自己真正感兴趣的内容。

本项目希望改变这一点：

```text
真正感兴趣的原始内容
        ↓
    直接开始阅读
        ↓
遇到超出能力范围的内容
        ↓
提供语言脚手架
        ↓
继续阅读
        ↓
随着能力提升逐渐减少脚手架
        ↓
最终直接阅读原文
```

---

# 2. 核心理念

## 2.1 不是“翻译阅读器”

本产品不是传统的双语阅读器。

传统双语阅读：

```text
English
Chinese
```

其主要目标是：

> 帮助用户理解原文。

本产品的目标是：

> **在帮助用户理解原文的同时，让用户逐渐学会直接理解原文。**

因此辅助信息必须具有：

> **渐进撤除（progressive fading）**

特性。

---

# 3. 核心学习模型

产品采用四级语言脚手架：

```text
Level 0
Original English
       ↓
Level 1
Comprehensible / Simple English
       ↓
Level 2
Word / Phrase Help
       ↓
Level 3
Native-language Translation
```

默认从上往下逐级提供帮助。

也就是说：

> **能不用辅助，就不要提供辅助。**

---

# 4. 四级脚手架

## 4.1 Level 0：Original

显示原始文本。

例如：

> The old man was reluctant to reveal what had happened.

这是最终希望用户能够直接理解的内容。

---

## 4.2 Level 1：Comprehensible English

使用学习者已经能够理解的英语重新表达原文。

例如：

> The old man did not really want to tell us what had happened.

要求：

- 使用更高频的词汇；
- 尽可能保持原始语义；
- 尽量保持原文的逻辑关系；
- 不应该简单粗暴地把复杂句全部拆成儿童句；
- 优先降低 vocabulary difficulty，而不是破坏 syntax；
- 不应该引入原文不存在的信息。

目的：

```text
Unknown English
      ↓
Known English
      ↓
Meaning
```

而不是：

```text
English
      ↓
Chinese
      ↓
Meaning
```

---

# 5. Level 2：Word / Phrase Help

当用户仍然无法理解时，提供局部帮助。

例如：

```text
reluctant
= not willing / not really wanting to do something

reveal
= tell someone something that was unknown or secret
```

注意：

**优先使用英语解释。**

只有用户进一步请求时才显示母语解释。

---

# 6. Level 3：Native-language Translation

作为最后一道保险。

例如：

> 老人不愿意告诉我们发生了什么。

中文翻译不是默认阅读路径，而是：

> **Emergency fallback / 最终辅助。**

---

# 7. 核心 UI

建议采用类似下面的结构：

```text
┌──────────────────────────────────────────────┐
│              The Old Man                    │
│                                              │
│ The old man was reluctant to reveal what     │
│ had happened.                                │
│                                              │
│ [Explain] [Word Help] [Translate]            │
│                                              │
│ ──────────────────────────────────────────── │
│                                              │
│ 需要帮助时才展开：                            │
│                                              │
│ Simple English                               │
│ The old man did not really want to tell      │
│ us what had happened.                        │
│                                              │
│ reluctant                                    │
│ → not willing / not really wanting           │
│                                              │
│ reveal                                       │
│ → tell something that was unknown            │
│                                              │
│ 中文翻译                                     │
│ 老人不愿意告诉我们发生了什么。               │
└──────────────────────────────────────────────┘
```

**默认状态只显示 Original。**

辅助内容通过：

- hover
- click
- keyboard shortcut
- selection
- AI Ask

按需出现。

---

# 8. 推荐阅读流程

## 8.1 第一次阅读

用户首先尝试直接阅读 Original。

```text
Original
    ↓
理解？
```

如果理解：

> 继续阅读。

---

## 8.2 无法理解

用户点击：

> Simple English

系统显示：

```text
Original

↓

Comprehensible English
```

用户重新阅读 Original。

---

## 8.3 局部词汇问题

如果仍然存在问题：

用户点击某个词：

```text
reluctant
```

显示：

```text
reluctant
not willing / not really wanting
```

---

## 8.4 仍然无法理解

用户点击：

> Translate

显示母语翻译。

---

# 9. 一个重要原则：辅助信息不是永久显示

系统应该鼓励：

```text
辅助
 ↓
理解
 ↓
关闭辅助
 ↓
重新阅读 Original
```

而不是：

```text
Original
+
Simple English
+
Word Help
+
Chinese

一直同时显示
```

后者容易形成对辅助信息的依赖。

---

# 10. 渐进式撤除

产品应该允许用户设置：

### Beginner

```text
Original
Simple English
Word Help
Translation
```

### Intermediate

```text
Original
Simple English
Word Help
```

### Advanced

```text
Original
Simple English
```

### Expert

```text
Original
```

最终目标：

> **用户不再需要脚手架。**

---

# 11. AI 的核心职责

AI 不是产品的核心目的。

AI 是：

> **生成和管理语言脚手架的基础设施。**

主要负责：

1. 句子切分；
2. 生成 Comprehensible English；
3. 生成词汇解释；
4. 生成短语解释；
5. 生成语法解释；
6. 生成母语翻译；
7. 根据用户水平控制解释难度；
8. 识别可能的习语、固定搭配；
9. 根据用户历史学习数据调整解释；
10. 生成复习材料。

---

# 12. AI 生成 Simple English 的核心约束

这是整个产品最重要的 Prompt / AI Policy 之一。

AI 不应该：

> “把英文翻译成简单英文。”

而应该：

> **在不改变语义和重要语法关系的前提下，使用学习者更容易理解的英语重新表达。**

例如：

```text
Original:
The scientist conducted an investigation into the incident.

Bad:
The scientist did something about the event.

Good:
The scientist carefully tried to find out what happened.
```

原则：

### 优先替换低频词

```text
conduct an investigation
        ↓
try to find out
```

### 尽量保留语义关系

### 不要加入额外信息

### 不要过度儿童化

### 不要故意改变时态、语气和逻辑关系

---

# 13. 用户水平模型

系统需要一个简单的用户语言能力模型。

初期可以非常简单：

```json
{
  "language": "en",
  "level": "B1",
  "known_words": [],
  "learning_words": [],
  "unknown_words": []
}
```

后续可以逐渐增加：

```json
{
  "vocabulary_size": 3500,
  "cefr": "B1",
  "reading_level": "B1",
  "known_words": {},
  "weak_words": {},
  "known_phrases": {},
  "reading_history": {}
}
```

---

# 14. 不应该只根据“词汇量”判断难度

文本难度至少应该考虑：

```text
Vocabulary
Grammar
Sentence length
Idioms
Rare expressions
Domain knowledge
Cultural knowledge
Named entities
```

例如：

```text
词汇简单
+
语法复杂
```

依然可能很难。

反过来：

```text
词汇稍难
+
语法简单
+
上下文非常明确
```

可能非常容易。

---

# 15. 文本切分

文章中的 Hamiltonian 2.0 建议：

> 每段尽量不超过约 15 个词。

产品可以采用类似策略，但不要固定为 15。

推荐：

```text
sentence segmentation
        ↓
semantic chunking
        ↓
UI width adaptation
```

优先保持：

- 完整语义；
- 完整从句；
- 固定搭配；
- 不破坏代词指代；
- 不破坏上下文。

例如不要机械切：

```text
Although he was tired /
he continued working.
```

应该根据语义决定展示方式。

---

# 16. Phrase-first，而不是 Word-first

产品应该重点支持：

> **词组 / chunk**

而不仅仅是单词。

例如：

```text
look forward to
```

应该被视为一个学习单位。

而不是：

```text
look
forward
to
```

因为语言理解大量依赖：

- collocation
- phrasal verbs
- idioms
- fixed expressions
- grammatical chunks

---

# 17. 用户交互

建议支持：

### 点击单词

```text
reveal
```

显示：

```text
reveal

Simple English:
to tell someone something they did not know

中文：
揭示；透露
```

---

### 点击短语

```text
run out of
```

显示：

```text
run out of

Simple English:
to have no more of something

Example:
We ran out of time.
```

---

### 选中句子

显示：

```text
Explain
Simplify
Translate
Grammar
```

---

# 18. “解释”与“翻译”必须区分

这是产品设计上的重要原则。

### Explain

目标：

> 帮助用户理解英语。

### Simplify

目标：

> 用更容易的英语表达。

### Translate

目标：

> 将语义转换成母语。

### Grammar

目标：

> 解释语言结构。

四者不应该混为一谈。

---

# 19. 阅读模式

MVP 建议支持三种模式。

## Mode A：Pure

```text
Original only
```

适合已经比较熟练的用户。

---

## Mode B：Scaffold

```text
Original
↓
按需 Simple English
↓
按需 Word Help
↓
按需 Translation
```

**默认模式。**

---

## Mode C：Study

主动显示：

```text
Original
Simple English
Word/Phrase
Translation
Grammar
```

适合精读。

---

# 20. 阅读与学习的闭环

阅读过程中产生的数据应该被保存。

例如用户频繁查询：

```text
reluctant
```

系统记录：

```json
{
  "word": "reluctant",
  "lookup_count": 4,
  "contexts": 4,
  "last_seen": "...",
  "status": "learning"
}
```

当用户再次阅读时：

```text
reluctant
```

可能不再自动显示解释。

让用户尝试回忆。

---

# 21. 与 Spaced Repetition 集成

阅读产生的学习数据可以进入 SRS。

但是：

> **不要把所有遇到的词自动变成 Anki 卡片。**

否则最终又会退化成：

```text
阅读
 ↓
生成 100 个单词
 ↓
Anki
 ↓
痛苦
```

应该只选择：

- 高频词；
- 多次遇到；
- 用户主动查询；
- 用户明确标记；
- 对当前学习阶段重要的词。

---

# 22. 一个词的学习生命周期

例如：

```text
第一次遇到
↓
查看 Simple English
↓
继续阅读
↓
第二次遇到
↓
不显示解释
↓
用户主动查看
↓
第三次遇到
↓
能够直接理解
↓
Known
```

这比单纯：

```text
看到 → 背下来
```

更接近真实阅读中的词汇习得。

---

# 23. 重复阅读

产品应该鼓励重复阅读。

例如：

```text
Day 1
完整辅助

Day 2
减少辅助

Day 3
Original only

Day 7
再次阅读
```

系统可以自动生成：

> “建议重新阅读这篇文章。”

---

# 24. 用户可以导入真正想读的内容

这是产品区别于普通语言学习 App 的核心。

MVP 可以支持：

```text
TXT
EPUB
HTML
PDF
URL
Copy & Paste
```

后续：

```text
Kindle
Browser Extension
RSS
YouTube subtitles
Local books
```

---

# 25. 最核心的用户故事

### User Story 1

> 我英语只有 B1，但我想读一本原版小说。

用户导入小说。

系统：

```text
分析文本
↓
建立句子
↓
生成辅助信息
↓
开始阅读
```

用户不需要先把英语学到 C1。

---

### User Story 2

> 我看到一个不认识的词。

点击词语。

系统优先给：

```text
Simple English
```

而不是直接给中文。

---

### User Story 3

> 我还是看不懂。

点击：

```text
Translate
```

显示中文。

---

### User Story 4

> 我读了几章以后感觉自己已经能看懂了。

切换：

```text
Scaffold → Pure
```

---

# 26. MVP

第一版本不要做得过大。

建议 MVP 只实现：

```text
1. 导入文本
2. 文本分句
3. Original 阅读
4. AI Simple English
5. 点击词汇解释
6. 中文翻译
7. 阅读进度
8. 用户水平设置
9. 简单的词汇历史
```

暂时不要实现：

```text
复杂 SRS
社交
排行榜
游戏化
复杂 CEFR 测试
语音识别
完整课程系统
```

产品第一阶段应该验证的不是：

> “我们能不能做一个完整语言学习平台？”

而是：

> **“用户是否真的愿意用这种方式持续阅读超过自己当前水平的内容？”**

---

# 27. MVP 最重要的验证指标

不要首先关注：

```text
注册人数
```

应该关注：

### Reading Session

用户一次阅读持续多久。

### Completion

文章完成率。

### Scaffold Usage

用户使用：

```text
Simple English
Word Help
Translation
```

的比例。

### Scaffold Reduction

同一篇内容中，用户是否逐渐减少辅助。

### Retention

用户是否第二天继续阅读。

### Voluntary Reading

用户是否主动导入新的内容。

---

# 28. 一个非常关键的成功指标

可以定义：

> **Scaffold Dependency Ratio**

例如：

第一次：

```text
100 sentences
70 次需要辅助
```

依赖率：

```text
70%
```

再次阅读：

```text
100 sentences
35 次需要辅助
```

依赖率：

```text
35%
```

最终：

```text
100 sentences
5 次需要辅助
```

依赖率：

```text
5%
```

如果能够看到这种趋势：

> **同一用户对同类文本的辅助需求逐渐下降**

这比“背了多少单词”更能证明产品正在实现目标。

---

# 29. 核心产品原则

## Principle 1

> **Read what you want to read.**

不要强迫用户先读无聊的教材。

---

## Principle 2

> **Understand first, explain second.**

先尝试理解，再提供帮助。

---

## Principle 3

> **English before native language.**

优先使用目标语言解释。

---

## Principle 4

> **Scaffolding should fade.**

脚手架应该逐渐消失。

---

## Principle 5

> **Context before flashcards.**

优先让词汇在真实语境中出现。

---

## Principle 6

> **Chunks before isolated words.**

优先学习词组和语言块。

---

## Principle 7

> **AI is a scaffold generator, not the teacher.**

AI 的主要作用是动态生成辅助信息，而不是替代学习过程。

---

# 30. 一个理想的最终体验

用户打开一本真正感兴趣的英文书。

例如：

```text
The Hobbit
```

虽然他的英语只有 B1。

系统不告诉他：

> “你的英语水平不足，建议先学习 3000 个词。”

而是直接：

```text
开始阅读
```

遇到：

> reluctant

用户点击。

系统告诉他：

```text
not willing / not really wanting to
```

他继续阅读。

遇到复杂句：

```text
Simple English
```

他看懂了。

仍然不懂：

```text
Word Help
```

再不懂：

```text
Chinese
```

几天以后，他重新阅读同样的内容。

原本：

```text
Original
↓
Simple English
↓
Word Help
↓
Chinese
```

逐渐变成：

```text
Original
↓
Simple English
```

最终：

```text
Original
```

再过一段时间：

> 他已经不再需要这个软件提供的“拐杖”。

这应该是产品最终追求的状态。

---

# 31. 产品一句话定位

> **让你不用等到“学会一门语言”，就可以开始阅读你真正想读的东西。**

英文可以暂定为：

> **Read what you love, before you're ready.**

或者：

> **Don't learn first. Read first.**

---

# 32. 后续与 AI Agent 讨论时需要重点解决的问题

下一阶段建议重点讨论以下问题，而不是立即开始编码：

### A. Simple English 如何控制难度？

例如：

```text
A2 → A2 explanation
B1 → A2/B1 explanation
B2 → B1 explanation
```

---

### B. 如何判断一个词用户是否“认识”？

不能简单根据词汇表判断。

需要结合：

```text
查询次数
上下文
阅读行为
SRS
用户主动反馈
```

---

### C. 如何防止 AI 生成错误解释？

需要：

```text
原文约束
词典/词汇数据库
LLM structured output
validation
```

---

### D. 如何生成高质量逐词/短语对应？

尤其需要处理：

```text
phrasal verbs
idioms
multi-word expressions
polysemy
inflection
articles
prepositions
```

---

### E. 如何自动确定 Sentence Chunk？

不能简单：

```text
每 15 个词切一次
```

而应该进行：

```text
syntactic parsing
+
semantic chunking
```

---

### F. 如何处理文学作品？

文学文本与教材不同：

```text
metaphor
archaic language
unusual syntax
narrative voice
cultural references
```

AI 简化时尤其容易损失文学意义。

因此应该允许：

> **Original 永远是最高优先级。**

---

### G. 如何从“阅读工具”逐渐变成“学习系统”？

可能的演化路线：

```text
MVP
阅读器
 ↓
AI Scaffolding
 ↓
Vocabulary Memory
 ↓
SRS
 ↓
Listening
 ↓
Shadowing
 ↓
Writing
 ↓
完整语言学习系统
```

但不应该在 MVP 阶段同时实现这些功能。

---

# 33. 当前版本的核心假设

本产品目前建立在以下假设之上：

> **H1：兴趣驱动的真实阅读比强制阅读无聊的分级材料更容易维持长期学习动力。**

> **H2：目标语言内部的 Simple English 脚手架能够降低阅读难度，同时减少对母语翻译的依赖。**

> **H3：按需提供辅助比永久显示中英双语更有利于逐渐形成 Original → Meaning 的直接映射。**

> **H4：重复阅读同一内容，并逐渐撤除脚手架，可以促进语言自动化。**

> **H5：AI 可以以足够低的成本，为任意文本动态生成个性化语言脚手架。**

这些都是**产品假设，而不是已经被产品验证的事实**。

后续开发应该围绕这些假设进行验证。

---

# 34. 非目标

本项目不是：

- Duolingo 的替代品；
- 传统词典；
- 普通双语电子书；
- AI 翻译器；
- 单纯的 Anki 前端；
- 课程平台；
- 以考试成绩为第一目标的学习系统。

核心定位始终是：

> **Language Scaffolded Reading**

即：

> **带有动态语言脚手架的真实内容阅读。**

---

# 35. 最重要的产品哲学

整个项目可以归结为：

```text
                 ┌───────────────┐
                 │   Original    │
                 │     Text      │
                 └───────┬───────┘
                         │
                    不理解？
                         │
                         ▼
                 ┌───────────────┐
                 │    Simple     │
                 │    English    │
                 └───────┬───────┘
                         │
                    仍不理解？
                         │
                         ▼
                 ┌───────────────┐
                 │ Word / Phrase │
                 │     Help      │
                 └───────┬───────┘
                         │
                    仍不理解？
                         │
                         ▼
                 ┌───────────────┐
                 │    Native     │
                 │  Translation  │
                 └───────────────┘

                         ↓

              逐渐减少上层辅助

                         ↓

                 ┌───────────────┐
                 │    Original   │
                 │      ↓        │
                 │    Meaning    │
                 └───────────────┘
```

**最终产品不是让用户永远依赖脚手架，而是帮助用户摆脱脚手架。**

我建议你下一步**不要马上让 Agent 开始写代码**。先让它针对这份 v0.1 做一次“反向评审”，尤其挑战三个核心问题：

1. **Simple English 是否真的比中文翻译更适合长期语言习得？**
2. **怎样自动控制 Simple English 的难度，避免“用难词解释难词”？**
3. **这个产品与现有的 Readlang、LingQ、Lute、Language Reactor 等工具到底有什么本质区别？**

第三点尤其重要：**你的想法有明显的产品价值，但“AI + 双语阅读 + 点击查词”本身并不是新东西。真正可能形成差异化的是“目标语言内部脚手架 + 按需辅助 + 脚手架逐渐撤除 + 基于阅读行为的学习闭环”。**
