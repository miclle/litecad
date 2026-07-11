import { describe, expect, test } from 'vitest'

import {
  buildProjectPreviewAssets,
  buildProjectModelTree,
  cadKernelGeometryOperationSignature,
  cadKernelGeometryOperationsForModel,
  cadKernelOperationsForModel,
  getModelDisplayName,
  parsedPreviewModels,
  projectPreviewAssetSignature,
  projectPreviewSummary,
} from './project-preview-assets'
import type { ProjectCADDocument, ProjectModel, ProjectModelPreviewArtifact } from 'src/types/project'

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
    components: [],
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

  test('keeps saved SCAD sources in the tree without inventing preview assets', () => {
    const scadModel = {
      ...baseModel,
      id: 'mdl_scad',
      original_filename: 'generated-bracket-litecad.scad',
      format: 'scad',
      content_type: 'text/plain; charset=utf-8',
      metadata: {
        ...baseModel.metadata,
        asset_type: 'scad',
        source_kind: 'openscad',
        schema: 'openscad',
        product_names: ['Generated bracket'],
        parameter_count: 1,
      },
    } satisfies ProjectModel

    expect(buildProjectModelTree([scadModel])).toMatchObject([{ model: scadModel, displayName: 'Generated bracket' }])
    expect(buildProjectPreviewAssets([scadModel], [], {})).toEqual([])
  })

  test('uses browser-kernel mesh data for saved LiteCAD feature DSL sources', () => {
    const lcadModel = {
      ...baseModel,
      id: 'mdl_lcad',
      original_filename: 'feature-dsl-bracket-litecad.lcad.json',
      format: 'lcad',
      content_type: 'application/json',
      metadata: {
        ...baseModel.metadata,
        asset_type: 'lcad',
        source_kind: 'litecad-feature-dsl',
        schema: 'litecad-feature-dsl',
        product_names: ['Feature DSL bracket'],
        parameter_count: 1,
        parameter_values: { width: 96 },
      },
    } satisfies ProjectModel
    const mesh = {
      positions: [0, 0, 0, 96, 0, 0, 0, 42, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    }

    expect(buildProjectModelTree([lcadModel])).toMatchObject([{ model: lcadModel, displayName: 'Feature DSL bracket' }])
    expect(
      buildProjectPreviewAssets([lcadModel], [], {}, { mdl_lcad: { mesh, meshSummary: { vertexCount: 3, triangleCount: 1, hasNormals: true } } }),
    ).toEqual([
      {
        modelId: 'mdl_lcad',
        name: 'Feature DSL bracket',
        previewFormat: 'kernel-mesh',
        mesh,
        meshSummary: { vertexCount: 3, triangleCount: 1, hasNormals: true },
      },
    ])
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

  test('omits preview assets for source nodes deleted from the CAD document', () => {
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
      metadata: { ...baseModel.metadata, product_names: ['Bearing connector'] },
    } satisfies ProjectModel
    const cadDocument = {
      id: 'cad_doc',
      project_id: 'prj_01test',
      schema_version: 1,
      revision: 2,
      unit: 'millimetre',
      nodes: [
        {
          id: 'node_mdl_pulley',
          model_id: 'mdl_pulley',
          source_model_id: 'mdl_pulley',
          parent_node_id: '',
          name: '同步轮.step',
          source_format: 'step',
          transform: { matrix: [] },
        },
      ],
      operations: [{ id: 'op_delete', type: 'delete-node', model_id: 'mdl_connector', node_id: 'node_mdl_connector', created_at: '2026-07-10T00:00:00Z' }],
      history: { head_id: 'hist_delete', can_undo: true, can_redo: false },
      created_at: '2026-07-10T00:00:00Z',
      updated_at: '2026-07-10T00:00:00Z',
    } satisfies ProjectCADDocument

    expect(
      buildProjectPreviewAssets(
        [pulley, connector],
        [
          { ...previewArtifact, id: 'prv_pulley', model_id: 'mdl_pulley' },
          { ...previewArtifact, id: 'prv_connector', model_id: 'mdl_connector' },
        ],
        { mdl_pulley: 'blob:pulley', mdl_connector: 'blob:connector' },
        {},
        cadDocument,
      ).map((asset) => asset.modelId),
    ).toEqual(['mdl_pulley'])
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

  test('attaches CAD document transforms to backend preview assets without rebuilding signatures', () => {
    const model = {
      ...baseModel,
      id: 'mdl_stl',
      original_filename: 'bracket.stl',
      format: 'stl',
      content_type: 'model/stl',
    } satisfies ProjectModel
    const transform = {
      matrix: [1, 0, 0, 14, 0, 1, 0, -2, 0, 0, 1, 6, 0, 0, 0, 1],
    }
    const assets = buildProjectPreviewAssets(
      [model],
      [{ ...previewArtifact, id: 'prv_stl', model_id: 'mdl_stl' }],
      { mdl_stl: 'blob:stl-obj' },
      {},
      {
        project_id: 'prj_01test',
        id: 'doc_01test',
        schema_version: 1,
        revision: 2,
        history: { head_id: 'hist_02test', can_undo: true, can_redo: false },
        unit: 'millimetre',
        nodes: [
          {
            id: 'node_mdl_stl',
            model_id: 'mdl_stl',
            parent_node_id: '',
            name: 'bracket.stl',
            source_format: 'stl',
            transform,
          },
        ],
        operations: [],
        created_at: '2026-07-07T00:00:00Z',
        updated_at: '2026-07-07T00:00:00Z',
      },
    )

    expect(assets[0]).toMatchObject({ modelId: 'mdl_stl', transform })
    expect(projectPreviewAssetSignature(assets)).toBe('mdl_stl:obj:blob:stl-obj')
  })

  test('uses geometry operation signatures instead of object transforms for kernel mesh signatures', () => {
    const model = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'bracket.step',
    } satisfies ProjectModel
    const transform = {
      matrix: [1, 0, 0, 14, 0, 1, 0, -2, 0, 0, 1, 6, 0, 0, 0, 1],
    }
    const assets = buildProjectPreviewAssets(
      [model],
      [],
      {},
      {
        mdl_step: {
          mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
          meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
        },
      },
      {
        project_id: 'prj_01test',
        id: 'doc_01test',
        schema_version: 1,
        revision: 4,
        history: { head_id: 'hist_04test', can_undo: true, can_redo: false },
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

    expect(assets[0]).toMatchObject({ modelId: 'mdl_step', previewFormat: 'kernel-mesh' })
    expect(assets[0]).not.toHaveProperty('transform')
    expect(projectPreviewAssetSignature(assets)).toBe('mdl_step:kernel-mesh:3:3:3')
  })

  test('attaches STEP component document nodes as kernel mesh pick targets', () => {
    const model = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'assembly.step',
    } satisfies ProjectModel
    const assets = buildProjectPreviewAssets(
      [model],
      [],
      {},
      {
        mdl_step: {
          mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
          meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
        },
      },
      {
        project_id: 'prj_01test',
        id: 'doc_01test',
        schema_version: 1,
        revision: 1,
        history: { head_id: '', can_undo: false, can_redo: false },
        unit: 'millimetre',
        nodes: [
          {
            id: 'node_mdl_step',
            model_id: 'mdl_step',
            source_model_id: 'mdl_step',
            parent_node_id: '',
            name: 'assembly',
            source_format: 'step',
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
          {
            id: 'node_mdl_step_component_1',
            model_id: '',
            source_model_id: 'mdl_step',
            parent_node_id: 'node_mdl_step',
            name: 'Left pulley',
            source_format: 'step-component',
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
          {
            id: 'node_mdl_step_component_2',
            model_id: '',
            source_model_id: 'mdl_step',
            parent_node_id: 'node_mdl_step',
            name: 'Right pulley',
            source_format: 'step-component',
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
        ],
        operations: [],
        created_at: '2026-07-07T00:00:00Z',
        updated_at: '2026-07-07T00:00:00Z',
      },
    )

    expect(assets[0]).toMatchObject({
      previewFormat: 'kernel-mesh',
      pickTargets: [
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_1', name: 'Left pulley' },
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_2', name: 'Right pulley' },
      ],
    })
  })

  test('filters kernel component meshes to remaining STEP component document nodes', () => {
    const model = {
      ...baseModel,
      id: 'mdl_step',
      original_filename: 'assembly.step',
    } satisfies ProjectModel
    const assets = buildProjectPreviewAssets(
      [model],
      [],
      {},
      {
        mdl_step: {
          mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
          componentMeshes: [
            { positions: [1, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
            { positions: [2, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
            { positions: [3, 0, 0], normals: [0, 0, 1], indices: [0, 0, 0] },
          ],
          meshSummary: { vertexCount: 3, triangleCount: 3, hasNormals: true },
        },
      },
      {
        project_id: 'prj_01test',
        id: 'doc_01test',
        schema_version: 1,
        revision: 2,
        history: { head_id: 'hist_02test', can_undo: true, can_redo: false },
        unit: 'millimetre',
        nodes: [
          {
            id: 'node_mdl_step',
            model_id: 'mdl_step',
            source_model_id: 'mdl_step',
            parent_node_id: '',
            name: 'assembly',
            source_format: 'step',
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
          {
            id: 'node_mdl_step_component_1',
            model_id: '',
            source_model_id: 'mdl_step',
            parent_node_id: 'node_mdl_step',
            name: 'Left pulley',
            source_format: 'step-component',
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
          {
            id: 'node_mdl_step_component_3',
            model_id: '',
            source_model_id: 'mdl_step',
            parent_node_id: 'node_mdl_step',
            name: 'Right pulley',
            source_format: 'step-component',
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
        ],
        operations: [{ id: 'op_delete', type: 'delete-node', model_id: 'mdl_step', node_id: 'node_mdl_step_component_2', created_at: '2026-07-07T00:00:01Z' }],
        created_at: '2026-07-07T00:00:00Z',
        updated_at: '2026-07-07T00:00:01Z',
      },
    )

    expect(assets[0]).toMatchObject({
      previewFormat: 'kernel-mesh',
      pickTargets: [
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_1', name: 'Left pulley' },
        { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_3', name: 'Right pulley' },
      ],
      componentMeshes: [
        { positions: [1, 0, 0] },
        { positions: [3, 0, 0] },
      ],
    })
  })

  test('maps CAD document operations into model-scoped kernel replay operations', () => {
    const transform = {
      matrix: [1, 0, 0, 14, 0, 1, 0, -2, 0, 0, 1, 6, 0, 0, 0, 1],
    }

    expect(
      cadKernelOperationsForModel(
        {
          project_id: 'prj_01test',
          id: 'doc_01test',
          schema_version: 1,
          revision: 3,
          history: { head_id: 'hist_03test', can_undo: true, can_redo: false },
          unit: 'millimetre',
          nodes: [],
          operations: [
            {
              id: 'op_other',
              type: 'transform',
              model_id: 'mdl_other',
              transform: { matrix: [1, 0, 0, 99, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              created_at: '2026-07-07T00:00:00Z',
            },
            {
              id: 'op_01test',
              type: 'transform',
              model_id: 'mdl_step',
              transform,
              created_at: '2026-07-07T00:00:01Z',
            },
            {
              id: 'op_box',
              type: 'box-union',
              model_id: 'mdl_step',
              box: {
                origin: [2, -1, 4],
                size: [8, 6, 3],
              },
              created_at: '2026-07-07T00:00:02Z',
            },
          ],
          created_at: '2026-07-07T00:00:00Z',
          updated_at: '2026-07-07T00:00:01Z',
        },
        'mdl_step',
      ),
    ).toEqual([
      {
        id: 'op_box',
        type: 'box-union',
        modelId: 'mdl_step',
        box: {
          origin: [2, -1, 4],
          size: [8, 6, 3],
        },
      },
      {
        id: 'op_01test',
        type: 'transform',
        modelId: 'mdl_step',
        matrix: transform.matrix,
      },
    ])
  })

  test('replays geometry features before only the latest absolute model transform', () => {
    const firstTransform = { matrix: [1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
    const latestTransform = { matrix: [1, 0, 0, 9, 0, 1, 0, -3, 0, 0, 1, 4, 0, 0, 0, 1] }

    expect(
      cadKernelOperationsForModel(
        {
          project_id: 'prj_01test',
          id: 'doc_01test',
          schema_version: 1,
          revision: 4,
          history: { head_id: 'hist_04test', can_undo: true, can_redo: false },
          unit: 'millimetre',
          nodes: [],
          operations: [
            {
              id: 'op_transform_first',
              type: 'transform',
              model_id: 'mdl_step',
              transform: firstTransform,
              created_at: '2026-07-07T00:00:01Z',
            },
            {
              id: 'op_box',
              type: 'box-union',
              model_id: 'mdl_step',
              box: { origin: [0, 0, 0], size: [2, 2, 2] },
              created_at: '2026-07-07T00:00:02Z',
            },
            {
              id: 'op_transform_latest',
              type: 'transform',
              model_id: 'mdl_step',
              transform: latestTransform,
              created_at: '2026-07-07T00:00:03Z',
            },
          ],
          created_at: '2026-07-07T00:00:00Z',
          updated_at: '2026-07-07T00:00:03Z',
        },
        'mdl_step',
      ),
    ).toEqual([
      {
        id: 'op_box',
        type: 'box-union',
        modelId: 'mdl_step',
        box: { origin: [0, 0, 0], size: [2, 2, 2] },
      },
      {
        id: 'op_transform_latest',
        type: 'transform',
        modelId: 'mdl_step',
        matrix: latestTransform.matrix,
      },
    ])
  })

  test('keeps component-node transforms out of model-scoped STEP export replay operations', () => {
    const modelTransform = {
      matrix: [1, 0, 0, 14, 0, 1, 0, -2, 0, 0, 1, 6, 0, 0, 0, 1],
    }
    const componentTransform = {
      matrix: [1, 0, 0, 99, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    }

    expect(
      cadKernelOperationsForModel(
        {
          project_id: 'prj_01test',
          id: 'doc_01test',
          schema_version: 1,
          revision: 3,
          history: { head_id: 'hist_03test', can_undo: true, can_redo: false },
          unit: 'millimetre',
          nodes: [],
          operations: [
            {
              id: 'op_model_transform',
              type: 'transform',
              model_id: 'mdl_step',
              node_id: 'node_mdl_step',
              transform: modelTransform,
              created_at: '2026-07-07T00:00:01Z',
            },
            {
              id: 'op_component_transform',
              type: 'transform',
              model_id: 'mdl_step',
              node_id: 'node_mdl_step_component_1',
              transform: componentTransform,
              created_at: '2026-07-07T00:00:02Z',
            },
          ],
          created_at: '2026-07-07T00:00:00Z',
          updated_at: '2026-07-07T00:00:01Z',
        },
        'mdl_step',
      ),
    ).toEqual([
      {
        id: 'op_model_transform',
        type: 'transform',
        modelId: 'mdl_step',
        matrix: modelTransform.matrix,
      },
    ])
  })

  test('keeps transform operations out of geometry preview replay signatures', () => {
    const document = {
      project_id: 'prj_01test',
      id: 'doc_01test',
      schema_version: 1,
      revision: 3,
      history: { head_id: 'hist_03test', can_undo: true, can_redo: false },
      unit: 'millimetre',
      nodes: [],
      operations: [
        {
          id: 'op_transform',
          type: 'transform',
          model_id: 'mdl_step',
          transform: { matrix: [1, 0, 0, 14, 0, 1, 0, -2, 0, 0, 1, 6, 0, 0, 0, 1] },
          created_at: '2026-07-07T00:00:01Z',
        },
        {
          id: 'op_box',
          type: 'box-union',
          model_id: 'mdl_step',
          box: {
            origin: [2, -1, 4],
            size: [8, 6, 3],
          },
          created_at: '2026-07-07T00:00:02Z',
        },
      ],
      created_at: '2026-07-07T00:00:00Z',
      updated_at: '2026-07-07T00:00:01Z',
    } satisfies ProjectCADDocument

    expect(cadKernelGeometryOperationsForModel(document, 'mdl_step')).toEqual([
      {
        id: 'op_box',
        type: 'box-union',
        modelId: 'mdl_step',
        box: {
          origin: [2, -1, 4],
          size: [8, 6, 3],
        },
      },
    ])
    expect(cadKernelGeometryOperationSignature(document, 'mdl_step')).toBe('op_box:box:2,-1,4:8,6,3')
  })

  test('summarizes multi-model preview readiness for the workbench chrome', () => {
    expect(projectPreviewSummary({ modelCount: 2, previewAssetCount: 2, latestPreviewFormat: 'obj' })).toEqual({
      previewLabel: '2 OBJ meshes',
      sourceLabel: '2 sources stored',
      sourceBody: 'The project owns 2 uploaded source files and 2 browser-loadable preview meshes.',
      isReady: true,
    })
  })

  test('builds source groups with STEP component children for the project tree', () => {
    const chassis = {
      ...baseModel,
      id: 'mdl_chassis',
      original_filename: 'chassis.step',
      metadata: {
        ...baseModel.metadata,
        product_names: ['Chassis Assembly'],
        components: [
          { name: 'Frame', kind: 'product' },
          { name: 'Battery Tray', kind: 'product' },
        ],
      },
    } satisfies ProjectModel
    const steering = {
      ...baseModel,
      id: 'mdl_steering',
      original_filename: 'steering.step',
      metadata: {
        ...baseModel.metadata,
        product_names: ['Steering Assembly'],
        components: [
          { name: 'Left Knuckle', kind: 'product' },
          { name: 'Right Knuckle', kind: 'product' },
        ],
      },
    } satisfies ProjectModel

    expect(buildProjectModelTree([chassis, steering])).toEqual([
      {
        model: chassis,
        displayName: 'chassis',
        sourceNodeId: 'node_mdl_chassis',
        children: [
          { id: 'node_mdl_chassis_component_1', name: 'Frame', sourceModelId: 'mdl_chassis' },
          { id: 'node_mdl_chassis_component_2', name: 'Battery Tray', sourceModelId: 'mdl_chassis' },
        ],
      },
      {
        model: steering,
        displayName: 'steering',
        sourceNodeId: 'node_mdl_steering',
        children: [
          { id: 'node_mdl_steering_component_1', name: 'Left Knuckle', sourceModelId: 'mdl_steering' },
          { id: 'node_mdl_steering_component_2', name: 'Right Knuckle', sourceModelId: 'mdl_steering' },
        ],
      },
    ])
  })

  test('omits source groups deleted from the CAD document', () => {
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
      metadata: {
        ...baseModel.metadata,
        product_names: ['Bearing connector'],
        components: [
          { name: 'Boss', kind: 'product' },
          { name: 'Flange', kind: 'product' },
        ],
      },
    } satisfies ProjectModel
    const cadDocument = {
      id: 'cad_doc',
      project_id: 'prj_01test',
      schema_version: 1,
      revision: 2,
      unit: 'millimetre',
      nodes: [
        {
          id: 'node_mdl_pulley',
          model_id: 'mdl_pulley',
          source_model_id: 'mdl_pulley',
          parent_node_id: '',
          name: '同步轮.step',
          source_format: 'step',
          transform: { matrix: [] },
        },
      ],
      operations: [{ id: 'op_delete', type: 'delete-node', model_id: 'mdl_connector', node_id: 'node_mdl_connector', created_at: '2026-07-10T00:00:00Z' }],
      history: { head_id: 'hist_delete', can_undo: true, can_redo: false },
      created_at: '2026-07-10T00:00:00Z',
      updated_at: '2026-07-10T00:00:00Z',
    } satisfies ProjectCADDocument

    expect(buildProjectModelTree([pulley, connector], cadDocument).map((group) => group.model.id)).toEqual(['mdl_pulley'])
  })

  test('uses imported model names for tree source groups instead of STEP filenames', () => {
    const unnamed = {
      ...baseModel,
      id: 'mdl_filename',
      original_filename: '同步轮.step',
      metadata: { ...baseModel.metadata, product_names: [] },
    } satisfies ProjectModel

    expect(buildProjectModelTree([unnamed])[0]).toMatchObject({
      sourceNodeId: 'node_mdl_filename',
      displayName: '同步轮',
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

  test('includes kernel mesh pick targets in preview signatures', () => {
    const mesh = {
      positions: [0, 0, 0],
      normals: [0, 0, 1],
      indices: [0, 0, 0],
    }

    const withoutTargets = projectPreviewAssetSignature([
      {
        modelId: 'mdl_step',
        name: 'assembly',
        previewFormat: 'kernel-mesh',
        mesh,
        meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
      },
    ])
    const withTargets = projectPreviewAssetSignature([
      {
        modelId: 'mdl_step',
        name: 'assembly',
        previewFormat: 'kernel-mesh',
        mesh,
        meshSummary: { vertexCount: 1, triangleCount: 1, hasNormals: true },
        pickTargets: [
          { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_1', name: 'Left pulley' },
          { modelId: 'mdl_step', nodeId: 'node_mdl_step_component_2', name: 'Right pulley' },
        ],
      },
    ])

    expect(withTargets).not.toBe(withoutTargets)
    expect(withTargets).toContain('node_mdl_step_component_1')
    expect(withTargets).toContain('node_mdl_step_component_2')
  })
})
