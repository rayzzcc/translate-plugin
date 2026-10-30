import type { Prompts, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'zh-CN',
  providerId: '',
  displayMode: 'bilingual',
  style: {
    theme: 'dashed',
    color: '',
    accentColor: '#6b8afd',
    bgColor: 'rgba(107, 138, 253, 0.14)',
    fontScale: 1,
    customCss: '',
  },
  rules: {
    alwaysSites: [],
    neverSites: [],
    alwaysLangs: [],
    neverLangs: [],
  },
  floatBall: {
    enabled: true,
    disabledSites: [],
    side: 'right',
    top: 62,
  },
  hover: { enabled: true, key: 'Control' },
  selection: { enabled: true, trigger: 'icon' },
  input: { enabled: true, targetLang: 'en', triggerCount: 3 },
  image: { enabled: true, providerId: '', hoverButton: true, minSize: 160, mode: 'explain' },
  video: { enabled: true, showOriginal: true, fontScale: 1 },
  pdf: { autoOpen: false, showOriginal: true },
  advanced: {
    cache: true,
    batchSize: 10,
    batchChars: 2500,
    minTextLength: 2,
    rootMargin: 600,
    excludeSelectors: '',
    pageContext: true,
  },
}

export const DEFAULT_PROMPTS: Prompts = {
  system: `You are a professional translation engine. Translate the user's text into {{to}} accurately, fluently and naturally, following the conventions of native {{to}} speakers.
Rules:
1. Output ONLY the translation. Never add explanations, notes, quotes or prefixes such as "Translation:".
2. Keep line breaks, numbers, URLs, e-mail addresses, code, variables and placeholders unchanged.
3. Keep proper nouns, product names and technical terms in their commonly used form; leave them untranslated if there is no well-known translation.
4. If a piece of text is already in {{to}}, return it unchanged.`,

  single: `{{context}}Translate the following text into {{to}}:

{{text}}`,

  batch: `{{context}}Translate every segment below into {{to}}.
Each segment is wrapped in <seg id="N"></seg>. Return ALL segments in the same order, keeping exactly the same tags and ids, and translate only the content inside the tags. Do not merge, split or skip segments.

{{text}}`,

  subtitle: `{{context}}The segments below are consecutive subtitle lines of a video. Translate each line into {{to}}. Use the surrounding lines as context so that the translation reads naturally, but keep a strict one-to-one correspondence between segments.
Each segment is wrapped in <seg id="N"></seg>. Return ALL segments in the same order, keeping exactly the same tags and ids.

{{text}}`,

  image: `Recognize all readable text in this image and translate it into {{to}}.
Return ONLY a JSON array without markdown code fences. Each item must be {"src": "original text", "dst": "translation"}. Group words into natural lines or paragraphs, ordered from top to bottom and left to right. If the image contains no text, return [].`,

  imageExplainSystem: `You are an expert assistant who explains images on web pages clearly and accurately. Always reply in {{to}}.`,

  imageExplain: `The image above appears on a web page. Here is the context around it:

{{context}}

Using this context, explain the image to the reader in {{to}}:
1. Start with a one-sentence summary of what the image shows.
2. Explain the key information. For charts: trends, notable numbers and comparisons. For diagrams: the components and how they relate. For screenshots: what is being shown. For photos: the relevant subject. Translate important text in the image into {{to}} where helpful.
3. Explain how the image relates to the surrounding text and what the reader should take away from it.

Be concise (usually under 200 words) and use Markdown with short bullet points. Do not repeat the page context verbatim, and do not invent facts that are not supported by the image or the context.`,
}
