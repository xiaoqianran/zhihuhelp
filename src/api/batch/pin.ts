import PinApi from '~/src/api/single/pin'
import MPin from '~/src/model/pin'
import Base from '~/src/api/batch/base'
import CommonUtil, { SkipProtectedTaskError } from '~/src/library/util/common'
import lodash from 'lodash'

class BatchFetchPin extends Base {
  async fetch(id: string) {
    this.log(`开始抓取想法:${id}`)
    if (CommonUtil.isResumeFetchMode()) {
      const cachedPin = await MPin.asyncGetPin(id)
      if (lodash.isEmpty(cachedPin) === false) {
        throw new SkipProtectedTaskError(`想法${id}已存在, 继续上次模式下跳过抓取`)
      }
    }
    const pinRecord = await PinApi.asyncGet(id)
    if (lodash.isEmpty(pinRecord)) {
      throw new Error(`想法${id}抓取失败: 接口返回空数据`)
    }
    await MPin.asyncReplacePin(pinRecord)
    this.log(`想法:${id}抓取完毕`)
  }
}

export default BatchFetchPin
