# Readest

Readest is a cross-platform EPUB reader (Next.js + Tauri + Turso/SQLite). The explainer effort adds language-scaffolded reading: an AI "讲解" (Explanation) for passages in a foreign-language book, cached per book and browsable in a library view. The four-tier method itself (简单版 → 词句帮助 → 语法要点 → 母语译文, progressive) is called the "language scaffold" concept, but the feature name is Explainer (讲解).

## Language

**Explanation**:
An AI-generated, per-passage set of help tiers for a learner reading a book in a foreign language: a simple restatement in L, word/phrase notes, grammar notes, and a native-language translation, presented as a four-tier cascade. Distinct from readest's Translate feature (L→M one-shot): the explanation is L-first and linguistic. Feature name: Explainer (讲解, UI label "Explain").
_Avoid_: Translate, Translation, Bilingual reader, Scaffold Explanation (keep "language scaffold" for the method concept only)

**L**:
The language of the passage — the learner's foreign/target language being read (v0: English books first). The simple restatement and notes are in L. User-configurable in the explainer settings; falls back to the book's metadata language, else 'auto' (the model detects it).
_Avoid_: Target language, source language (in translator contexts "target" points the other way)

**M**:
The learner's mother tongue, the final fallback tier of an explanation. User-configurable in the explainer settings; falls back to the app UI language snapshot taken at generation time.
_Avoid_: Destination, UI language (only as origin, not as concept)

**Simple**:
The passage rewritten in L per the policy: high-frequency vocabulary, preserving meaning and important syntax (tense/negation/logic), plain-not-childish, never adding information absent from the original.
_Avoid_: Simplified English, paraphrase (it's a restatement, L-internal)

**Note**:
One annotated learning unit (a word, or a multi-word chunk: phrase/idiom — collocations and fixed expressions count as phrases) with its L definition (meaningL), an optional example, and an optional M gloss. Notes appear in passage order; an empty note list is legitimate.
_Avoid_: Term, annotation, explanation entry

**Grammar Note**:
One entry of the grammar tier: the exact tricky structure in the passage (structure), explained in L with plain words (noteL), with an optional M gloss (noteM) when noteL would be as hard as the structure itself. At most two entries per passage; omitted when the syntax is unremarkable.
_Avoid_: Syntax note, structure explanation

**Native Translation**:
The full fluent rendering of the passage into M, the last tier of the cascade and the emergency fallback.
_Avoid_: Translation (reserved for the Translate feature)
