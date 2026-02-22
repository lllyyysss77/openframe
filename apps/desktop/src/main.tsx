import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const hashHistory = createHashHistory()
const router = createRouter({ routeTree, history: hashHistory })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function init() {
  // 从 SQLite 恢复主题，避免渲染前闪烁
  try {
    const rows = await window.settingsAPI.getAll()
    const theme = rows.find((r) => r.key === 'theme')?.value
    if (theme && theme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  } catch {
    // 数据库未就绪时忽略，使用系统默认主题
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  )
}

init()

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
