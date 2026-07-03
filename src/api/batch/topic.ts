import TopicApi from '~/src/api/single/topic'
import MTopic from '~/src/model/topic'
import Base from '~/src/api/batch/base'
import CommonUtil from '~/src/library/util/common'
import BatchFetchAnswer from '~/src/api/batch/answer'
import lodash from 'lodash'

class BatchFetchTopic extends Base {
  private getResumeTolerance(expectedCount: number) {
    return Math.max(5, Math.ceil(expectedCount * 0.05))
  }

  private async canSkipTopicByCache(id: string) {
    if (CommonUtil.isResumeFetchMode() === false) {
      return false
    }
    const topicInfo = await MTopic.asyncGetTopicInfo(id)
    if (lodash.isEmpty(topicInfo)) {
      return false
    }
    const cachedAnswerIdList = await MTopic.asyncGetAnswerIdList(id)
    const expectedAnswerCount = topicInfo.best_answers_count ?? 0
    if (expectedAnswerCount <= 0 || cachedAnswerIdList.length === 0) {
      return false
    }
    const missingCount = expectedAnswerCount - cachedAnswerIdList.length
    if (missingCount <= this.getResumeTolerance(expectedAnswerCount)) {
      this.log(
        `继续上次模式: 话题${topicInfo.name}(${id})本地已有${cachedAnswerIdList.length}/${expectedAnswerCount}个精华回答记录, 跳过话题信息和精华回答列表抓取`,
      )
      return true
    }
    this.log(
      `继续上次模式: 话题${topicInfo.name}(${id})本地只有${cachedAnswerIdList.length}/${expectedAnswerCount}个精华回答记录, 将刷新精华回答列表并补抓缺失回答`,
    )
    return false
  }

  async fetch(id: string) {
    if (await this.canSkipTopicByCache(id)) {
      return
    }
    this.log(`开始抓取话题${id}的精华回答`)
    this.log(`获取话题信息`)
    const topicInfo = await TopicApi.asyncGetTopicInfo(id)
    if (lodash.isEmpty(topicInfo)) {
      throw new Error(`话题${id}信息抓取失败: 接口返回空数据`)
    }
    await MTopic.asyncReplaceTopicInfo(topicInfo)
    let baseAnswer = topicInfo.best_answers_count
    this.log(`话题${topicInfo.name}(${topicInfo.id})信息获取完毕, 共有精华回答${baseAnswer}个`)

    let answerIdList: string[] = []
    let batchFetchAnswer = new BatchFetchAnswer()
    this.log(`开始抓取话题精华回答列表`)
    for (let offset = 0; offset < baseAnswer; offset = offset + this.fetchLimit) {
      let asyncTaskFunc = async () => {
        let answerList = await TopicApi.asyncGetAnswerList(id, offset, this.fetchLimit)
        for (let answer of answerList) {
          // 传递给外部
          answerIdList.push(`${answer.id}`)
          await MTopic.asyncReplaceTopicAnswer(id, answer)
        }
        this.log(`列表中第${offset}~${offset + answerList.length}条精华回答摘要抓取完毕`)
      }
      CommonUtil.addAsyncTaskFunc({
        asyncTaskFunc,
        needProtect: true
      })
    }
    await CommonUtil.asyncWaitAllTaskComplete({
      needTTL: true
    })
    this.log(`全部话题精华回答列表抓取完毕`)

    this.log(`开始抓取话题${topicInfo.name}(${topicInfo.id})的下所有精华回答,共${answerIdList.length}条`)
    await batchFetchAnswer.fetchListAndSaveToDb(answerIdList)
    this.log(`话题${topicInfo.name}(${topicInfo.id})下所有精华回答抓取完毕`)
  }
}

export default BatchFetchTopic
