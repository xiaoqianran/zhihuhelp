import ColumnApi from '~/src/api/single/column'
import MColumn from '~/src/model/column'
import Base from '~/src/api/batch/base'
import CommonUtil from '~/src/library/util/common'
import BatchFetchArticle from '~/src/api/batch/article'
import Logger from '~/src/library/logger'
import lodash from 'lodash'
import MArticle from '~/src/model/article'

class BatchFetchColumn extends Base {
  private getResumeTolerance(expectedCount: number) {
    return Math.max(5, Math.ceil(expectedCount * 0.05))
  }

  private async canSkipColumnByCache(id: string) {
    if (CommonUtil.isResumeFetchMode() === false) {
      return false
    }
    const columnInfo = await MColumn.asyncGetColumnInfo(id)
    if (lodash.isEmpty(columnInfo)) {
      return false
    }
    const cachedArticleList = await MArticle.asyncGetArticleListByColumnId(id)
    const expectedArticleCount = columnInfo.articles_count ?? 0
    if (expectedArticleCount <= 0 || cachedArticleList.length === 0) {
      return false
    }
    const missingCount = expectedArticleCount - cachedArticleList.length
    if (missingCount <= this.getResumeTolerance(expectedArticleCount)) {
      this.log(
        `继续上次模式: 专栏${columnInfo.title}(${id})本地已有${cachedArticleList.length}/${expectedArticleCount}篇文章, 跳过专栏信息和文章列表抓取`,
      )
      return true
    }
    this.log(
      `继续上次模式: 专栏${columnInfo.title}(${id})本地只有${cachedArticleList.length}/${expectedArticleCount}篇文章, 将刷新文章列表并补抓缺失文章`,
    )
    return false
  }

  async fetch(id: string) {
    if (await this.canSkipColumnByCache(id)) {
      return
    }
    this.log(`开始抓取专栏${id}的数据`)
    this.log(`获取专栏信息`)
    const columnInfo = await ColumnApi.asyncGetColumnInfo(id)
    if (lodash.isEmpty(columnInfo)) {
      throw new Error(`专栏${id}信息抓取失败: 接口返回空数据`)
    }
    await MColumn.asyncReplaceColumnInfo(columnInfo)
    this.log(`专栏信息获取完毕`)
    const title = columnInfo.title
    const articleCount = columnInfo.articles_count
    let columnTitle = `${title}(${columnInfo.id})`
    this.log(`专栏${columnTitle}下共有${articleCount}篇文章`)
    this.log(`开始抓取文章概要列表`)
    let articleIdList: string[] = []
    let batchFetchArticle = new BatchFetchArticle()
    for (let offset = 0; offset < articleCount; offset = offset + this.fetchLimit) {
      let asyncTaskFunc = async () => {
        let articleExcerptList = await ColumnApi.asyncGetArticleExcerptList(id, offset, this.fetchLimit)
        for (let articleExcerpt of articleExcerptList) {
          articleIdList.push(`${articleExcerpt.id}`)
        }
        this.log(`专栏${columnTitle}下中第${offset}~${offset + articleExcerptList.length}篇文章id抓取完毕`)
      }

      CommonUtil.addAsyncTaskFunc({
        asyncTaskFunc,
        needProtect: true
      })
    }
    await CommonUtil.asyncWaitAllTaskComplete({
      needTTL: true
    })
    this.log(`专栏${columnTitle}下全部文章id抓取完毕`)

    this.log(`开始抓取专栏${columnTitle}下所有文章,共${articleIdList.length}条`)
    await batchFetchArticle.fetchListAndSaveToDb(articleIdList)
    this.log(`专栏${columnTitle}下所有文章抓取完毕`)
  }
}

export default BatchFetchColumn
