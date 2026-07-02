import { Button } from 'antd'
import { useContext, useEffect, useRef } from 'react'
import * as Consts_Page from '~/src/resource/const/page'
import * as Context from '~/src/page/home/resource/context'

import './index.less'

const Const_Zhihu_Login_Url = 'https://www.zhihu.com/signin'
const Const_Zhihu_User_Agent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const Const_Storage_Key = 'login_msk'

export default () => {
  let { currentTab } = useContext(Context.CurrentTab)
  let isLoginTabActive = currentTab === Consts_Page.Const_Page_登录
  let webviewContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoginTabActive || !webviewContainerRef.current) {
      return
    }

    let webviewEle = document.createElement('webview')
    webviewEle.id = 'zhihu-login'
    webviewEle.setAttribute('src', Const_Zhihu_Login_Url)
    webviewEle.setAttribute('useragent', Const_Zhihu_User_Agent)
    webviewEle.setAttribute('disablewebsecurity', '')
    webviewEle.setAttribute(
      'webpreferences',
      'allowRunningInsecureContent=yes, webSecurity=no, contextIsolation=no'
    )

    let handleNewWindow = (event: Event) => {
      let e = event as Event & { url?: string; preventDefault?: () => void }
      e.preventDefault?.()
      if (e.url) {
        webviewEle.setAttribute('src', e.url)
      }
    }

    let handleWillNavigate = (event: Event) => {
      let e = event as Event & { url?: string }
      console.log('[zhihu-login] navigate => ', e.url)
    }

    webviewEle.addEventListener('new-window', handleNewWindow)
    webviewEle.addEventListener('will-navigate', handleWillNavigate)

    webviewContainerRef.current.innerHTML = ''
    webviewContainerRef.current.appendChild(webviewEle)

    return () => {
      webviewEle.removeEventListener('new-window', handleNewWindow)
      webviewEle.removeEventListener('will-navigate', handleWillNavigate)
      if (webviewContainerRef.current) {
        webviewContainerRef.current.innerHTML = ''
      }
    }
  }, [isLoginTabActive])

  return (
    <div className="login">
      <div className="item">
        <Button
          onClick={() => {
            let webviewEle = document.querySelector('webview#zhihu-login') as any
            console.log('webviewEle => ', webviewEle)
            webviewEle?.openDevTools()
          }}
        >
          打开调试面板
        </Button>
      </div>
      <div className="item webview-container" ref={webviewContainerRef}></div>
    </div>
  )
}
