import { describe, expect, test } from 'vitest'

import {
  buildProjectPreviewAssets,
  getModelDisplayName,
  parsedPreviewModels,
  projectPreviewAssetSignature,
  projectPreviewSummary,
} from './project-preview-assets'
import type { ProjectModel, ProjectModelPreviewArtifact } from 'src/types/project'

const baseModel = {
  project_id: 'prj_01test',
  format: 'step',
  content_type: 'model/step',
  byte_size: 1024,
  parse_status: 'parsed',
  parse_error: '',
  metadata: {
    asset_type: 'step',
    version: '',
    schema: 'AUTOMOTIVE_DESIGN',
    product_names: [],
    length_unit: 'millimetre',
    entity_count: 1,
    representation_count: 1,
    triangle_count: 0,
  },
  created_at: '2026-07-05T00:00:00Z',
  updated_at: '2026-07-05T00:00:00Z',
} satisfies Omit<ProjectModel, 'id' | 'original_filename'>

const previewArtifact = {
  format: 'obj',
  content_type: 'model/obj',
  generator_version: 'freecad-step-obj-v1',
  byte_size: 2048,
  vertex_count: 12,
  facet_count: 8,
  created_at: '2026-07-05T00:00:00Z',
  updated_at: '2026-07-05T00:00:00Z',
} satisfies Omit<ProjectModelPreviewArtifact, 'id' | 'model_id'>

describe('project preview assets', () => {
  test('keeps every parsed model eligible for preview metadata queries', () => {
    const parsedModel = { ...baseModel, id: 'mdl_parsed', original_filename: 'parsed.step' } satisfies ProjectModel
    const erroredModel = {
      ...baseModel,
      id: 'mdl_error',
      original_filename: 'error.step',
      parse_status: 'error',
    } satisfies ProjectModel

    expect(parsedPreviewModels([parsedModel, erroredModel])).toEqual([parsedModel])
  })

  test('builds one preview asset for each model with a ready preview URL', () => {
    const pulley = {
      ...baseModel,
      id: 'mdl_pulley',
      original_filename: '同步轮.step',
      metadata: { ...baseModel.metadata, product_names: ['CyberGearTimingPulley'] },
    } satisfies ProjectModel
    const connector = {
      ...baseModel,
      id: 'mdl_connector',
      original_filename: '转向轴承连接器.step',
      metadata: { ...baseModel.metadata, product_names: ['转向轴承连接器 - Ø8 boss center through hole'] },
    } satisfies ProjectModel
    const artifacts = [
      { ...previewArtifact, id: 'prv_connector', model_id: 'mdl_connector' },
      { ...previewArtifact, id: 'prv_pulley', model_id: 'mdl_pulley' },
    ] satisfies ProjectModelPreviewArtifact[]

    expect(
      buildProjectPreviewAssets([pulley, connector], artifacts, {
        mdl_connector: 'blob:connector',
        mdl_pulley: 'blob:pulley',
      }),
    ).toEqual([
      {
        modelId: 'mdl_pulley',
        name: 'CyberGearTimingPulley',
        previewFormat: 'obj',
        previewUrl: 'blob:pulley',
      },
      {
        modelId: 'mdl_connector',
        name: '转向轴承连接器 - Ø8 boss center through hole',
        previewFormat: 'obj',
        previewUrl: 'blob:connector',
      },
    ])
  })

  test('uses browser-kernel mesh data for parsed STEP models before backend preview artifacts', () => {
    const model = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'bracket.step',
    } satisfies ProjectModel
    const mesh = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    }

    expect(
      buildProjectPreviewAssets(
        [model],
        [{ ...previewArtifact, id: 'prv_step', model_id: 'mdl_step' }],
        { mdl_step: 'blob:freecad-obj' },
        { mdl_step: { mesh, meshSummary: { vertexCount: 3, triangleCount: 1, hasNormals: true } } },
      ),
    ).toEqual([
      {
        modelId: 'mdl_step',
        name: 'bracket',
        previewFormat: 'kernel-mesh',
        mesh,
        meshSummary: { vertexCount: 3, triangleCount: 1, hasNormals: true },
      },
    ])
  })

  test('falls back to filename when metadata product names are null', () => {
    expect(
      getModelDisplayName({
        ...baseModel,
        id: 'mdl_stl',
        original_filename: 'verify.stl',
        format: 'stl',
        metadata: { ...baseModel.metadata, product_names: null },
      }),
    ).toBe('verify')
  })

  test('attaches CAD document transforms to preview assets and signatures', () => {
    const model = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'bracket.step',
    } satisfies ProjectModel
    const mesh = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    }
    const transform = {
      matrix: [1, 0, 0, 14, 0, 1, 0, -2, 0, 0, 1, 6, 0, 0, 0, 1],
    }
    const assets = buildProjectPreviewAssets(
      [model],
      [],
      {},
      { mdl_step: { mesh, meshSummary: { vertexCount: 3, triangleCount: 1, hasNormals: true } } },
      {
        project_id: 'prj_01test',
        id: 'doc_01test',
        schema_version: 1,
        revision: 2,
        unit: 'millimetre',
        nodes: [
          {
            id: 'node_mdl_step',
            model_id: 'mdl_step',
            parent_node_id: '',
            name: 'bracket.step',
            source_format: 'step',
            transform,
          },
        ],
        operations: [],
        created_at: '2026-07-07T00:00:00Z',
        updated_at: '2026-07-07T00:00:00Z',
      },
    )

    expect(assets[0]).toMatchObject({ modelId: 'mdl_step', transform })
    expect(projectPreviewAssetSignature(assets)).toContain(transform.matrix.join(','))
  })

  test('summarizes multi-model preview readiness for the workbench chrome', () => {
    expect(projectPreviewSummary({ modelCount: 2, previewAssetCount: 2, latestPreviewFormat: 'obj' })).toEqual({
      previewLabel: '2 OBJ meshes',
      sourceLabel: '2 sources stored',
      sourceBody: 'The project owns 2 uploaded source files and 2 browser-loadable preview meshes.',
      isReady: true,
    })
  })

  test('creates a stable preview signature from asset content instead of array identity', () => {
    const firstAssets = [
      {
        modelId: 'mdl_pulley',
        name: 'CyberGearTimingPulley',
        previewFormat: 'obj',
        previewUrl: 'blob:pulley',
      },
      {
        modelId: 'mdl_connector',
        name: 'Bearing connector',
        previewFormat: 'obj',
        previewUrl: 'blob:connector',
      },
    ] as const
    const secondAssets = firstAssets.map((asset) => ({ ...asset }))

    expect(projectPreviewAssetSignature(firstAssets)).toBe(projectPreviewAssetSignature(secondAssets))
  })

  test('includes kernel mesh buffer sizes in preview signatures', () => {
    expect(
      projectPreviewAssetSignature([
        {
          modelId: 'mdl_step',
          name: 'bracket',
          previewFormat: 'kernel-mesh',
          mesh: {
            positions: [0, 0, 0],
            normals: [0, 0, 1],
            indices: [0, 0, 0],
          },
          meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
        },
      ]),
    ).toBe('mdl_step:kernel-mesh:3:3:3')
  })
})
