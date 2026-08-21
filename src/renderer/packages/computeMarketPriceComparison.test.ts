import { describe, expect, it } from 'vitest'
import {
  areComputeMarketQuotesStrictlyComparable,
  buildComputeMarketMonotoneSvgPath,
  COMPUTE_MARKET_DEFAULT_REGION,
  COMPUTE_MARKET_DEFAULT_RENTAL_TERM,
  type ComputeMarketComparisonPoint,
  type ComputeMarketComparisonQuote,
  compareGetDeployingAndVastPrices,
  deriveComputeMarketRegions,
  deriveComputeMarketRentalTerms,
  filterComputeMarketPricePoints,
  getComputeMarketDisplayCnyPrice,
  getComputeMarketExactSpecKey,
  groupComputeMarketPricePoints,
  groupComputeMarketPricePointsBySource,
  mergeComputeMarketPricePoints,
  sortComputeMarketPricePoints,
} from './computeMarketPriceComparison'

function createPoint(overrides: Partial<ComputeMarketComparisonPoint> = {}): ComputeMarketComparisonPoint {
  return {
    source: 'VAST_AI',
    gpuModel: 'A100-PCIE-40GB',
    quoteType: 'MEDIAN_AVAILABLE',
    priceUsdPerGpuHour: 0.5,
    priceCnyPerGpuHour: 3.6,
    cardHoursPerGpuHour: 3.6,
    sampleSize: 8,
    sampledAt: '2026-08-20T01:00:00.000Z',
    ...overrides,
  }
}

function createQuote(overrides: Partial<ComputeMarketComparisonQuote> = {}): ComputeMarketComparisonQuote {
  return {
    ...createPoint(),
    sourceLabel: 'Vast.ai',
    sourceUrl: 'https://vast.ai/pricing',
    status: 'OK',
    ...overrides,
  }
}

describe('compute market price comparison', () => {
  it('为行情点生成经过所有采样点且不越界的单调平滑路径', () => {
    const points = [
      { x: 0, y: 80 },
      { x: 20, y: 40 },
      { x: 55, y: 50 },
      { x: 90, y: 10 },
      { x: 120, y: 10 },
    ]
    const path = buildComputeMarketMonotoneSvgPath(points)
    const commands = path.match(/[MLC][^MLC]*/g) ?? []

    expect(commands).toHaveLength(points.length)
    expect(commands[0]).toBe('M 0 80 ')
    expect(path).not.toMatch(/NaN|Infinity/)

    commands.slice(1).forEach((command, index) => {
      const values = command.slice(1).trim().split(/\s+/).map(Number)
      const start = points[index]
      const end = points[index + 1]
      const minY = Math.min(start.y, end.y)
      const maxY = Math.max(start.y, end.y)
      expect(values[1]).toBeGreaterThanOrEqual(minY)
      expect(values[1]).toBeLessThanOrEqual(maxY)
      expect(values[3]).toBeGreaterThanOrEqual(minY)
      expect(values[3]).toBeLessThanOrEqual(maxY)
      expect(values.slice(-2)).toEqual([end.x, end.y])
    })
  })

  it('在单点、非法点或非递增时间轴下安全处理', () => {
    expect(buildComputeMarketMonotoneSvgPath([])).toBe('')
    expect(buildComputeMarketMonotoneSvgPath([{ x: 4, y: 7 }])).toBe('M 4 7')
    expect(
      buildComputeMarketMonotoneSvgPath([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 5, y: 3 },
      ])
    ).toBe('M 0 1 L 0 2 L 5 3')
    expect(
      buildComputeMarketMonotoneSvgPath([
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
      ])
    ).toBe('')
  })

  it('优先使用人民币价格，缺失时再按美元汇率折算', () => {
    expect(getComputeMarketDisplayCnyPrice({ priceCnyPerGpuHour: 3.8, priceUsdPerGpuHour: 0.5 }, 7.2)).toBe(3.8)
    expect(getComputeMarketDisplayCnyPrice({ priceUsdPerGpuHour: 0.5 }, 7.2)).toBeCloseTo(3.6)
    expect(getComputeMarketDisplayCnyPrice({ priceUsdPerGpuHour: 0.5 })).toBeUndefined()
    expect(getComputeMarketDisplayCnyPrice({ priceCnyPerGpuHour: Number.NaN }, 7.2)).toBeUndefined()
    expect(getComputeMarketDisplayCnyPrice({ priceCnyPerGpuHour: null as unknown as number }, 7.2)).toBeUndefined()
    expect(getComputeMarketDisplayCnyPrice({ priceUsdPerGpuHour: '' as unknown as number }, 7.2)).toBeUndefined()
  })

  it('按型号、租期和地区筛选，并兼容旧后端缺少租期和地区的点', () => {
    const points = [
      createPoint({ sampledAt: '2026-08-20T03:00:00.000Z' }),
      createPoint({ regionCode: 'cn-payg', rentalTerm: 'PAYG' }),
      createPoint({ regionCode: 'cn-north', regionLabel: '华北', rentalTerm: 'DAILY' }),
      createPoint({ gpuModel: 'V100-32GB', regionCode: 'cn-north', rentalTerm: 'DAILY' }),
      createPoint({
        gpuModel: 'A100 PCIE 40 GB',
        canonicalModel: 'A100-PCIE-40GB',
        regionCode: 'cn-east',
        rentalTerm: 'DAILY',
      }),
    ]

    expect(
      filterComputeMarketPricePoints(points, {
        gpuModel: ' a100-pcie-40gb ',
        rentalTerm: 'daily',
        regions: ['CN-NORTH'],
      })
    ).toEqual([points[2]])
    expect(
      filterComputeMarketPricePoints(points, {
        gpuModel: 'A100-PCIE-40GB',
        rentalTerm: 'DAILY',
        regions: ['cn-east'],
      })
    ).toEqual([points[4]])
    expect(
      filterComputeMarketPricePoints(points, {
        gpuModel: 'A100-PCIE-40GB',
        rentalTerm: COMPUTE_MARKET_DEFAULT_RENTAL_TERM,
        regions: [COMPUTE_MARKET_DEFAULT_REGION],
      })
    ).toEqual([points[0]])
    expect(filterComputeMarketPricePoints([], {})).toEqual([])
    expect(
      filterComputeMarketPricePoints(points, {
        gpuModel: 'A100-PCIE-40GB',
        rentalTerm: 'HOURLY',
        regions: ['cn-payg'],
      })
    ).toEqual([points[1]])
  })

  it('按时间稳定排序且不修改输入数组', () => {
    const firstAtSameTime = createPoint({ regionCode: 'a', sampledAt: '2026-08-20T02:00:00.000Z' })
    const secondAtSameTime = createPoint({ regionCode: 'b', sampledAt: '2026-08-20T02:00:00.000Z' })
    const early = createPoint({ sampledAt: '2026-08-20T01:00:00.000Z' })
    const points = [firstAtSameTime, secondAtSameTime, early]

    expect(sortComputeMarketPricePoints(points)).toEqual([early, firstAtSameTime, secondAtSameTime])
    expect(points).toEqual([firstAtSameTime, secondAtSameTime, early])
  })

  it('保留正常、过期与旧格式历史点，过滤不可用状态', () => {
    const ok = createPoint({ status: 'OK' })
    const stale = createPoint({ status: 'STALE', sampledAt: '2026-08-20T02:00:00.000Z' })
    const legacy = createPoint({ status: undefined, sampledAt: '2026-08-20T03:00:00.000Z' })
    const unavailable = createPoint({ status: 'UNAVAILABLE', sampledAt: '2026-08-20T04:00:00.000Z' })
    const noQuote = createPoint({ status: 'NO_QUOTE', sampledAt: '2026-08-20T05:00:00.000Z' })

    expect(filterComputeMarketPricePoints([ok, stale, legacy, unavailable, noQuote], {})).toEqual([ok, stale, legacy])
  })

  it('按来源、地区、租期和报价类型分组，组内按时间排序', () => {
    const points = [
      createPoint({ regionCode: 'cn-north', sampledAt: '2026-08-20T02:00:00.000Z' }),
      createPoint({ regionCode: 'cn-north', sampledAt: '2026-08-20T01:00:00.000Z' }),
      createPoint({ regionCode: 'cn-east' }),
      createPoint({ regionCode: 'cn-north', rentalTerm: 'DAILY' }),
      createPoint({ regionCode: 'cn-north', quoteType: 'OFFICIAL_LIST' }),
      createPoint({ source: 'AKAMAI', regionCode: 'cn-north' }),
    ]

    const series = groupComputeMarketPricePoints(points)
    expect(series).toHaveLength(5)
    expect(
      series
        .find(
          (item) =>
            item.source === 'VAST_AI' &&
            item.regionCode === 'cn-north' &&
            item.rentalTerm === 'HOURLY' &&
            item.quoteType === 'MEDIAN_AVAILABLE'
        )
        ?.points.slice(0, 2)
    ).toEqual([points[1], points[0]])
  })

  it('每个网站只生成一条线，按优先报价口径跨地区选择人民币最低价', () => {
    const points = [
      createPoint({
        source: 'VAST_AI',
        sourceLabel: 'Vast.ai',
        canonicalModel: 'A100-PCIE-40GB',
        vramMiB: 40960,
        formFactor: 'PCIE',
        quoteType: 'MIN_AVAILABLE',
        regionCode: 'us-cheap',
        regionLabel: '廉价区',
        priceCnyPerGpuHour: 3.2,
        sampledAt: '2026-08-20T01:00:05.000Z',
      }),
      createPoint({
        source: 'VAST_AI',
        sourceLabel: 'Vast.ai',
        canonicalModel: 'A100-PCIE-40GB',
        vramMiB: 40960,
        formFactor: 'PCIE',
        quoteType: 'VERIFIED_MIN',
        regionCode: 'us-west',
        regionLabel: '美国西部',
        priceCnyPerGpuHour: 4.6,
        priceCondition: '已验证实例',
        sampledAt: '2026-08-20T01:00:15.000Z',
      }),
      createPoint({
        source: 'VAST_AI',
        sourceLabel: 'Vast.ai',
        canonicalModel: 'A100-PCIE-40GB',
        vramMiB: 40960,
        formFactor: 'PCIE',
        quoteType: 'VERIFIED_MIN',
        regionCode: 'us-east',
        regionLabel: '美国东部',
        priceCnyPerGpuHour: 4.2,
        priceCondition: '代表点条件被保留',
        sampledAt: '2026-08-20T01:00:35.000Z',
      }),
      createPoint({
        source: 'VAST_AI',
        sourceLabel: 'Vast.ai',
        canonicalModel: 'A100-PCIE-40GB',
        vramMiB: 40960,
        formFactor: 'PCIE',
        quoteType: 'MIN_AVAILABLE',
        regionCode: 'us-west',
        priceCnyPerGpuHour: 3.1,
        sampledAt: '2026-08-20T01:01:05.000Z',
      }),
    ]

    const inputSnapshot = structuredClone(points)
    const series = groupComputeMarketPricePointsBySource(points)

    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({
      source: 'VAST_AI',
      canonicalModel: 'A100-PCIE-40GB',
      vramMiB: 40960,
      formFactor: 'PCIE',
      rentalTerm: 'HOURLY',
    })
    expect(series[0].points).toHaveLength(2)
    expect(series[0].points[0]).toMatchObject({
      quoteType: 'VERIFIED_MIN',
      regionCode: 'us-east',
      priceCnyPerGpuHour: 4.2,
      priceCondition: '代表点条件被保留',
      aggregatedRegionCount: 2,
      aggregatedRegionCodes: ['us-east', 'us-west'],
      aggregationSampleCount: 2,
      aggregationBasis: 'LOWEST_AVAILABLE_CNY_PER_GPU_HOUR',
      aggregationBucketStartedAt: '2026-08-20T01:00:00.000Z',
      aggregationBucketMilliseconds: 60_000,
    })
    expect(series[0].points[0].aggregationLabel).toContain('已验证最低价口径')
    expect(series[0].points[0].aggregationLabel).toContain('2 个地区')
    expect(series[0].points[0].aggregationLabel).toContain('2 个采样')
    expect(series[0].points[1]).toMatchObject({ quoteType: 'MIN_AVAILABLE', priceCnyPerGpuHour: 3.1 })
    expect(points).toEqual(inputSnapshot)
  })

  it.each([
    {
      name: '小时',
      bucketMilliseconds: 60 * 60_000,
      points: [
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'east',
          priceCnyPerGpuHour: 4.8,
          sampledAt: '2026-08-20T01:45:00.000Z',
        }),
        createPoint({
          quoteType: 'MIN_AVAILABLE',
          regionCode: 'ignored-fallback',
          priceCnyPerGpuHour: 1,
          sampledAt: '2026-08-20T01:25:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'east',
          priceCnyPerGpuHour: 4.9,
          sampledAt: '2026-08-20T01:10:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'west',
          priceCnyPerGpuHour: 4.5,
          sampledAt: '2026-08-20T01:20:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'east',
          priceCnyPerGpuHour: 4.7,
          sampledAt: '2026-08-20T02:05:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'west',
          priceCnyPerGpuHour: 4.3,
          sampledAt: '2026-08-20T02:55:00.000Z',
        }),
      ],
      expected: [
        {
          aggregationBucketStartedAt: '2026-08-20T01:00:00.000Z',
          priceCnyPerGpuHour: 4.5,
          aggregatedRegionCount: 2,
          aggregationSampleCount: 3,
        },
        {
          aggregationBucketStartedAt: '2026-08-20T02:00:00.000Z',
          priceCnyPerGpuHour: 4.3,
          aggregatedRegionCount: 2,
          aggregationSampleCount: 2,
        },
      ],
    },
    {
      name: '天',
      bucketMilliseconds: 24 * 60 * 60_000,
      points: [
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'day-two-west',
          priceCnyPerGpuHour: 4.1,
          sampledAt: '2026-08-21T22:00:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'day-one-east',
          priceCnyPerGpuHour: 5.2,
          sampledAt: '2026-08-20T23:00:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'day-two-east',
          priceCnyPerGpuHour: 4.4,
          sampledAt: '2026-08-21T01:00:00.000Z',
        }),
        createPoint({
          quoteType: 'VERIFIED_MIN',
          regionCode: 'day-one-west',
          priceCnyPerGpuHour: 4.9,
          sampledAt: '2026-08-20T02:00:00.000Z',
        }),
      ],
      expected: [
        {
          aggregationBucketStartedAt: '2026-08-20T00:00:00.000Z',
          priceCnyPerGpuHour: 4.9,
          aggregatedRegionCount: 2,
          aggregationSampleCount: 2,
        },
        {
          aggregationBucketStartedAt: '2026-08-21T00:00:00.000Z',
          priceCnyPerGpuHour: 4.1,
          aggregatedRegionCount: 2,
          aggregationSampleCount: 2,
        },
      ],
    },
  ])('按$name时间桶聚合同一来源并保留区间最低价、真实样本数和跨桶顺序', ({ bucketMilliseconds, points, expected }) => {
    const [series] = groupComputeMarketPricePointsBySource(points, undefined, { bucketMilliseconds })

    expect(series.points).toHaveLength(2)
    expect(series.points.map((point) => point.aggregationBucketStartedAt)).toEqual(
      expected.map((point) => point.aggregationBucketStartedAt)
    )
    expect(series.points).toMatchObject(expected)
    expect(series.points[0].aggregationLabel).toContain(`${expected[0].aggregationSampleCount} 个采样`)
  })

  it('AutoDL 优先公开挂牌价，缺失时使用会员价，并按汇率纳入美元报价', () => {
    const points = [
      createPoint({
        source: 'AUTODL',
        canonicalModel: 'A100-PCIE-40GB',
        quoteType: 'MEMBER_PRICE',
        regionCode: 'cn-member',
        priceCnyPerGpuHour: 2.8,
        sampledAt: '2026-08-20T01:00:05.000Z',
      }),
      createPoint({
        source: 'AUTODL',
        canonicalModel: 'A100-PCIE-40GB',
        quoteType: 'OFFICIAL_LIST',
        regionCode: 'cn-list',
        priceCnyPerGpuHour: 3.6,
        sampledAt: '2026-08-20T01:00:15.000Z',
      }),
      createPoint({
        source: 'AUTODL',
        canonicalModel: 'A100-PCIE-40GB',
        quoteType: 'MEMBER_PRICE',
        regionCode: 'cn-cny',
        priceCnyPerGpuHour: 4,
        sampledAt: '2026-08-20T01:01:05.000Z',
      }),
      createPoint({
        source: 'AUTODL',
        canonicalModel: 'A100-PCIE-40GB',
        quoteType: 'MEMBER_PRICE',
        regionCode: 'cn-usd',
        priceCnyPerGpuHour: undefined,
        priceUsdPerGpuHour: 0.5,
        sampledAt: '2026-08-20T01:01:15.000Z',
      }),
    ]

    const withExchangeRate = groupComputeMarketPricePointsBySource(points, 7)
    expect(withExchangeRate).toHaveLength(1)
    expect(withExchangeRate[0].points[0]).toMatchObject({
      quoteType: 'OFFICIAL_LIST',
      regionCode: 'cn-list',
      priceCnyPerGpuHour: 3.6,
      aggregatedRegionCount: 1,
    })
    expect(withExchangeRate[0].points[1]).toMatchObject({
      quoteType: 'MEMBER_PRICE',
      regionCode: 'cn-usd',
      priceCnyPerGpuHour: 3.5,
      aggregatedRegionCount: 2,
    })

    const withoutExchangeRate = groupComputeMarketPricePointsBySource(points)
    expect(withoutExchangeRate[0].points[1]).toMatchObject({
      regionCode: 'cn-cny',
      priceCnyPerGpuHour: 4,
      aggregatedRegionCount: 1,
    })
  })

  it('时间桶内先选实时状态，再选报价口径，过期低价不会压过实时回退口径', () => {
    const points = [
      createPoint({
        status: 'STALE',
        quoteType: 'VERIFIED_MIN',
        regionCode: 'stale-verified',
        priceCnyPerGpuHour: 1,
        sampledAt: '2026-08-20T01:00:05.000Z',
      }),
      createPoint({
        status: 'OK',
        quoteType: 'MIN_AVAILABLE',
        regionCode: 'fresh-fallback',
        priceCnyPerGpuHour: 5,
        sampledAt: '2026-08-20T01:00:15.000Z',
      }),
      createPoint({
        status: 'STALE',
        quoteType: 'VERIFIED_MIN',
        regionCode: 'stale-second-bucket',
        priceCnyPerGpuHour: 1.1,
        sampledAt: '2026-08-20T01:01:05.000Z',
      }),
      createPoint({
        status: undefined,
        quoteType: 'MIN_AVAILABLE',
        regionCode: 'legacy-second-bucket',
        priceCnyPerGpuHour: 4.8,
        sampledAt: '2026-08-20T01:01:15.000Z',
      }),
    ]

    const [series] = groupComputeMarketPricePointsBySource(points)
    expect(series.points[0]).toMatchObject({
      status: 'OK',
      quoteType: 'MIN_AVAILABLE',
      regionCode: 'fresh-fallback',
      priceCnyPerGpuHour: 5,
    })
    expect(series.points[1]).toMatchObject({
      status: undefined,
      quoteType: 'MIN_AVAILABLE',
      regionCode: 'legacy-second-bucket',
      priceCnyPerGpuHour: 4.8,
    })
  })

  it('网站、精确规格和租期不同仍分线，但地区、来源别名与报价类型不会分线', () => {
    const base = {
      canonicalModel: 'A100',
      modelKey: 'nvidia-a100',
      vramMiB: 40960,
      formFactor: 'PCIE',
    } as const
    const points = [
      createPoint({ ...base, sourceModel: 'A100 PCIE', regionCode: 'a', quoteType: 'VERIFIED_MIN' }),
      createPoint({ ...base, sourceModel: 'Tesla A100', regionCode: 'b', quoteType: 'MIN_AVAILABLE' }),
      createPoint({ ...base, vramMiB: 81920 }),
      createPoint({ ...base, formFactor: 'SXM' }),
      createPoint({ ...base, rentalTerm: 'DAILY' }),
      createPoint({ ...base, source: 'AUTODL' }),
      createPoint({
        ...base,
        status: 'UNAVAILABLE',
        regionCode: 'invalid-status',
        priceCnyPerGpuHour: 0.01,
      }),
      createPoint({
        ...base,
        sampledAt: 'not-a-date',
        regionCode: 'invalid-date',
        priceCnyPerGpuHour: 0.01,
      }),
    ]

    const series = groupComputeMarketPricePointsBySource(points, undefined, { bucketMilliseconds: 30_000 })
    expect(series).toHaveLength(5)
    const baseSeries = series.find(
      (item) =>
        item.source === 'VAST_AI' &&
        item.vramMiB === 40960 &&
        item.formFactor === 'PCIE' &&
        item.rentalTerm === 'HOURLY'
    )
    expect(baseSeries?.points).toHaveLength(1)
    expect(baseSeries?.points[0]).toMatchObject({
      quoteType: 'VERIFIED_MIN',
      aggregatedRegionCount: 1,
      aggregationBucketMilliseconds: 30_000,
    })
  })

  it('不会把不同显存、板型或来源型号连接成同一条曲线', () => {
    const points = [
      createPoint({ modelKey: 'nvidia-a100', sourceModel: 'A100 PCIE', vramMiB: 40960, formFactor: 'PCIE' }),
      createPoint({ modelKey: 'nvidia-a100', sourceModel: 'A100 PCIE', vramMiB: 81920, formFactor: 'PCIE' }),
      createPoint({ modelKey: 'nvidia-a100', sourceModel: 'A100 SXM', vramMiB: 81920, formFactor: 'SXM' }),
    ]

    expect(groupComputeMarketPricePoints(points)).toHaveLength(3)
  })

  it('合并历史与实时点时用含地区和租期的复合键去重，多地区同时间不会丢点', () => {
    const northHistory = createPoint({ regionCode: 'cn-north', regionLabel: '华北', priceCnyPerGpuHour: 3.2 })
    const eastHistory = createPoint({ regionCode: 'cn-east', regionLabel: '华东', priceCnyPerGpuHour: 3.4 })
    const dailyHistory = createPoint({
      regionCode: 'cn-north',
      regionLabel: '华北',
      rentalTerm: 'DAILY',
      priceCnyPerGpuHour: 3.1,
    })
    const liveNorth = createQuote({
      regionCode: 'cn-north',
      regionLabel: '华北',
      priceCnyPerGpuHour: 3,
      sampleSize: 12,
    })

    const merged = mergeComputeMarketPricePoints([northHistory, eastHistory, dailyHistory], [liveNorth])
    expect(merged).toHaveLength(3)
    expect(merged.find((point) => point.regionCode === 'cn-north' && !point.rentalTerm)?.priceCnyPerGpuHour).toBe(3)
    expect(merged.find((point) => point.regionCode === 'cn-east')?.priceCnyPerGpuHour).toBe(3.4)
    expect(merged.find((point) => point.rentalTerm === 'DAILY')?.priceCnyPerGpuHour).toBe(3.1)

    const currencyOnlyQuotes = mergeComputeMarketPricePoints(
      [],
      [
        createQuote({ sampledAt: '2026-08-20T02:00:00.000Z', priceUsdPerGpuHour: undefined, priceCnyPerGpuHour: 3.5 }),
        createQuote({ sampledAt: '2026-08-20T03:00:00.000Z', priceUsdPerGpuHour: 0.4, priceCnyPerGpuHour: undefined }),
      ]
    )
    expect(currencyOnlyQuotes).toHaveLength(2)
  })

  it('从新旧数据派生地区和租期选项', () => {
    const records = [
      createPoint(),
      createPoint({ regionCode: 'cn-east', regionLabel: '华东', rentalTerm: 'MONTHLY' }),
      createPoint({ regionCode: 'cn-north', regionLabel: '华北', rentalTerm: 'DAILY' }),
      createPoint({ regionCode: 'cn-east', regionLabel: '重复标签不会生成重复项', rentalTerm: 'MONTHLY' }),
    ]

    expect(deriveComputeMarketRegions(records)).toEqual([
      { value: 'ALL', label: '全市场' },
      { value: 'cn-east', label: '华东' },
      { value: 'cn-north', label: '华北' },
    ])
    expect(deriveComputeMarketRentalTerms(records)).toEqual([
      { value: 'HOURLY', label: '按小时' },
      { value: 'DAILY', label: '包日' },
      { value: 'MONTHLY', label: '包月' },
    ])
    expect(deriveComputeMarketRegions([])).toEqual([])
    expect(deriveComputeMarketRentalTerms([])).toEqual([])
  })

  it('GetDeploying 每个时间桶优先最低可用价，而不是更低的中位价', () => {
    const base = {
      source: 'GETDEPLOYING' as const,
      sourceLabel: 'GetDeploying',
      modelKey: 'nvidia-a100-pcie-40gb',
      vramMiB: 40960,
      formFactor: 'PCIE',
      rentalTerm: 'HOURLY',
      status: 'OK' as const,
    }
    const minimum = createPoint({
      ...base,
      quoteType: 'MIN_AVAILABLE',
      priceCnyPerGpuHour: 5,
      sampledAt: '2026-08-20T01:00:05.000Z',
    })
    const median = createPoint({
      ...base,
      quoteType: 'MEDIAN_AVAILABLE',
      priceCnyPerGpuHour: 3,
      sampledAt: '2026-08-20T01:00:15.000Z',
    })

    const [series] = groupComputeMarketPricePointsBySource([median, minimum])
    expect(series.points).toHaveLength(1)
    expect(series.points[0]).toMatchObject({ quoteType: 'MIN_AVAILABLE', priceCnyPerGpuHour: 5 })
  })

  it('仅把同型号、显存、板型和按小时报价视为严格可比', () => {
    const getDeploying = createQuote({
      source: 'GETDEPLOYING',
      sourceLabel: 'GetDeploying',
      sourceUrl: 'https://getdeploying.com/gpus',
      modelKey: 'nvidia-a100-pcie-40gb',
      gpuModel: 'A100 PCIe 40GB',
      vramMiB: 40960,
      formFactor: 'PCI Express',
      rentalTerm: 'HOURLY',
    })
    const vast = createQuote({
      source: 'VAST_AI',
      modelKey: 'nvidia-a100-pcie-40gb',
      gpuModel: 'A100 PCIe 40GB',
      vramMiB: 40960,
      formFactor: 'PCIE',
      rentalTerm: 'HOURLY',
    })

    expect(getComputeMarketExactSpecKey(getDeploying)).toBe(getComputeMarketExactSpecKey(vast))
    expect(areComputeMarketQuotesStrictlyComparable(getDeploying, vast)).toBe(true)
    expect(areComputeMarketQuotesStrictlyComparable({ ...getDeploying, vramMiB: 81920 }, vast)).toBe(false)
    expect(areComputeMarketQuotesStrictlyComparable({ ...getDeploying, formFactor: 'SXM' }, vast)).toBe(false)
    expect(areComputeMarketQuotesStrictlyComparable({ ...getDeploying, rentalTerm: 'DAILY' }, vast)).toBe(false)
    expect(areComputeMarketQuotesStrictlyComparable({ ...getDeploying, vramMiB: undefined }, vast)).toBe(false)
  })

  it('按 GetDeploying / Vast.ai 计算比例和相对 Vast.ai 百分比，异常条件不计算', () => {
    const exactSpec = {
      modelKey: 'nvidia-a100-pcie-40gb',
      gpuModel: 'A100 PCIe 40GB',
      vramMiB: 40960,
      formFactor: 'PCIE',
      rentalTerm: 'HOURLY' as const,
    }
    const getDeploying = createQuote({
      ...exactSpec,
      source: 'GETDEPLOYING',
      sourceLabel: 'GetDeploying',
      sourceUrl: 'https://getdeploying.com/gpus',
      quoteType: 'MIN_AVAILABLE',
      priceCnyPerGpuHour: 6,
      status: 'OK',
    })
    const vast = createQuote({
      ...exactSpec,
      source: 'VAST_AI',
      quoteType: 'VERIFIED_MIN',
      priceCnyPerGpuHour: 4,
      status: 'OK',
    })

    expect(compareGetDeployingAndVastPrices(getDeploying, vast)).toMatchObject({
      reason: 'OK',
      ratio: 1.5,
      percentVsVast: 50,
      getDeployingPriceCny: 6,
      vastPriceCny: 4,
    })
    expect(compareGetDeployingAndVastPrices(undefined, vast).reason).toBe('MISSING_SOURCE')
    expect(compareGetDeployingAndVastPrices({ ...getDeploying, status: 'STALE' }, vast).reason).toBe('STALE')
    expect(compareGetDeployingAndVastPrices(getDeploying, vast, undefined, { clientStale: true }).reason).toBe('STALE')
    expect(compareGetDeployingAndVastPrices({ ...getDeploying, vramMiB: 81920 }, vast).reason).toBe('SPEC_MISMATCH')
    expect(compareGetDeployingAndVastPrices({ ...getDeploying, priceCnyPerGpuHour: 0 }, vast).reason).toBe(
      'INVALID_PRICE'
    )
  })

  it('合并实时 GetDeploying 报价时保留供应商与 offering 元数据', () => {
    const quote = createQuote({
      source: 'GETDEPLOYING',
      sourceLabel: 'GetDeploying',
      sourceUrl: 'https://getdeploying.com/gpus',
      quoteType: 'MIN_AVAILABLE',
      providerId: 'runpod',
      providerName: 'Runpod',
      providerCountry: 'US',
      externalOfferingId: 'runpod-a100-1',
      availabilityStatus: 'AVAILABLE',
    })

    expect(mergeComputeMarketPricePoints([], [quote])[0]).toMatchObject({
      providerId: 'runpod',
      providerName: 'Runpod',
      providerCountry: 'US',
      externalOfferingId: 'runpod-a100-1',
      availabilityStatus: 'AVAILABLE',
    })
  })
})
