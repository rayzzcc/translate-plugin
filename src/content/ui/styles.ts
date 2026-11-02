// 插件自身 UI（悬浮球、划词卡片、提示等）的样式，运行在 Shadow DOM 中，与网页样式隔离
export const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.tp-ui { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2330; }
button { font: inherit; cursor: pointer; }

/* 悬浮球 */
.ball-wrap { position: fixed; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 6px; transform: translateY(-50%); }
.ball-wrap.right { right: 0; }
.ball-wrap.left { left: 0; }
.ball { position: relative; width: 40px; height: 40px; border-radius: 20px 0 0 20px; background: linear-gradient(135deg,#4f7cff,#7c5cff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 600; box-shadow: 0 4px 14px rgba(79,124,255,.35); cursor: pointer; user-select: none; touch-action: none; opacity: .82; transition: opacity .2s, width .2s; }
.ball-wrap.left .ball { border-radius: 0 20px 20px 0; }
.ball-wrap:hover .ball { opacity: 1; width: 46px; }
.ball.active { background: linear-gradient(135deg,#12b886,#0ca678); box-shadow: 0 4px 14px rgba(18,184,134,.35); }
.ball .spin { position: absolute; inset: 3px; border-radius: 50%; border: 2px solid rgba(255,255,255,.9); border-right-color: transparent; animation: rot .8s linear infinite; display: none; }
.ball.loading .spin { display: block; }
@keyframes rot { to { transform: rotate(360deg); } }
.menu { display: none; flex-direction: column; gap: 6px; }
.ball-wrap:hover .menu { display: flex; }
.menu button { width: 30px; height: 30px; border-radius: 50%; border: none; background: #fff; color: #4f5670; box-shadow: 0 2px 10px rgba(0,0,0,.15); font-size: 13px; display: flex; align-items: center; justify-content: center; padding: 0; }
.menu button:hover { background: #eef2ff; color: #4f7cff; }

/* 提示 */
.toasts { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 2147483647; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
.toast { pointer-events: auto; max-width: 460px; padding: 9px 14px; border-radius: 8px; background: #1f2330; color: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.2); display: flex; gap: 8px; align-items: center; animation: fadein .18s ease; }
.toast.error { background: #c92a2a; }
.toast.success { background: #0ca678; }
.toast .t-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; border-right-color: transparent; animation: rot .8s linear infinite; flex: none; }
@keyframes fadein { from { opacity: 0; transform: translateY(-6px); } }

/* 划词图标与卡片 */
.sel-icon { position: fixed; z-index: 2147483646; user-select: none; }
.sel-actions { display: flex; align-items: center; gap: 5px; }
.sel-actions button { border: 0; width: 30px; height: 30px; padding: 0; border-radius: 50%; background: #5a73e8; color: #fff; font-size: 12px; box-shadow: 0 3px 12px rgba(79,124,255,.28); }
.sel-actions button:hover { background: #4964df; transform: translateY(-1px); }
.sel-actions .sel-translate { width: 25px; height: 25px; background: #fff; color: #737d93; font-size: 12px; border: 1px solid #e2e5ed; box-shadow: 0 2px 8px rgba(40,50,80,.12); }
.sel-actions .sel-translate:hover { color: #5a73e8; background: #fff; }
.sel-actions .sel-ask { background: linear-gradient(135deg,#8b7cf6,#6655df); font-size: 16px; }
.card { position: fixed; z-index: 2147483646; width: 380px; max-width: calc(100vw - 16px); max-height: 70vh; display: flex; flex-direction: column; background: #fff; border-radius: 12px; box-shadow: 0 10px 40px rgba(20,24,40,.22); border: 1px solid #e6e8f0; overflow: hidden; animation: fadein .15s ease; }
.card-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; background: #f6f7fb; border-bottom: 1px solid #eceef5; cursor: move; user-select: none; }
.card-head .title { font-weight: 600; flex: 1; color: #4f5670; font-size: 12px; }
.card-head select { font: inherit; font-size: 12px; border: 1px solid #dfe2ec; border-radius: 6px; padding: 2px 4px; background: #fff; color: #1f2330; }
.icon-btn { border: none; background: transparent; color: #8a90a6; width: 24px; height: 24px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; padding: 0; font-size: 14px; }
.icon-btn:hover { background: #e9ecf5; color: #1f2330; }
.card-src { padding: 10px 14px 0; color: #8a90a6; font-size: 12px; max-height: 76px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.card-body { padding: 10px 14px 12px; font-size: 14px; line-height: 1.65; overflow: auto; white-space: pre-wrap; word-break: break-word; user-select: text; }
.card-body .err { color: #c92a2a; font-size: 13px; }
.card-foot { display: flex; justify-content: flex-end; gap: 6px; padding: 0 10px 10px; }
.btn { border: 1px solid #dfe2ec; background: #fff; color: #4f5670; border-radius: 6px; padding: 3px 10px; font-size: 12px; }
.btn:hover { border-color: #4f7cff; color: #4f7cff; }
.loading-dots { display: inline-flex; gap: 4px; }
.loading-dots i { width: 6px; height: 6px; border-radius: 50%; background: #9aa6ff; animation: dot 1s infinite ease-in-out; }
.loading-dots i:nth-child(2) { animation-delay: .15s; }
.loading-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes dot { 0%,80%,100% { opacity: .3; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

/* 图片解读卡片 */
.img-btn { position: fixed; z-index: 2147483646; padding: 3px 9px; border-radius: 6px; background: rgba(31,35,48,.82); color: #fff; font-size: 12px; cursor: pointer; user-select: none; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.img-btn:hover { background: #4f7cff; }
.img-card { max-height: calc(100vh - 24px); }
.img-tabs { display: flex; gap: 2px; background: #e9ecf5; border-radius: 7px; padding: 2px; }
.img-tabs button { border: none; background: transparent; padding: 2px 9px; border-radius: 5px; font-size: 12px; color: #4f5670; }
.img-tabs button.on { background: #fff; color: #4f7cff; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.img-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.img-scroll { flex: 1; min-height: 60px; overflow: auto; padding: 10px 14px; font-size: 14px; line-height: 1.65; user-select: text; word-break: break-word; }
.img-meta { font-size: 11px; color: #8a90a6; margin-top: 4px; }
.img-meta:empty { display: none; }
.img-ask { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #eceef5; }
.img-ask input { flex: 1; min-width: 0; border: 1px solid #dfe2ec; border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 13px; color: #1f2330; outline: none; background: #fff; }
.img-ask input:focus { border-color: #4f7cff; }
.img-ask input:disabled { background: #f6f7fb; }
.turn-q { margin: 12px 0 8px auto; max-width: 85%; width: fit-content; background: #eef2ff; color: #3b4a8a; padding: 5px 10px; border-radius: 10px 10px 2px 10px; font-size: 13px; white-space: pre-wrap; }
.md p { margin: 0 0 8px; }
.md ul, .md ol { margin: 0 0 8px; padding-left: 20px; }
.md li { margin: 2px 0; }
.md h4 { margin: 8px 0 4px; font-size: 14px; }
.md code { background: #f1f3f8; padding: 0 4px; border-radius: 4px; font-size: 12.5px; }
.md > :last-child { margin-bottom: 0; }
.img-line { margin: 0 0 8px; }
.img-line .src { font-size: 12px; color: #8a90a6; }
.err { color: #c92a2a; font-size: 13px; }
.muted { color: #8a90a6; }

/* 阅读助手 */
.ra-root { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; }
.ra-root button, .ra-root textarea { pointer-events: auto; }
.ra-panel { position: fixed; right: 22px; bottom: 22px; width: min(380px, calc(100vw - 32px)); height: 480px; min-width: 280px; min-height: 260px; max-height: calc(100vh - 44px); display: flex; flex-direction: column; background: rgba(255,255,255,.98); border: 1px solid rgba(219,224,237,.95); border-radius: 18px; box-shadow: 0 18px 55px rgba(35,45,75,.18), 0 2px 8px rgba(35,45,75,.08); overflow: hidden; pointer-events: auto; animation: ra-in .2s ease-out; }
@keyframes ra-in { from { opacity: 0; transform: translateY(10px) scale(.98); } }
.ra-panel[hidden], .ra-fab[hidden] { display: none; }
.ra-resize { position: absolute; right: 1px; bottom: 1px; width: 20px; height: 20px; cursor: nwse-resize; pointer-events: auto; touch-action: none; }
.ra-resize::after { content: ''; position: absolute; right: 5px; bottom: 5px; width: 7px; height: 7px; border-right: 2px solid #c1c6d4; border-bottom: 2px solid #c1c6d4; border-radius: 1px; }
.ra-header { touch-action: none; }
.ra-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 14px 11px 17px; background: #fff; cursor: move; user-select: none; }
.ra-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 650; letter-spacing: .01em; }
.ra-spark { color: #6d5dfc; font-size: 18px; line-height: 1; }
.ra-tools { display: flex; gap: 2px; }
.ra-icon { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #8991a5; font-size: 18px; line-height: 1; }
.ra-icon:hover { background: #f1f3f8; color: #343c54; }
.ra-body { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #fafbfe; border-top: 1px solid #f0f1f6; }
.ra-scroll { position: absolute; inset: 0; overflow-y: auto; padding: 18px 14px; scrollbar-width: thin; scrollbar-color: #dce0eb transparent; }
.ra-welcome { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px 34px 80px; text-align: center; pointer-events: none; }
.ra-welcome-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: #eeedff; color: #6d5dfc; font-size: 18px; font-weight: 600; margin-bottom: 12px; }
.ra-welcome-title { font-size: 15px; font-weight: 600; color: #3a425a; }
.ra-welcome p { margin: 6px 0; font-size: 12.5px; line-height: 1.65; color: #9299aa; }
.ra-actions { position: absolute; left: 0; right: 0; bottom: 18px; display: flex; justify-content: center; flex-wrap: wrap; gap: 7px; padding: 0 12px; }
.ra-chip { border: 1px solid #e1e5ef; background: #fff; border-radius: 16px; padding: 5px 11px; color: #69728a; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.02); }
.ra-chip:hover { border-color: #b7b0ff; color: #6655df; background: #f8f7ff; }
.ra-message { display: flex; gap: 8px; margin-bottom: 15px; animation: fadein .16s ease; }
.ra-message.user { justify-content: flex-end; }
.ra-avatar { flex: none; width: 25px; height: 25px; border-radius: 8px; background: #eeedff; display: grid; place-items: center; margin-top: 2px; }
.ra-avatar .ra-spark, .ra-avatar { color: #6d5dfc; font-size: 13px; }
.ra-bubble { max-width: 88%; font-size: 13.5px; line-height: 1.68; word-break: break-word; user-select: text; }
.ra-message.assistant .ra-bubble { padding: 1px 2px; color: #343c51; }
.ra-message.user .ra-bubble { padding: 8px 12px; border-radius: 14px 14px 4px 14px; background: #eeedff; color: #4c437d; white-space: pre-wrap; font-size: 13px; }
.ra-composer { margin: 10px 12px 5px; padding: 9px 10px 7px; border: 1px solid #dfe3ed; border-radius: 14px; background: #fff; box-shadow: 0 2px 10px rgba(50,60,90,.04); pointer-events: auto; }
.ra-composer:focus-within { border-color: #aaa0ff; box-shadow: 0 0 0 3px rgba(109,93,252,.08); }
.ra-input { display: block; width: 100%; min-height: 44px; max-height: 110px; padding: 0; resize: none; border: 0; outline: 0; background: transparent; color: #30384d; font: 13.5px/1.55 inherit; }
.ra-input::placeholder { color: #a2a9b9; }
.ra-composer-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; }
.ra-context { border: 0; background: transparent; color: #8b93a7; padding: 3px 0; font-size: 11.5px; }
.ra-context:hover { color: #6d5dfc; }
.ra-send { width: 28px; height: 28px; border: 0; border-radius: 9px; background: #6d5dfc; color: #fff; font-size: 17px; line-height: 1; display: grid; place-items: center; }
.ra-send:hover { background: #5d4de9; }
.ra-footnote { text-align: center; color: #b0b5c2; font-size: 10px; padding: 0 0 7px; }
.ra-fab { position: fixed; right: 22px; bottom: 22px; display: flex; align-items: center; gap: 7px; border: 1px solid rgba(255,255,255,.25); border-radius: 22px; background: #37304f; color: #fff; padding: 10px 16px; box-shadow: 0 8px 26px rgba(42,35,74,.25); font-size: 12.5px; }
.ra-fab:hover { background: #494062; }
.ra-error { color: #d64545; font-size: 12px; }
.ra-retry { display: block; border: 0; background: transparent; color: #6d5dfc; padding: 5px 0; font-size: 12px; }
.ra-root .md p { margin: 0 0 9px; }
.ra-root .md ul, .ra-root .md ol { padding-left: 19px; }
@media (max-width: 520px) { .ra-panel { right: 8px; bottom: 8px; height: 65vh; max-height: calc(100vh - 16px); } .ra-fab { right: 12px; bottom: 12px; } }

/* PDF 提示条 */
.pdf-bar { position: fixed; top: 12px; right: 16px; z-index: 2147483646; display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px; background: #fff; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.2); }
.pdf-bar .primary { border: none; background: #4f7cff; color: #fff; border-radius: 6px; padding: 5px 12px; }
.pdf-bar .primary:hover { background: #3d68f0; }
`
