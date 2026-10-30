import { langBase } from '../shared/languages'

const RE = {
  letter: /\p{L}/gu,
  han: /\p{Script=Han}/gu,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  hangul: /\p{Script=Hangul}/gu,
  cyrillic: /\p{Script=Cyrillic}/gu,
  arabic: /\p{Script=Arabic}/gu,
  thai: /\p{Script=Thai}/gu,
  latin: /\p{Script=Latin}/gu,
}

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0

function detectByChrome(text: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.i18n.detectLanguage(text, (r) => {
        const top = r?.languages?.[0]
        resolve(top && (r.isReliable || top.percentage >= 60) ? langBase(top.language) : undefined)
      })
    } catch {
      resolve(undefined)
    }
  })
}

/** 粗略判断一段文字是否已经是目标语言（是则无需翻译） */
export async function isTargetLanguage(text: string, target: string): Promise<boolean> {
  const base = langBase(target)
  const letters = count(RE.letter, text)
  if (!letters) return true
  const ratio = (re: RegExp) => count(re, text) / letters
  switch (base) {
    case 'zh':
      return ratio(RE.han) > 0.6 && count(RE.kana, text) === 0
    case 'ja':
      return count(RE.kana, text) > 0 && ratio(RE.han) + ratio(RE.kana) > 0.6
    case 'ko':
      return ratio(RE.hangul) > 0.5
    case 'ar':
      return ratio(RE.arabic) > 0.6
    case 'th':
      return ratio(RE.thai) > 0.6
    case 'ru':
    case 'uk':
      if (ratio(RE.cyrillic) < 0.6) return false
      break
    default:
      if (ratio(RE.latin) < 0.6) return false
  }
  if (text.length < 20) return false
  return (await detectByChrome(text)) === base
}

/** 检测整页主要语言（返回语言基础代码，如 en / zh / ja） */
export async function detectPageLanguage(): Promise<string | undefined> {
  const sample = (document.body?.innerText || '').slice(0, 4000)
  const detected = sample.length > 30 ? await detectByChrome(sample) : undefined
  if (detected) return detected
  const lang = document.documentElement.lang
  return lang ? langBase(lang) : undefined
}
