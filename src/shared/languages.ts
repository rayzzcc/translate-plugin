export interface Language {
  code: string
  /** 界面显示名 */
  label: string
  /** 写进提示词的英文名 */
  english: string
}

export const LANGUAGES: Language[] = [
  { code: 'zh-CN', label: '简体中文', english: 'Simplified Chinese' },
  { code: 'zh-TW', label: '繁體中文', english: 'Traditional Chinese' },
  { code: 'en', label: '英语 English', english: 'English' },
  { code: 'ja', label: '日语 日本語', english: 'Japanese' },
  { code: 'ko', label: '韩语 한국어', english: 'Korean' },
  { code: 'fr', label: '法语 Français', english: 'French' },
  { code: 'de', label: '德语 Deutsch', english: 'German' },
  { code: 'es', label: '西班牙语 Español', english: 'Spanish' },
  { code: 'pt', label: '葡萄牙语 Português', english: 'Portuguese' },
  { code: 'it', label: '意大利语 Italiano', english: 'Italian' },
  { code: 'ru', label: '俄语 Русский', english: 'Russian' },
  { code: 'uk', label: '乌克兰语 Українська', english: 'Ukrainian' },
  { code: 'ar', label: '阿拉伯语 العربية', english: 'Arabic' },
  { code: 'vi', label: '越南语 Tiếng Việt', english: 'Vietnamese' },
  { code: 'th', label: '泰语 ไทย', english: 'Thai' },
  { code: 'id', label: '印尼语 Bahasa Indonesia', english: 'Indonesian' },
  { code: 'tr', label: '土耳其语 Türkçe', english: 'Turkish' },
  { code: 'nl', label: '荷兰语 Nederlands', english: 'Dutch' },
  { code: 'pl', label: '波兰语 Polski', english: 'Polish' },
]

export function langBase(code: string): string {
  return (code || '').split(/[-_]/)[0].toLowerCase()
}

export function findLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES.find((l) => langBase(l.code) === langBase(code))
}

export function langLabel(code: string): string {
  return findLanguage(code)?.label ?? code
}

export function langEnglish(code: string): string {
  return findLanguage(code)?.english ?? code
}
