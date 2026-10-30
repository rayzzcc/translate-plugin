import 'react'

// 设置页预览中直接使用注入网页时的自定义元素
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'tp-trans': { class?: string; children?: ReactNode }
      'tp-inner': { children?: ReactNode }
    }
  }
}
