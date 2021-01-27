import { EVT } from './EVT'
import { pageType } from './PageType'
import { API } from './API'
import { settings } from './setting/Settings'
import { ArtworkData, NovelData } from './CrawlResult.d'
import { filter } from './filter/Filter'

// 当 Pixiv 会员使用按热门度排序搜索时，进行优化
// 优化的原理：当会员使用热门度排序时，Pixiv 返回的数据是按收藏数量从高到低排序的。（但不是严格一致，经常有少量作品顺序不对）
// 假如会员用户在下载器里设置了收藏数量大于 10000，那么当查找到小于 10000 收藏的作品时，就可以考虑停止搜索，因为后面的作品都是收藏数量低于 10000 的了
class VipSearchOptimize {
  constructor() {
    this.bindEvents()
  }

  // 在哪些页面上启用
  private readonly enablePageType: number[] = [
    5, // 插画、漫画搜索页面
  ]
  // 小说搜索页面不需要优化，因为列表数据中包含了每个作品的收藏数

  // 只有会员才能使用的排序方式（按热门度排序）
  private readonly vipOrders: string[] = [
    'popular_d',
    'popular_male_d',
    'popular_female_d',
  ]
  // popular_d 受全站欢迎
  // popular_male_d 受男性欢迎
  // popular_female_d 受女性欢迎

  // 是否对这次抓取使用优化策略
  private vipSearchOptimize = false

  private filterFailed = 0 // 连续检查失败的数量。在检查作品是否满足收藏条件时，如果满足就将此计数清零；如果不满足就自增
  private readonly checkNumber = 30 // 连续多少个作品未达到要求时，停止抓取。这是一个猜测值
  // 设置 checkNumber 的原因：Pixiv 按热门度排序返回的数据其实并不是严格按照收藏数量排序的。所以设置一个数字作为处理这个情况的手段：连续多少个作品都不满足要求时，认为后续都是不满足要求的

  private bindEvents() {
    // 启动抓取时设置是否启用优化策略
    window.addEventListener(EVT.list.crawlStart, () => {
      this.vipSearchOptimize = this.setVipOptimize()
    })

    // 抓取完毕时重置状态
    window.addEventListener(EVT.list.crawlFinish, () => {
      this.reset()
    })
  }

  private reset() {
    this.vipSearchOptimize = false
    this.filterFailed = 0
  }

  // 指示是否停止抓取作品
  public async stopCrawl(data: NovelData | ArtworkData, ajaxThread: number) {
    // 如果未启用会员搜索优化，或者没有设置收藏数量要求，则不停止抓取
    if (!this.vipSearchOptimize || !settings.BMKNumSwitch) {
      return false
    }

    // 连续多少个作品没有达到要求，则停止抓取
    if (this.filterFailed >= this.checkNumber) {
      return true
    }

    // 判断收藏数量是否不符合要求
    const check = await filter.check({
      bookmarkCount: data.body.bookmarkCount,
    })

    if (!check) {
      this.filterFailed++
    } else {
      this.filterFailed = 0
    }

    return this.filterFailed >= this.checkNumber
  }

  // 设置是否启用优化策略
  private setVipOptimize() {
    // 判断页面类型
    if (!this.enablePageType.includes(pageType.type)) {
      return false
    }

    // 判断是否是会员
    if (!this.isVip()) {
      return false
    }

    // 判断 order 方式
    const order = API.getURLSearchField(window.location.href, 'order')
    // 无排序方式
    if (!order) {
      return false
    }

    const vipOrder = this.vipOrders.includes(order)
    // 不是按热门度排序
    if (!vipOrder) {
      return false
    }

    // 按热门度排序
    // 判断是否启用了收藏数设置，如果是，则启用会员搜索优化
    return settings.BMKNumSwitch
  }

  private isVip() {
    // 在 body 的一个 script 标签里包含有当前用户是否是会员的信息
    // premium: 'yes'
    // premium: 'no'
    const test = document.body.innerHTML.match(/premium: '(\w+)'/)
    if (test && test.length > 1) {
      return test[1] === 'yes'
    }

    return false
  }
}

const vipSearchOptimize = new VipSearchOptimize()
export { vipSearchOptimize }