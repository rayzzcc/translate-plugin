import { callBg } from '../shared/messages'
import type { SelectionAnchor } from '../shared/types'

/** 避免划词模块与助手 UI 相互引用 */
export function askAboutSelection(anchor?: SelectionAnchor) {
  callBg({ type: 'tabBroadcast', msg: { type: 'open-assistant', anchor } }).catch(() => {})
}
