import * as Type_TaskConfig from './resource/type/task_config'

type Type_Db_Summary_Info = {
  answer: number
  article: number
  pin: number
  collection: number
  question: number
  author: number
  topic: number
  column: number
}

export interface IElectronAPI {
  'get-task-default-title': (args: { taskId: string; taskType: string }) => Promise<string>
  'get-common-config': () => Promise<Type_TaskConfig.Type_Task_Config>
  'get-zhihu-login-status': () => Promise<{ isLogin: boolean; cookieNameList: string[] }>
  'start-customer-task': (args: { config: Type_TaskConfig.Type_Task_Config }) => Promise<string>
  'zhihu-http-get': (args: { url: string }) => Promise<unknown>
  'open-output-dir': () => Promise<void>
  'open-devtools': () => Promise<void>
  'clear-all-session-storage': () => Promise<boolean>
  'get-db-summary-info': () => Promise<Type_Db_Summary_Info>
  'get-log-content': () => Promise<string>
  'clear-log-content': () => Promise<void>
  'open-js-rpc-window-devtools': () => Promise<void>
  'test-js-rpc-window': () => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}

export {}
