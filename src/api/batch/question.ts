import QuestionApi from '~/src/api/single/question'
import lodash from 'lodash'
import BatchFetchAnswer from '~/src/api/batch/answer'
import Base from '~/src/api/batch/base'
import CommonUtil from '~/src/library/util/common'
import MAnswer from '~/src/model/answer'

class BatchFetchQuestion extends Base {
  private getResumeTolerance(expectedCount: number) {
    return Math.max(5, Math.ceil(expectedCount * 0.05))
  }

  private async canSkipQuestionByCache(questionId: string) {
    if (CommonUtil.isResumeFetchMode() === false) {
      return false
    }
    const cachedAnswerList = await MAnswer.asyncGetAnswerListByQuestionIdList([questionId])
    if (cachedAnswerList.length === 0) {
      return false
    }
    const questionInfo = cachedAnswerList[0]?.question
    const expectedAnswerCount = questionInfo?.answer_count ?? 0
    if (expectedAnswerCount <= 0) {
      this.log(`继续上次模式: 问题${questionId}本地已有${cachedAnswerList.length}个回答, 但缺少回答总数记录, 仍会刷新回答列表`)
      return false
    }
    const missingCount = expectedAnswerCount - cachedAnswerList.length
    if (missingCount <= this.getResumeTolerance(expectedAnswerCount)) {
      this.log(
        `继续上次模式: 问题${questionInfo.title}(${questionId})本地已有${cachedAnswerList.length}/${expectedAnswerCount}个回答, 跳过问题信息和回答列表抓取`,
      )
      return true
    }
    this.log(
      `继续上次模式: 问题${questionId}本地只有${cachedAnswerList.length}/${expectedAnswerCount}个回答, 将刷新回答列表并补抓缺失回答`,
    )
    return false
  }

  /**
   * 获取单个问题,并存入数据库中
   * @param questionId
   */
  async fetch(questionId: string) {
    this.log(`准备处理问题${questionId}`)
    if (await this.canSkipQuestionByCache(questionId)) {
      return
    }
    this.log(`准备抓取问题${questionId}`)
    let question = await QuestionApi.asyncGetQuestionInfo(questionId)
    if (lodash.isEmpty(question)) {
      throw new Error(`问题${questionId}抓取失败: 接口返回空数据`)
    }
    let title = question.title
    let answerCount = question.answer_count
    this.log(`问题:${title}(${questionId})信息抓取成功`)
    // question的信息不需要存入数据库, 直接使用answer进行保存即可
    // this.log(`问题:${title}(${questionId})信息成功存入数据库`)
    this.log(`问题${title}(${questionId})下共有${answerCount}个回答`)
    if (CommonUtil.isResumeFetchMode()) {
      const cachedAnswerList = await MAnswer.asyncGetAnswerListByQuestionIdList([questionId])
      this.log(`继续上次模式: 数据库中已有该问题回答${cachedAnswerList.length}个, 后续将自动跳过已有回答详情`)
    }
    this.log(`开始抓取问题${title}(${questionId})下的回答列表`)
    // 首先先获取所有answerId
    let answerIdList: string[] = []
    for (let offset = 0; offset < answerCount; offset = offset + this.fetchLimit) {
      let asyncTaskFunc = async () => {
        let answerList = await QuestionApi.asyncGetAnswerList(questionId, offset, this.fetchLimit)
        for (let answer of answerList) {
          let answerId = `${answer.id}`
          answerIdList.push(answerId)
        }
      }
      CommonUtil.addAsyncTaskFunc({
        asyncTaskFunc,
        needProtect: true
      })
    }
    await CommonUtil.asyncWaitAllTaskComplete({
      needTTL: true
    })
    // 然后集中获取相关回答内容
    let batchFetchAnswer = new BatchFetchAnswer()
    await batchFetchAnswer.fetchListAndSaveToDb(answerIdList)
    this.log(`问题${title}(${questionId})下全部回答抓取完毕`)
  }
}

export default BatchFetchQuestion
