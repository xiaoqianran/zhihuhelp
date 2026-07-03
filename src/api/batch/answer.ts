import AnswerApi from '~/src/api/single/answer'
import MAnswer from '~/src/model/answer'
import lodash from 'lodash'
import Base from '~/src/api/batch/base'
import CommonUtil, { SkipProtectedTaskError } from '~/src/library/util/common'

class BatchFetchAnswer extends Base {
  /**
   * 获取单个回答,并存入数据库中
   * @param answerId
   */
  async fetch(answerId: string) {
    this.log(`准备处理回答${answerId}`)
    if (CommonUtil.isResumeFetchMode()) {
      const cachedAnswer = await MAnswer.asyncGetAnswer(answerId)
      if (lodash.isEmpty(cachedAnswer) === false) {
        throw new SkipProtectedTaskError(`回答${answerId}已存在, 继续上次模式下跳过抓取`)
      }
    }
    let answer = await AnswerApi.asyncGetAnswer(answerId)
    if (lodash.isEmpty(answer)) {
      throw new Error(`回答${answerId}抓取失败: 接口返回空数据`)
    }
    let questionId = `${answer.question.id}`
    this.log(`问题${questionId}下的回答${answerId}抓取成功, 存入数据库`)
    await MAnswer.asyncReplaceAnswer(answer)
    this.log(`问题${questionId}下的回答${answerId}成功存入数据库`)
  }
}

export default BatchFetchAnswer
