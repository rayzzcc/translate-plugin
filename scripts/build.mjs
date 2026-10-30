// 构建脚本：页面（popup / options / pdf）用 Vite 多页构建，
// background / content / youtube-hook 分别以 lib 模式打成单文件。
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIcons } from './icons.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'dist')
const watch = process.argv.includes('--watch')
const r = (p) => resolve(root, p)

function ensureConfig() {
  const cfg = r('config.jsonc')
  if (!fs.existsSync(cfg)) {
    fs.copyFileSync(r('config.example.jsonc'), cfg)
    console.log('[build] 已根据 config.example.jsonc 生成 config.jsonc，请在其中填写 API Key')
  }
}

function copyStatic() {
  fs.mkdirSync(outDir, { recursive: true })
  fs.copyFileSync(r('manifest.json'), resolve(outDir, 'manifest.json'))
  fs.copyFileSync(r('config.jsonc'), resolve(outDir, 'config.jsonc'))
  writeIcons(resolve(outDir, 'icons'))
}

const define = { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') }

async function buildPages() {
  await build({
    configFile: false,
    root: r('src/pages'),
    base: '/',
    publicDir: r('public'),
    plugins: [react()],
    define,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'esnext',
      sourcemap: watch ? 'inline' : false,
      minify: !watch,
      chunkSizeWarningLimit: 4000,
      watch: watch ? {} : null,
      rollupOptions: {
        input: {
          popup: r('src/pages/popup.html'),
          options: r('src/pages/options.html'),
          pdf: r('src/pages/pdf.html'),
        },
      },
    },
  })
}

async function buildScript(entry, name, format) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    define,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      sourcemap: watch ? 'inline' : false,
      minify: !watch,
      watch: watch ? {} : null,
      lib: {
        entry: r(entry),
        formats: [format],
        name: name.replace(/-/g, '_'),
        fileName: () => `${name}.js`,
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  })
}

async function main() {
  ensureConfig()
  if (!watch) fs.rmSync(outDir, { recursive: true, force: true })
  await buildPages()
  await buildScript('src/background/index.ts', 'background', 'es')
  await buildScript('src/content/index.ts', 'content', 'iife')
  await buildScript('src/content/youtube-hook.ts', 'youtube-hook', 'iife')
  copyStatic()

  if (watch) {
    for (const f of ['manifest.json', 'config.jsonc']) {
      fs.watchFile(r(f), { interval: 500 }, () => {
        copyStatic()
        console.log(`[build] ${f} 已同步到 dist/`)
      })
    }
    console.log('[build] 监听中，修改代码或 config.jsonc 会自动同步到 dist/')
  } else {
    console.log('[build] 完成：在 chrome://extensions 中“加载已解压的扩展程序”，选择 dist 目录')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
