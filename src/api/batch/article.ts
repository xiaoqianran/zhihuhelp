import ArticleApi from '~/src/api/single/article'
import MArticle from '~/src/model/article'
import lodash from 'lodash'
import Base from '~/src/api/batch/base'
import CommonUtil, { SkipProtectedTaskError } from '~/src/library/util/common'

class BatchFetchArticle extends Base {
  /**
   * 获取单个回答,并存入数据库中
   * @param id
   */
  async fetch(id: string) {
    this.log(`准备抓取文章${id}`)
    if (CommonUtil.isResumeFetchMode()) {
      const cachedArticle = await MArticle.asyncGetArticle(id)
      if (lodash.isEmpty(cachedArticle) === false) {
        throw new SkipProtectedTaskError(`文章${id}已存在, 继续上次模式下跳过抓取`)
      }
    }
    let article = await ArticleApi.asyncGetArticle(id as unknown as number)
    if (lodash.isEmpty(article)) {
      throw new Error(`文章${id}抓取失败: 接口返回空数据`)
    }
    this.log(`文章${id}抓取成功, 存入数据库`)
    await MArticle.asyncReplaceArticle(article)
    this.log(`文章${id}成功存入数据库`)
  }
}

export default BatchFetchArticle
