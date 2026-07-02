import { createRoot } from 'react-dom/client'
import App from './app'

if (!window.electronAPI) {
  const hint = document.createElement('div')
  hint.style.cssText =
    'padding:24px;font-size:16px;line-height:1.8;color:#c00;background:#fff3f3;border:1px solid #ffccc7;margin:16px;border-radius:8px;'
  hint.innerHTML =
    '<b>当前页面不在 Electron 中运行</b><br/>' +
    '请勿直接在浏览器打开 <code>http://localhost:8080</code>。<br/>' +
    '请使用命令启动：<br/><code>./node_modules/.bin/electron --no-sandbox --disable-gpu --disable-dev-shm-usage dist/index.js --zhihuhelp-debug</code>'
  document.body.prepend(hint)
}

const container = document.getElementById('app')
const root = createRoot(container!)
root.render(<App />)
