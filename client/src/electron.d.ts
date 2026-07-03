export interface IElectronAPI {
  'get-task-default-title': (args: { taskId: string; taskType: string }) => Promise<string>
  'get-common-config': () => Promise<Record<string, unknown>>
  'get-zhihu-login-status': () => Promise<{ isLogin: boolean; cookieNameList: string[] }>
  'start-customer-task': (args: { config: Record<string, unknown> }) => Promise<string>
  'zhihu-http-get': (args: { url: string }) => Promise<unknown>
  'open-output-dir': () => Promise<void>
  'open-devtools': () => Promise<void>
  'clear-all-session-storage': () => Promise<boolean>
  'get-db-summary-info': () => Promise<unknown>
  'get-log-content': () => Promise<string>
  'clear-log-content': () => Promise<void>
  'open-js-rpc-window-devtools': () => Promise<void>
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI
  }
}

export {}
