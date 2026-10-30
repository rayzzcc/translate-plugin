import type { Settings } from './types'

/** 根据用户样式设置生成注入页面的 CSS（主题类本身在 public/content.css 中） */
export function buildDynamicCss(style: Settings['style']): string {
  const rules = [
    `:root{--tp-accent:${style.accentColor || '#6b8afd'};--tp-bg:${style.bgColor || 'rgba(107,138,253,.14)'};--tp-scale:${style.fontScale || 1};}`,
  ]
  if (style.color) rules.push(`tp-trans tp-inner{color:${style.color};}`)
  if (style.customCss) rules.push(style.customCss)
  return rules.join('\n')
}

export const THEMES: { value: Settings['style']['theme']; label: string }[] = [
  { value: 'none', label: '无样式' },
  { value: 'dashed', label: '虚线下划线' },
  { value: 'dotted', label: '点状下划线' },
  { value: 'wavy', label: '波浪线' },
  { value: 'highlight', label: '背景高亮' },
  { value: 'marker', label: '马克笔' },
  { value: 'italic', label: '斜体' },
  { value: 'bold', label: '加粗' },
  { value: 'weak', label: '弱化' },
  { value: 'blur', label: '模糊（悬停显示）' },
  { value: 'quote', label: '引用块' },
  { value: 'card', label: '卡片' },
]
