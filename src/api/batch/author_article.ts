import AuthorApi from '~/src/api/single/author'
import MAuthor from '~/src/model/author'
import BatchFetchArticle from '~/src/api/batch/article'
import Base from '~/src/api/batch/base'
import CommonUtil from '~/src/library/util/common'
import CommonConfig from '~/src/config/common'
import lodash from 'lodash'
import MArticle from '~/src/model/article'

class BatchFetchAuthorArticle extends Base {
  private getResumeTolerance(expectedCount: number) {
    return Math.max(5, Math.ceil(expectedCount * 0.05))
  }

  private async canSkipAuthorArticleByCache(urlToken: string) {
    if (CommonUtil.isResumeFetchMode() === false) {
      return false
    }
    const authorInfo = await MAuthor.asyncGetAuthor(urlToken)
    if (lodash.isEmpty(authorInfo)) {
      return false
    }
    const cachedArticleList = await MArticle.asyncGetArticleListByAuthorUrlToken(urlToken)
    const expectedArticleCount = authorInfo.articles_count ?? 0
    if (expectedArticleCount <= 0 || cachedArticleList.length === 0) {
      return false
    }
    const missingCount = expectedArticleCount - cachedArticleList.length
    if (missingCount <= this.getResumeTolerance(expectedArticleCount)) {
      this.log(
        `继续上次模式: 用户${authorInfo.name}(${urlToken})本地已有${cachedArticleList.length}/${expectedArticleCount}篇文章, 跳过用户信息和文章列表抓取`,
      )
      return true
    }
    this.log(
      `继续上次模式: 用户${authorInfo.name}(${urlToken})本地只有${cachedArticleList.length}/${expectedArticleCount}篇文章, 将刷新文章列表并补抓缺失文章`,
    )
    return false
  }

  async fetch(urlToken: string) {
    if (await this.canSkipAuthorArticleByCache(urlToken)) {
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
    const articleCount = authorInfo.articles_count
    this.log(`用户${name}(${urlToken})共发布了${articleCount}篇文章`)
    this.log(`开始抓取文章列表`)
    let batchFetchArticle = new BatchFetchArticle()
    let articleIdList: string[] = []
    for (let offset = 0; offset < articleCount; offset = offset + this.fetchLimit) {
      let asyncTaskFunc = async () => {
        let authorArticlesList = await AuthorApi.asyncGetAutherArticleList(urlToken, offset, this.fetchLimit)
        for (let authorArticle of authorArticlesList) {
          let articleId = `${authorArticle.id}`
          articleIdList.push(articleId)
        }
        this.log(`用户发表的第${offset}~${offset + this.fetchLimit}篇文章简介获取完毕`)
      }
      CommonUtil.addAsyncTaskFunc({
        asyncTaskFunc,
        needProtect: true,
      })
    }
    await CommonUtil.asyncWaitAllTaskComplete({
      needTTL: true
    })
    this.log(`开始抓取用户${name}(${urlToken})的所有文章详情,共${articleIdList.length}篇`)
    await batchFetchArticle.fetchListAndSaveToDb(articleIdList)
    this.log(`用户${name}(${urlToken})的文章列表抓取完毕`)
  }
}

export default BatchFetchAuthorArticle
