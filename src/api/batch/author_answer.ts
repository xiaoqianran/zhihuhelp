import AuthorApi from '~/src/api/single/author'
import MAuthor from '~/src/model/author'
import Base from '~/src/api/batch/base'
import BatchFetchAnswer from '~/src/api/batch/answer'
import CommonUtil from '~/src/library/util/common'
import lodash from 'lodash'
import MAnswer from '~/src/model/answer'

class BatchFetchAuthorAnswer extends Base {
  private getResumeTolerance(expectedCount: number) {
    return Math.max(5, Math.ceil(expectedCount * 0.05))
  }

  private async canSkipAuthorAnswerByCache(urlToken: string) {
    if (CommonUtil.isResumeFetchMode() === false) {
      return false
    }
    const authorInfo = await MAuthor.asyncGetAuthor(urlToken)
    if (lodash.isEmpty(authorInfo)) {
      return false
    }
    const cachedAnswerList = await MAnswer.asyncGetAnswerListByAuthorUrlToken(urlToken)
    const expectedAnswerCount = authorInfo.answer_count ?? 0
    if (expectedAnswerCount <= 0 || cachedAnswerList.length === 0) {
      return false
    }
    const missingCount = expectedAnswerCount - cachedAnswerList.length
    if (missingCount <= this.getResumeTolerance(expectedAnswerCount)) {
      this.log(
        `继续上次模式: 用户${authorInfo.name}(${urlToken})本地已有${cachedAnswerList.length}/${expectedAnswerCount}个回答, 跳过用户信息和回答列表抓取`,
      )
      return true
    }
    this.log(
      `继续上次模式: 用户${authorInfo.name}(${urlToken})本地只有${cachedAnswerList.length}/${expectedAnswerCount}个回答, 将刷新回答列表并补抓缺失回答`,
    )
    return false
  }

  async fetch(urlToken: string) {
    if (await this.canSkipAuthorAnswerByCache(urlToken)) {
      return
    }
    this.log(`开始抓取用户${urlToken}的数据`)
    this.log(`获取用户信息`)
    const authorInfo = await AuthorApi.asyncGetAutherInfo(urlToken)
    if (lodash.isEmpty(authorInfo)) {
      throw new Error(`用户${urlToken}信息抓取失败: 接口返回空数据`)
    }
    await MAuthor.asyncReplaceAuthor(authorInfo)
    this.log(`用户信息获取完毕`)
    const name = authorInfo.name
    const answerCount = authorInfo.answer_count
    this.log(`用户${name}(${urlToken})共有${answerCount}个回答`)
    this.log(`开始抓取回答列表`)
    this.log(`开始抓取用户${name}(${urlToken})的所有回答id记录,共${answerCount}条`)
    let answetIdList: string[] = []
    for (let offset = 0; offset < answerCount; offset = offset + this.fetchLimit) {
      let asyncTaskFunc = async () => {
        this.log(`准备收集${name}的第${offset}~${offset + this.fetchLimit}条回答id`)
        let answerList = await AuthorApi.asyncGetAutherAnswerList(urlToken, offset, this.fetchLimit)
        for (let answer of answerList) {
          answetIdList.push(`${answer.id}`)
        }
        this.log(`第${offset}~${offset + this.fetchLimit}条回答id抓取完毕`)
      }
      CommonUtil.addAsyncTaskFunc({
        asyncTaskFunc,
        needProtect: true,
      })
    }
    await CommonUtil.asyncWaitAllTaskComplete({
      needTTL: true
    })
    this.log(`开始抓取用户${name}(${urlToken})的所有回答记录,共${answetIdList.length}条`)
    let batchFetchAnswer = new BatchFetchAnswer()
    await batchFetchAnswer.fetchListAndSaveToDb(answetIdList)
    this.log(`用户${name}(${urlToken})的回答记录抓取完毕`)
  }
}

export default BatchFetchAuthorAnswer
