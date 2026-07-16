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
