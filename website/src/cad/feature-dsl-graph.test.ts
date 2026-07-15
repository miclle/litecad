import { describe, expect, test } from 'vitest'

import type { CadKernelFeatureDSLDocument } from './kernel-protocol'
import {
  featureDSLGraphNodeLocalValue,
  flattenFeatureDSLGraph,
  replaceFeatureDSLGraphNode,
} from './feature-dsl-graph'

const nestedDocument: CadKernelFeatureDSLDocument = {
  version: 1,
  unit: 'millimetre',
  features: [
    {
      id: 'body',
      type: 'boolean',
      operation: 'subtract',
      operands: [
        { id: 'blank', type: 'box', origin: [0, 0, 0], size: [40, 20, 6] },
        { id: 'bore', type: 'cylinder', origin: [20, 10, -1], diameter: 4, height: 8 },
      ],
    },
  ],
}

describe('Feature DSL graph utilities', () => {
  test('flattens recursive nodes into stable ID paths', () => {
    expect(
      flattenFeatureDSLGraph(nestedDocument).map(({ id, type, parentID, index, depth, path }) => ({
        id,
        type,
        parentID,
        index,
        depth,
        path,
      })),
    ).toEqual([
      { id: 'body', type: 'boolean', parentID: '', index: 0, depth: 0, path: 'features/body' },
      { id: 'blank', type: 'box', parentID: 'body', index: 0, depth: 1, path: 'features/body/operands/blank' },
      { id: 'bore', type: 'cylinder', parentID: 'body', index: 1, depth: 1, path: 'features/body/operands/bore' },
    ])
    expect(featureDSLGraphNodeLocalValue(flattenFeatureDSLGraph(nestedDocument)[0])).toEqual({
      id: 'body',
      type: 'boolean',
      operation: 'subtract',
    })
  })

  test('escapes slash and tilde characters in stable path segments', () => {
    const document = structuredClone(nestedDocument)
    document.features[0].id = 'body/root~v1'
    const body = document.features[0]
    if (body.type !== 'boolean') {
      throw new Error('expected boolean fixture')
    }
    body.operands[1].id = 'bore/primary~'

    expect(flattenFeatureDSLGraph(document).map((node) => node.path)).toEqual([
      'features/body~1root~0v1',
      'features/body~1root~0v1/operands/blank',
      'features/body~1root~0v1/operands/bore~1primary~0',
    ])
  })

  test('replaces one nested node immutably while preserving its stable ID', () => {
    const originalBody = nestedDocument.features[0]
    const updated = replaceFeatureDSLGraphNode(nestedDocument, 'bore', {
      id: 'bore',
      type: 'cylinder',
      origin: [20, 10, -1],
      diameter: 6,
      height: 8,
    })

    expect(nestedDocument.features[0]).toBe(originalBody)
    expect((nestedDocument.features[0] as unknown as { operands: Array<{ diameter?: number }> }).operands[1].diameter).toBe(4)
    expect((updated.features[0] as unknown as { operands: Array<{ diameter?: number }> }).operands[1].diameter).toBe(6)
    expect(updated.features[0]).not.toBe(originalBody)
    expect(updated).not.toBe(nestedDocument)
  })

  test('preserves nested operands when updating a boolean node locally', () => {
    const updated = replaceFeatureDSLGraphNode(nestedDocument, 'body', {
      id: 'body',
      type: 'boolean',
      operation: 'union',
    })
    const body = updated.features[0] as unknown as { operation: string; operands: unknown[] }

    expect(body.operation).toBe('union')
    expect(body.operands).toHaveLength(2)
  })

  test('rejects stable ID changes and duplicate recursive IDs', () => {
    expect(() =>
      replaceFeatureDSLGraphNode(nestedDocument, 'bore', {
        id: 'renamed-bore',
        type: 'cylinder',
      }),
    ).toThrow('Feature graph node ID must remain bore')

    const duplicateDocument = structuredClone(nestedDocument)
    ;(duplicateDocument.features[0] as unknown as { operands: Array<{ id: string }> }).operands[1].id = 'body'
    expect(() => flattenFeatureDSLGraph(duplicateDocument)).toThrow('Duplicate Feature graph node ID: body')
  })
})
