import { describe, expect, test } from 'vitest'

import i18n from 'src/i18n'

const workflowKeys = [
  'home.workflowTitle',
  'home.workflowBody',
  'home.pipeline.create.label',
  'home.pipeline.create.value',
  'home.pipeline.assemble.label',
  'home.pipeline.assemble.value',
  'home.pipeline.inspect.label',
  'home.pipeline.inspect.value',
  'home.pipeline.export.label',
  'home.pipeline.export.value',
]

describe('home workflow copy', () => {
  test('describes the current shipped workflow in English', () => {
    const copy = workflowKeys.map((key) => i18n.getFixedT('en')(key)).join(' ')

    expect(copy).toContain('browser-validated LiteCAD DSL model')
    expect(copy).toContain('reusable snapshots')
    expect(copy).toContain('exact OCCT inspection results')
    expect(copy).toContain('one merged STEP')
    expect(copy).not.toContain('first product loop')
  })

  test('describes the current shipped workflow in Chinese', () => {
    const copy = workflowKeys.map((key) => i18n.getFixedT('zh')(key)).join(' ')

    expect(copy).toContain('经浏览器内核验证的 LiteCAD DSL 模型')
    expect(copy).toContain('可复用快照')
    expect(copy).toContain('精确的 OCCT 检查结果')
    expect(copy).toContain('合并为一个 STEP')
    expect(copy).not.toContain('第一轮产品循环')
  })
})

describe('home project status copy', () => {
  test('summarizes shipped capabilities and future boundaries in English', () => {
    const shipped = i18n.getFixedT('en')('home.shippedNowBody')
    const next = i18n.getFixedT('en')('home.nextBody')

    expect(shipped).toContain('revision-pinned assemblies')
    expect(shipped).toContain('point mates')
    expect(shipped).toContain('reusable snapshots')
    expect(shipped).toContain('measurement and section results')
    expect(shipped).toContain('STEP export artifacts')
    expect(next).toContain('cross-revision topology remapping')
    expect(next).toContain('general mechanical and rotational mates')
    expect(next).toContain('live-linked reusable assembly documents')
    expect(next).toContain('full B-rep feature history')
  })

  test('summarizes shipped capabilities and future boundaries in Chinese', () => {
    const shipped = i18n.getFixedT('zh')('home.shippedNowBody')
    const next = i18n.getFixedT('zh')('home.nextBody')

    expect(shipped).toContain('版本固定的装配')
    expect(shipped).toContain('点重合约束')
    expect(shipped).toContain('可复用快照')
    expect(shipped).toContain('测量与剖切结果')
    expect(shipped).toContain('STEP 导出文件')
    expect(next).toContain('跨版本拓扑映射')
    expect(next).toContain('通用机械与旋转装配约束')
    expect(next).toContain('实时关联的可复用装配文档')
    expect(next).toContain('完整的 B-rep 特征历史')
  })
})

describe('home interactive preview copy', () => {
  test('explains the interactive sample in English and Chinese', () => {
    const english = i18n.getFixedT('en')
    const chinese = i18n.getFixedT('zh')

    expect(english('home.emptyTitle')).toBe('Interactive 3D sample')
    expect(english('home.emptyBody')).toContain('Drag to rotate')
    expect(english('home.emptyBody')).toContain('Pinch or scroll')
    expect(chinese('home.emptyTitle')).toBe('交互式 3D 样例')
    expect(chinese('home.emptyBody')).toContain('拖动旋转')
    expect(chinese('home.emptyBody')).toContain('双指或滚轮')
  })

  test('explains the WebGL fallback in English and Chinese', () => {
    const english = i18n.getFixedT('en')
    const chinese = i18n.getFixedT('zh')

    expect(english('home.modelPreviewUnavailableTitle')).toBe('3D preview unavailable')
    expect(english('home.modelPreviewUnavailableBody')).toContain('WebGL')
    expect(chinese('home.modelPreviewUnavailableTitle')).toBe('3D 预览不可用')
    expect(chinese('home.modelPreviewUnavailableBody')).toContain('WebGL')
  })
})
