import type { Page, Route } from '@playwright/test'

import type { ProjectInspectionMeasurement } from '../../src/types/project'

export const projectId = 'project_smoke'
const now = '2026-07-10T00:00:00Z'

type FixtureOccurrence = {
	id: string
	node_id: string
	model_id: string
	model_revision_id: string
	parent_group_id: string
	subassembly_member_id?: string
	name: string
	suppressed: boolean
	transform: { matrix: number[] }
}

type FixtureAssemblyGroup = {
	id: string
	parent_group_id: string
	name: string
	suppressed: boolean
	subassembly_definition_id?: string
	subassembly_definition_revision?: number
}

type FixtureSubassemblyMember = {
	id: string
	node_id: string
	model_id: string
	model_revision_id: string
	name: string
	suppressed: boolean
	relative_transform: { matrix: number[] }
}

type FixtureSubassemblyDefinition = {
	id: string
	revision: number
	name: string
	members: FixtureSubassemblyMember[]
}

type FixtureAssemblyConstraint = {
	id: string
	kind: 'mate'
	name: string
	first_occurrence_id: string
	second_occurrence_id: string
	status: 'solved'
	solver: 'point-coincident-v1'
	first_anchor: [number, number, number]
	second_anchor: [number, number, number]
	offset: [number, number, number]
	residual: number
}

type FixtureAssemblySnapshot = {
	occurrences: FixtureOccurrence[]
	groups: FixtureAssemblyGroup[]
	constraints: FixtureAssemblyConstraint[]
	subassemblies: FixtureSubassemblyDefinition[]
}

type FixtureExportArtifact = {
  id: string
  project_id: string
  filename: string
  content_type: 'model/step'
  export_kind: 'single' | 'merged'
  target_count: number
  source_revision_ids: string[]
  occurrence_ids: string[]
  byte_size: number
  step_text: string
  created_at: string
  updated_at: string
}

type FixtureInspectionRecord = {
  id: string
  project_id: string
  kind: 'measurement' | 'section'
  name: string
  cad_document_revision: number
  unit: string
  visible_model_ids: string[]
  measurement?: ProjectInspectionMeasurement
  section?: {
    mode: 'center-plane'
    plane_normal: { x: number; y: number; z: number }
    plane_constant: number
  }
  created_at: string
  updated_at: string
}

type FixtureSectionArtifact = {
  id: string
  project_id: string
  association_id: string
  generation: number
  supersedes_artifact_id: string
  is_latest: boolean
  cad_document_revision: number
  unit: string
  status: 'ready' | 'empty'
  filename: string
  content_type: 'model/step'
  target_count: number
  source_revision_ids: string[]
  occurrence_ids: string[]
  plane_origin: { x: number; y: number; z: number }
  plane_normal: { x: number; y: number; z: number }
  edge_count: number
  byte_size: number
  step_text: string
  created_at: string
  updated_at: string
}

export type ProjectAPIFixtureState = {
  messages: unknown[]
  models: unknown[]
  parametricArtifactTitle: string
  parametricArtifactSourceCode: string
  savedModelID: string
  savedModelFilename: string
  featureDSLSourceRequestCount: number
  artifactCompileStatus: string
  artifactUpdateCount: number
  featureGraphUpdateCount: number
  featureGraphBeforeSourceCode: string
  featureGraphBeforeRevisionID: string
  featureGraphBeforeRevisionSequence: number
  featureGraphAfterSourceCode: string
  featureGraphAfterRevisionID: string
  featureGraphAfterRevisionSequence: number
  historyEntries: unknown[]
  modelParameterUpdateCount: number
  modelRevisionRestoreCount: number
  modelRevisionSequence: number
  currentModelRevisionID: string
  savedParameterValues: Record<string, unknown>
  cadRevision: number
  translationX: number
  conflictNextTransform: boolean
  transformUpdateCount: number
  undoCount: number
  redoCount: number
  canUndo: boolean
  canRedo: boolean
  uploadCount: number
  exportArtifacts: FixtureExportArtifact[]
  exportArtifactCreateCount: number
  inspectionRecords: FixtureInspectionRecord[]
  inspectionRecordCreateCount: number
  sectionArtifacts: FixtureSectionArtifact[]
  sectionArtifactCreateCount: number
	occurrences: FixtureOccurrence[]
	assemblyGroups: FixtureAssemblyGroup[]
	assemblyConstraints: FixtureAssemblyConstraint[]
	assemblySubassemblies: FixtureSubassemblyDefinition[]
	assemblyUndoStack: FixtureAssemblySnapshot[]
	assemblyRedoStack: FixtureAssemblySnapshot[]
	assemblyGroupCreateCount: number
	assemblyGroupUpdateCount: number
	assemblyGroupDeleteCount: number
	assemblyConstraintCreateCount: number
	assemblyConstraintDeleteCount: number
	subassemblyDefinitionCreateCount: number
	subassemblyInstanceCreateCount: number
	occurrenceDuplicateCount: number
	occurrenceUpdateCount: number
	occurrenceMoveCount: number
	occurrenceDeleteCount: number
  parametricRunDelayMs: number
  parametricRunErrorMessage: string
}

export function createProjectFixtureState(): ProjectAPIFixtureState {
  return {
    messages: [],
    models: [],
    parametricArtifactTitle: 'Smoke bracket',
    parametricArtifactSourceCode: smokeFeatureDSLSource,
    savedModelID: 'mdl_smoke_lcad',
    savedModelFilename: 'smoke-bracket-litecad.lcad.json',
    featureDSLSourceRequestCount: 0,
    artifactCompileStatus: 'pending',
    artifactUpdateCount: 0,
    featureGraphUpdateCount: 0,
    featureGraphBeforeSourceCode: '',
    featureGraphBeforeRevisionID: '',
    featureGraphBeforeRevisionSequence: 0,
    featureGraphAfterSourceCode: '',
    featureGraphAfterRevisionID: '',
    featureGraphAfterRevisionSequence: 0,
    historyEntries: [],
    modelParameterUpdateCount: 0,
    modelRevisionRestoreCount: 0,
    modelRevisionSequence: 1,
    currentModelRevisionID: 'mvr_smoke_1',
    savedParameterValues: {},
    cadRevision: 2,
    translationX: 0,
    conflictNextTransform: false,
    transformUpdateCount: 0,
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
    uploadCount: 0,
    exportArtifacts: [],
    exportArtifactCreateCount: 0,
    inspectionRecords: [],
    inspectionRecordCreateCount: 0,
    sectionArtifacts: [],
    sectionArtifactCreateCount: 0,
		occurrences: [],
		assemblyGroups: [],
		assemblyConstraints: [],
		assemblySubassemblies: [],
		assemblyUndoStack: [],
		assemblyRedoStack: [],
		assemblyGroupCreateCount: 0,
		assemblyGroupUpdateCount: 0,
		assemblyGroupDeleteCount: 0,
		assemblyConstraintCreateCount: 0,
		assemblyConstraintDeleteCount: 0,
		subassemblyDefinitionCreateCount: 0,
		subassemblyInstanceCreateCount: 0,
		occurrenceDuplicateCount: 0,
		occurrenceUpdateCount: 0,
		occurrenceMoveCount: 0,
		occurrenceDeleteCount: 0,
    parametricRunDelayMs: 0,
    parametricRunErrorMessage: '',
  }
}
export const smokeFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: {
    width: { type: 'number', default: 60, min: 20, max: 120, step: 5 },
  },
  features: [{ id: 'base', type: 'box', origin: [0, 0, 0], size: ['width', 24, 8] }],
})
export const smokeUpdatedFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: {
    width: { type: 'number', default: 60, min: 20, max: 120, step: 5 },
  },
  features: [
    { id: 'base', type: 'box', origin: [0, 0, 0], size: ['width', 28, 8] },
    { id: 'slot', type: 'box_cut', origin: [12, 8, -1], size: [24, 12, 10] },
  ],
})
export const nestedBooleanFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  features: [
    {
      id: 'body',
      type: 'boolean',
      operation: 'subtract',
      operands: [
        { id: 'blank', type: 'box', origin: [0, 0, 0], size: [40, 24, 8] },
        { id: 'bore', type: 'cylinder', origin: [20, 12, -1], diameter: 4, height: 10 },
      ],
    },
  ],
})
export const sphereXYZThroughHoleFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: {
    SPHERE_DIAMETER: { type: 'number', default: 30, min: 1, max: 100, step: 1 },
    HOLE_DIAMETER: { type: 'number', default: 5, min: 0.5, max: 30, step: 0.5 },
  },
  features: [
    { id: 'sphere', type: 'sphere', origin: [0, 0, 0], diameter: 'SPHERE_DIAMETER' },
    {
      id: 'hole_x',
      type: 'cylinder_cut',
      origin: [{ op: 'mul', args: ['SPHERE_DIAMETER', -0.5] }, 0, 0],
      axis: [1, 0, 0],
      diameter: 'HOLE_DIAMETER',
      depth: 'SPHERE_DIAMETER',
    },
    {
      id: 'hole_y',
      type: 'cylinder_cut',
      origin: [0, { op: 'mul', args: ['SPHERE_DIAMETER', -0.5] }, 0],
      axis: [0, 1, 0],
      diameter: 'HOLE_DIAMETER',
      depth: 'SPHERE_DIAMETER',
    },
    {
      id: 'hole_z',
      type: 'cylinder_cut',
      origin: [0, 0, { op: 'mul', args: ['SPHERE_DIAMETER', -0.5] }],
      axis: [0, 0, 1],
      diameter: 'HOLE_DIAMETER',
      depth: 'SPHERE_DIAMETER',
    },
  ],
})
export const hollowRevolveFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: {
    INNER_RADIUS: { type: 'number', default: 8, min: 1, max: 50, step: 1 },
    WALL_THICKNESS: { type: 'number', default: 4, min: 1, max: 20, step: 1 },
    HEIGHT: { type: 'number', default: 10, min: 1, max: 100, step: 1 },
  },
  features: [
    {
      id: 'profile',
      type: 'sketch',
      plane: 'XZ',
      origin: ['INNER_RADIUS', 0, 0],
      profile: { type: 'rectangle', size: ['WALL_THICKNESS', 'HEIGHT'] },
    },
    {
      id: 'body',
      type: 'revolve',
      sketch: 'profile',
      axis_origin: [0, 0, 0],
      axis: [0, 0, 1],
      angle_degrees: 360,
    },
  ],
})
export const chamferedBoxFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: {
    WIDTH: { type: 'number', default: 40, min: 4, max: 200, step: 1 },
    DEPTH: { type: 'number', default: 24, min: 4, max: 200, step: 1 },
    HEIGHT: { type: 'number', default: 12, min: 4, max: 200, step: 1 },
    CHAMFER: { type: 'number', default: 1, min: 0.1, max: 5, step: 0.1 },
  },
  features: [
    { id: 'base', type: 'box', origin: [0, 0, 0], size: ['WIDTH', 'DEPTH', 'HEIGHT'] },
    { id: 'bevel', type: 'chamfer', distance: 'CHAMFER' },
  ],
})
const smokeParametricArtifact = {
  id: 'pma_smoke',
  project_id: projectId,
  conversation_id: 'agc_smoke',
  message_id: 'agm_smoke_parametric',
  title: 'Smoke bracket',
  source_kind: 'litecad-feature-dsl',
  source_code: smokeFeatureDSLSource,
  parameter_values: {},
  compile_status: 'pending',
  compile_error: '',
  preview_model_id: '',
  created_at: now,
  updated_at: now,
}

function parametricArtifact(state: ProjectAPIFixtureState) {
  return {
    ...smokeParametricArtifact,
    title: state.parametricArtifactTitle,
    source_code: state.parametricArtifactSourceCode,
  }
}

const baseSmokeSavedModel = {
  id: 'mdl_smoke_lcad',
  project_id: projectId,
  original_filename: 'smoke-bracket-litecad.lcad.json',
  format: 'lcad',
  content_type: 'application/json',
  byte_size: smokeFeatureDSLSource.length,
  parse_status: 'parsed',
  parse_error: '',
  metadata: {
    asset_type: 'lcad',
    source_kind: 'litecad-feature-dsl',
    version: '1',
    schema: 'litecad-feature-dsl',
    product_names: ['Smoke bracket'],
    components: [],
    length_unit: 'millimetre',
    entity_count: 1,
    parameter_count: 1,
    parameter_values: {},
    compile_summary: 'LiteCAD feature DSL source',
    representation_count: 1,
    triangle_count: 12,
  },
  created_at: now,
  updated_at: now,
}

function smokeSavedModel(state: ProjectAPIFixtureState) {
  return {
    ...baseSmokeSavedModel,
    id: state.savedModelID,
    original_filename: state.savedModelFilename,
    byte_size: state.parametricArtifactSourceCode.length,
    current_revision_id: state.currentModelRevisionID,
    revision_sequence: state.modelRevisionSequence,
    metadata: {
      ...baseSmokeSavedModel.metadata,
      product_names: [state.parametricArtifactTitle],
      entity_count: JSON.parse(state.parametricArtifactSourceCode).features?.length ?? baseSmokeSavedModel.metadata.entity_count,
      parameter_values: state.savedParameterValues,
    },
  }
}

function smokeCADDocument(state: ProjectAPIFixtureState) {
  const modelID = (state.models[0] as { id?: string } | undefined)?.id ?? ''
	const occurrences = state.occurrences.length > 0 ? state.occurrences : (modelID ? [defaultSmokeOccurrence(state, modelID)] : [])
  return {
    id: 'cad_document_smoke',
    project_id: projectId,
    schema_version: 4,
    revision: state.models.length > 0 ? state.cadRevision : 1,
    unit: 'mm',
	assembly: {
		id: `assembly_${projectId}`,
		name: 'Workbench Smoke',
		groups: state.assemblyGroups,
		occurrences: occurrences.map((occurrence) => ({
			...occurrence,
			model_revision_id: occurrence.subassembly_member_id ? occurrence.model_revision_id : state.currentModelRevisionID,
		})),
		constraints: state.assemblyConstraints,
		subassemblies: state.assemblySubassemblies,
	},
    nodes:
      state.models.length > 0
        ? [
            {
              id: `node_${modelID}`,
              model_id: modelID,
              model_revision_id: state.currentModelRevisionID,
              source_model_id: '',
              parent_node_id: '',
              name: state.parametricArtifactTitle,
              source_format: (state.models[0] as { format?: string }).format ?? 'lcad',
              transform: { matrix: [1, 0, 0, state.translationX, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
            },
          ]
        : [],
    operations: [],
    history: {
      head_id: state.historyEntries.length > 0 ? 'hist_smoke_parameter_change' : '',
      can_undo: state.canUndo || state.historyEntries.length > 0,
      can_redo: state.canRedo,
    },
    created_at: now,
    updated_at: now,
  }
}

function defaultSmokeOccurrence(state: ProjectAPIFixtureState, modelID = state.savedModelID): FixtureOccurrence {
	return {
		id: `occurrence_${modelID}`,
		node_id: `node_${modelID}`,
		model_id: modelID,
		model_revision_id: state.currentModelRevisionID,
		parent_group_id: '',
		name: state.parametricArtifactTitle,
		suppressed: false,
		transform: { matrix: [1, 0, 0, state.translationX, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
	}
}

function cloneOccurrences(occurrences: FixtureOccurrence[]) {
	return occurrences.map((occurrence) => ({
		...occurrence,
		transform: { matrix: [...occurrence.transform.matrix] },
	}))
}

function cloneAssemblyGroups(groups: FixtureAssemblyGroup[]) {
	return groups.map((group) => ({ ...group }))
}

function cloneAssemblyConstraints(constraints: FixtureAssemblyConstraint[]) {
	return constraints.map((constraint) => ({
		...constraint,
		first_anchor: [...constraint.first_anchor] as [number, number, number],
		second_anchor: [...constraint.second_anchor] as [number, number, number],
		offset: [...constraint.offset] as [number, number, number],
	}))
}

function cloneSubassemblies(definitions: FixtureSubassemblyDefinition[]) {
	return definitions.map((definition) => ({
		...definition,
		members: definition.members.map((member) => ({
			...member,
			relative_transform: { matrix: [...member.relative_transform.matrix] },
		})),
	}))
}

function assemblySnapshot(state: ProjectAPIFixtureState): FixtureAssemblySnapshot {
	return {
		occurrences: cloneOccurrences(state.occurrences),
		groups: cloneAssemblyGroups(state.assemblyGroups),
		constraints: cloneAssemblyConstraints(state.assemblyConstraints),
		subassemblies: cloneSubassemblies(state.assemblySubassemblies),
	}
}

function restoreAssemblySnapshot(state: ProjectAPIFixtureState, snapshot: FixtureAssemblySnapshot) {
	state.occurrences = cloneOccurrences(snapshot.occurrences)
	state.assemblyGroups = cloneAssemblyGroups(snapshot.groups)
	state.assemblyConstraints = cloneAssemblyConstraints(snapshot.constraints)
	state.assemblySubassemblies = cloneSubassemblies(snapshot.subassemblies)
}

function fixtureTransformPoint(transform: { matrix: number[] }, point: readonly number[]) {
	const matrix = transform.matrix
	return [
		(matrix[0] ?? 1) * (point[0] ?? 0) + (matrix[1] ?? 0) * (point[1] ?? 0) + (matrix[2] ?? 0) * (point[2] ?? 0) + (matrix[3] ?? 0),
		(matrix[4] ?? 0) * (point[0] ?? 0) + (matrix[5] ?? 1) * (point[1] ?? 0) + (matrix[6] ?? 0) * (point[2] ?? 0) + (matrix[7] ?? 0),
		(matrix[8] ?? 0) * (point[0] ?? 0) + (matrix[9] ?? 0) * (point[1] ?? 0) + (matrix[10] ?? 1) * (point[2] ?? 0) + (matrix[11] ?? 0),
	]
}

function solveFixtureAssemblyConstraints(state: ProjectAPIFixtureState) {
	for (const constraint of state.assemblyConstraints) {
		const driver = state.occurrences.find((occurrence) => occurrence.id === constraint.first_occurrence_id)
		const driven = state.occurrences.find((occurrence) => occurrence.id === constraint.second_occurrence_id)
		if (!driver || !driven) continue
		const driverWorld = fixtureTransformPoint(driver.transform, constraint.first_anchor)
		const drivenAnchorWithoutTranslation = fixtureTransformPoint({
			matrix: driven.transform.matrix.map((value, index) => ([3, 7, 11].includes(index) ? 0 : value)),
		}, constraint.second_anchor)
		const nextMatrix = [...driven.transform.matrix]
		for (let axis = 0; axis < 3; axis += 1) {
			nextMatrix[axis * 4 + 3] = (driverWorld[axis] ?? 0) + constraint.offset[axis] - (drivenAnchorWithoutTranslation[axis] ?? 0)
		}
		driven.transform = { matrix: nextMatrix }
		constraint.residual = 0
	}
}

function recordAssemblyMutation(state: ProjectAPIFixtureState) {
	state.assemblyUndoStack.push(assemblySnapshot(state))
	state.assemblyRedoStack = []
	state.cadRevision += 1
	state.canUndo = true
	state.canRedo = false
}

async function fulfillAPI(route: Route, state: ProjectAPIFixtureState) {
  const request = route.request()
  const pathname = new URL(request.url()).pathname
  const responses: Record<string, unknown> = {
    '/api/v1/auth/me': { user: { id: 'user_smoke', name: 'Smoke User', email: 'smoke@example.com' } },
    [`/api/v1/projects/${projectId}`]: {
      project: {
        id: projectId,
        name: 'Workbench Smoke',
        description: 'Deterministic browser verification project.',
        thumbnail: { model_count: state.models.length, models: state.models },
        created_at: now,
        updated_at: now,
      },
    },
    [`/api/v1/projects/${projectId}/models`]: { models: state.models },
    [`/api/v1/projects/${projectId}/agent/conversations`]: {
      conversations: [{ id: 'agc_smoke', project_id: projectId, title: 'Smoke chat', created_at: now, updated_at: now }],
    },
    [`/api/v1/projects/${projectId}/agent/conversations/agc_smoke/messages`]: { messages: state.messages },
    [`/api/v1/projects/${projectId}/parametric-artifacts`]: { artifacts: [] },
    [`/api/v1/projects/${projectId}/export-artifacts`]: {
      artifacts: state.exportArtifacts.map(({ step_text: _stepText, ...artifact }) => artifact),
    },
    [`/api/v1/projects/${projectId}/inspection-records`]: {
      records: state.inspectionRecords,
    },
    [`/api/v1/projects/${projectId}/section-artifacts`]: {
      artifacts: state.sectionArtifacts.map(({ step_text: _stepText, ...artifact }) => artifact),
    },
    [`/api/v1/projects/${projectId}/cad-document`]: { document: smokeCADDocument(state) },
    [`/api/v1/projects/${projectId}/cad-document/history`]: { entries: state.historyEntries },
  }
  if (request.method() === 'GET' && pathname in responses) {
    await route.fulfill({ json: responses[pathname] })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/agent/conversations/agc_smoke/messages`) {
    const requestBody = request.postDataJSON() as {
      client_request_id?: string
      messages?: Array<{ role: 'assistant' | 'user'; body: string }>
    }
    const userMessageBody = requestBody.messages?.at(-1)?.body ?? 'Inspect smoke project'
    state.messages = [
      {
        id: 'agm_smoke_user',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        client_request_id: requestBody.client_request_id,
        role: 'user',
        body: userMessageBody,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'agm_smoke',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        client_request_id: requestBody.client_request_id,
        role: 'assistant',
        body: 'Smoke reply ready.',
        created_at: now,
        updated_at: now,
      },
    ]
    await route.fulfill({
      json: {
        message: state.messages[1],
      },
    })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/agent/conversations/agc_smoke/messages/stream`) {
    const requestBody = request.postDataJSON() as {
      client_request_id?: string
      messages?: Array<{ role: 'assistant' | 'user'; body: string }>
    }
    const userMessageBody = requestBody.messages?.at(-1)?.body ?? 'Inspect smoke project'
    state.messages = [
      {
        id: 'agm_smoke_user',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        client_request_id: requestBody.client_request_id,
        role: 'user',
        body: userMessageBody,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'agm_smoke',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        client_request_id: requestBody.client_request_id,
        role: 'assistant',
        body: 'Smoke reply ready.',
        created_at: now,
        updated_at: now,
      },
    ]
    const streamFrames = [
      'event: status\ndata: {"type":"status","stage":"accepted"}\n\n',
      'event: status\ndata: {"type":"status","stage":"context"}\n\n',
      'event: status\ndata: {"type":"status","stage":"provider"}\n\n',
      'event: reasoning\ndata: {"type":"reasoning","delta":"Checking the smoke project context."}\n\n',
      'event: content\ndata: {"type":"content","delta":"Smoke reply "}\n\n',
      'event: content\ndata: {"type":"content","delta":"ready."}\n\n',
      'event: status\ndata: {"type":"status","stage":"persisting"}\n\n',
      'event: status\ndata: {"type":"status","stage":"complete"}\n\n',
      `event: result\ndata: ${JSON.stringify({ message: state.messages[1] })}\n\n`,
    ]
    await route.fulfill({
      body: streamFrames.join(''),
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
      },
      status: 200,
    })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/agent/conversations/agc_smoke/parametric-runs`) {
    const requestBody = request.postDataJSON() as { message?: string }
    if (state.parametricRunDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, state.parametricRunDelayMs))
    }
    if (state.parametricRunErrorMessage) {
      await route.fulfill({ json: { message: state.parametricRunErrorMessage }, status: 422 })
      return
    }
    const assistantMessage = {
      id: 'agm_smoke_parametric',
      project_id: projectId,
      conversation_id: 'agc_smoke',
      role: 'assistant',
      body: JSON.stringify({
        tool: 'build_parametric_model',
        input: {
          title: parametricArtifact(state).title,
          version: 'v1',
          source_kind: 'litecad-feature-dsl',
          code: parametricArtifact(state).source_code,
        },
      }),
      parts: [
        {
          type: 'artifact',
          artifact_id: smokeParametricArtifact.id,
        },
      ],
      created_at: now,
      updated_at: now,
    }
    state.messages = [
      ...state.messages,
      {
        id: 'agm_smoke_parametric_user',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        role: 'user',
        body: requestBody.message ?? 'Make a smoke bracket',
        created_at: now,
        updated_at: now,
      },
      assistantMessage,
    ]
    await route.fulfill({
      json: {
        message: assistantMessage,
        artifact: { ...parametricArtifact(state), compile_status: state.artifactCompileStatus },
      },
    })
    return
  }
  if (request.method() === 'PATCH' && pathname === `/api/v1/projects/${projectId}/parametric-artifacts/${smokeParametricArtifact.id}`) {
    const requestBody = request.postDataJSON() as { compile_status?: string }
    state.artifactCompileStatus = requestBody.compile_status ?? state.artifactCompileStatus
    state.artifactUpdateCount += 1
    await route.fulfill({ json: { artifact: { ...parametricArtifact(state), compile_status: state.artifactCompileStatus } } })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/parametric-artifacts/${smokeParametricArtifact.id}/save-model`) {
    if (state.artifactCompileStatus !== 'success') {
      await route.fulfill({ json: { message: 'artifact was not compiled before save' }, status: 400 })
      return
    }
    state.models = [smokeSavedModel(state)]
    await route.fulfill({ json: { model: smokeSavedModel(state) } })
    return
  }
  if (request.method() === 'GET' && pathname === `/api/v1/projects/${projectId}/models/${state.savedModelID}/revisions`) {
    const currentModel = smokeSavedModel(state)
    const currentHistoryCommand = (state.historyEntries[0] as { command_type?: string } | undefined)?.command_type
    const revisions = [
      {
        id: state.currentModelRevisionID,
        project_id: projectId,
        model_id: state.savedModelID,
        parent_revision_id: state.modelRevisionSequence > 1 ? 'mvr_smoke_1' : '',
        sequence: state.modelRevisionSequence,
        byte_size: state.parametricArtifactSourceCode.length,
        metadata: currentModel.metadata,
        content_checksum: `checksum-${state.modelRevisionSequence}`,
        summary:
          state.modelRevisionSequence > 1
            ? currentHistoryCommand === 'feature-graph-change'
              ? 'Updated Feature DSL graph'
              : 'Updated parametric parameters'
            : 'Initial model source',
        is_current: true,
        created_at: now,
      },
    ]
    if (state.modelRevisionSequence > 1) {
      revisions.push({
        ...revisions[0],
        id: 'mvr_smoke_1',
        parent_revision_id: '',
        sequence: 1,
        metadata: { ...currentModel.metadata, parameter_values: {} },
        content_checksum: 'checksum-1',
        summary: 'Initial model source',
        is_current: false,
      })
    }
    await route.fulfill({ json: { revisions } })
    return
  }
  if (
    request.method() === 'POST' &&
    pathname === `/api/v1/projects/${projectId}/models/${state.savedModelID}/revisions/mvr_smoke_1/restore`
  ) {
    state.savedParameterValues = {}
    state.currentModelRevisionID = 'mvr_smoke_1'
    state.modelRevisionSequence = 1
    state.modelRevisionRestoreCount += 1
    state.cadRevision += 1
    state.historyEntries = [
      {
        id: 'hist_smoke_revision_restore',
        sequence: 2,
        status: 'applied',
        command_type: 'model-revision-restore',
        target_id: state.savedModelID,
        summary: `Restore ${state.savedModelFilename} revision 1`,
        created_at: now,
      },
    ]
    state.models = [smokeSavedModel(state)]
    await route.fulfill({ json: { model: smokeSavedModel(state) } })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/thumbnail`) {
    await route.fulfill({
      json: {
        snapshot: {
          url: `/api/v1/projects/${projectId}/thumbnail/smoke.webp`,
          status: 'ready',
          revision: state.models.length > 0 ? 2 : 1,
          width: 320,
          height: 180,
          updated_at: now,
        },
      },
    })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/export-artifacts`) {
    const requestBody = request.postDataJSON() as {
      filename?: string
      content_type?: 'model/step'
      export_kind?: 'single' | 'merged'
      target_count?: number
      source_revision_ids?: string[]
      occurrence_ids?: string[]
      step_text?: string
    }
    state.exportArtifactCreateCount += 1
    const stepText = requestBody.step_text ?? ''
    const artifact: FixtureExportArtifact = {
      id: `pex_smoke_${state.exportArtifactCreateCount}`,
      project_id: projectId,
      filename: requestBody.filename ?? 'litecad-export.step',
      content_type: requestBody.content_type ?? 'model/step',
      export_kind: requestBody.export_kind ?? 'merged',
      target_count: requestBody.target_count ?? 1,
      source_revision_ids: requestBody.source_revision_ids ?? [],
      occurrence_ids: requestBody.occurrence_ids ?? [],
      byte_size: new TextEncoder().encode(stepText).length,
      step_text: stepText,
      created_at: now,
      updated_at: now,
    }
    state.exportArtifacts = [artifact, ...state.exportArtifacts]
    const { step_text: _stepText, ...publicArtifact } = artifact
    await route.fulfill({ json: { artifact: publicArtifact }, status: 201 })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/inspection-records`) {
    const requestBody = request.postDataJSON() as Partial<FixtureInspectionRecord>
    state.inspectionRecordCreateCount += 1
    const record: FixtureInspectionRecord = {
      id: `pir_smoke_${state.inspectionRecordCreateCount}`,
      project_id: projectId,
      kind: requestBody.kind ?? 'measurement',
      name: requestBody.name ?? 'Inspection record',
      cad_document_revision: requestBody.cad_document_revision ?? state.cadRevision,
      unit: requestBody.unit ?? 'mm',
      visible_model_ids: requestBody.visible_model_ids ?? [],
      measurement: requestBody.measurement,
      section: requestBody.section,
      created_at: now,
      updated_at: now,
    }
    state.inspectionRecords = [record, ...state.inspectionRecords]
    await route.fulfill({ json: { record }, status: 201 })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/section-artifacts`) {
    const requestBody = request.postDataJSON() as Partial<FixtureSectionArtifact> & { expected_generation?: number }
    state.sectionArtifactCreateCount += 1
    const stepText = requestBody.step_text ?? ''
    const previous = requestBody.association_id
      ? state.sectionArtifacts.find((candidate) => candidate.association_id === requestBody.association_id && candidate.is_latest)
      : undefined
    if (requestBody.association_id && (!previous || requestBody.expected_generation !== previous.generation)) {
      await route.fulfill({ json: { message: 'section artifact generation is stale' }, status: 409 })
      return
    }
    if (previous) {
      previous.is_latest = false
    }
    const artifact: FixtureSectionArtifact = {
      id: `pse_smoke_${state.sectionArtifactCreateCount}`,
      project_id: projectId,
      association_id: requestBody.association_id ?? `psd_smoke_${state.sectionArtifactCreateCount}`,
      generation: previous ? previous.generation + 1 : 1,
      supersedes_artifact_id: previous?.id ?? '',
      is_latest: true,
      cad_document_revision: requestBody.cad_document_revision ?? state.cadRevision,
      unit: requestBody.unit ?? 'millimetre',
      status: requestBody.status ?? 'empty',
      filename: requestBody.filename ?? 'center-x-section.step',
      content_type: requestBody.content_type ?? 'model/step',
      target_count: requestBody.target_count ?? 1,
      source_revision_ids: requestBody.source_revision_ids ?? [],
      occurrence_ids: requestBody.occurrence_ids ?? [],
      plane_origin: requestBody.plane_origin ?? { x: 0, y: 0, z: 0 },
      plane_normal: requestBody.plane_normal ?? { x: 1, y: 0, z: 0 },
      edge_count: requestBody.edge_count ?? 0,
      byte_size: new TextEncoder().encode(stepText).length,
      step_text: stepText,
      created_at: now,
      updated_at: now,
    }
    state.sectionArtifacts = [artifact, ...state.sectionArtifacts]
    const { step_text: _stepText, ...publicArtifact } = artifact
    await route.fulfill({ json: { artifact: publicArtifact }, status: 201 })
    return
  }
  const inspectionRecordRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/inspection-records/([^/]+)$`))
  if (request.method() === 'DELETE' && inspectionRecordRoute) {
    const recordID = decodeURIComponent(inspectionRecordRoute[1] ?? '')
    state.inspectionRecords = state.inspectionRecords.filter((record) => record.id !== recordID)
    await route.fulfill({ status: 204 })
    return
  }
  const sectionArtifactDownloadRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/section-artifacts/([^/]+)/download$`))
  if (request.method() === 'GET' && sectionArtifactDownloadRoute) {
    const artifactID = decodeURIComponent(sectionArtifactDownloadRoute[1] ?? '')
    const artifact = state.sectionArtifacts.find((candidate) => candidate.id === artifactID)
    if (!artifact || artifact.status !== 'ready') {
      await route.fulfill({ json: { message: 'section artifact geometry unavailable' }, status: 409 })
      return
    }
    await route.fulfill({
      body: artifact.step_text,
      contentType: 'model/step',
      headers: { 'Content-Disposition': `attachment; filename="${artifact.filename}"` },
    })
    return
  }
  const sectionArtifactRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/section-artifacts/([^/]+)$`))
  if (request.method() === 'DELETE' && sectionArtifactRoute) {
    const artifactID = decodeURIComponent(sectionArtifactRoute[1] ?? '')
    state.sectionArtifacts = state.sectionArtifacts.filter((artifact) => artifact.id !== artifactID)
    await route.fulfill({ status: 204 })
    return
  }
  const exportDownloadRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/export-artifacts/([^/]+)/download$`))
  if (request.method() === 'GET' && exportDownloadRoute) {
    const artifactID = decodeURIComponent(exportDownloadRoute[1] ?? '')
    const artifact = state.exportArtifacts.find((candidate) => candidate.id === artifactID)
    if (!artifact) {
      await route.fulfill({ json: { message: 'export artifact not found' }, status: 404 })
      return
    }
    await route.fulfill({
      body: artifact.step_text,
      contentType: 'model/step',
      headers: {
        'Content-Disposition': `attachment; filename="${artifact.filename}"`,
      },
    })
    return
  }
	if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/models`) {
    state.uploadCount += 1
    const uploadedModel = {
      ...smokeSavedModel(state),
      id: 'mdl_smoke_uploaded',
      original_filename: 'uploaded-smoke.stl',
      format: 'stl',
      content_type: 'model/stl',
      parse_status: 'error',
      parse_error: 'preview intentionally unavailable in import fixture',
      metadata: {
        ...smokeSavedModel(state).metadata,
        asset_type: 'model',
        source_kind: '',
        schema: '',
        product_names: ['Uploaded smoke'],
        parameter_count: 0,
        parameter_values: {},
      },
    }
    state.models = [uploadedModel]
		state.occurrences = [
			{
				...defaultSmokeOccurrence(state, uploadedModel.id),
				name: uploadedModel.original_filename,
			},
		]
    await route.fulfill({ json: { model: uploadedModel } })
    return
  }
	const assemblyConstraintRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/cad-document/constraints(?:/([^/]+))?$`))
	const subassemblyRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/cad-document/subassemblies(?:/([^/]+)/instances)?$`))
	if (request.method() === 'POST' && subassemblyRoute) {
		const definitionID = decodeURIComponent(subassemblyRoute[1] ?? '')
		if (!definitionID) {
			const requestBody = request.postDataJSON() as { group_id?: string; name?: string }
			const group = state.assemblyGroups.find((candidate) => candidate.id === requestBody.group_id)
			const members = state.occurrences.filter((occurrence) => occurrence.parent_group_id === requestBody.group_id && !occurrence.subassembly_member_id)
			const hasChildGroup = state.assemblyGroups.some((candidate) => candidate.parent_group_id === requestBody.group_id)
			if (!group || group.subassembly_definition_id || hasChildGroup || members.length === 0 || !requestBody.name?.trim()) {
				await route.fulfill({ json: { message: 'invalid subassembly source group' }, status: 400 })
				return
			}
			recordAssemblyMutation(state)
			state.subassemblyDefinitionCreateCount += 1
			const base = [members[0]!.transform.matrix[3] ?? 0, members[0]!.transform.matrix[7] ?? 0, members[0]!.transform.matrix[11] ?? 0]
			const definition: FixtureSubassemblyDefinition = {
				id: `sub_smoke_${state.subassemblyDefinitionCreateCount}`,
				revision: 1,
				name: requestBody.name.trim(),
				members: members.map((occurrence, index) => {
					const matrix = [...occurrence.transform.matrix]
					matrix[3] = (matrix[3] ?? 0) - base[0]!
					matrix[7] = (matrix[7] ?? 0) - base[1]!
					matrix[11] = (matrix[11] ?? 0) - base[2]!
					return {
						id: `smb_smoke_${state.subassemblyDefinitionCreateCount}_${index + 1}`,
						node_id: occurrence.node_id,
						model_id: occurrence.model_id,
						model_revision_id: occurrence.model_revision_id,
						name: occurrence.name,
						suppressed: occurrence.suppressed,
						relative_transform: { matrix },
					}
				}),
			}
			state.assemblySubassemblies.push(definition)
			state.historyEntries = [{
				id: `hist_subassembly_capture_${state.subassemblyDefinitionCreateCount}`, sequence: state.cadRevision,
				status: 'applied', command_type: 'subassembly-definition-create', target_id: definition.id,
				summary: `Capture subassembly ${definition.name}`, created_at: now,
			}]
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}

		const definition = state.assemblySubassemblies.find((candidate) => candidate.id === definitionID)
		const requestBody = request.postDataJSON() as { name?: string; parent_group_id?: string; translation?: [number, number, number] }
		if (!definition || !requestBody.name?.trim() || !requestBody.translation?.every(Number.isFinite)) {
			await route.fulfill({ json: { message: 'invalid subassembly instance' }, status: 400 })
			return
		}
		recordAssemblyMutation(state)
		state.subassemblyInstanceCreateCount += 1
		const group: FixtureAssemblyGroup = {
			id: `grp_subassembly_${state.subassemblyInstanceCreateCount}`,
			parent_group_id: requestBody.parent_group_id ?? '',
			name: requestBody.name.trim(),
			suppressed: false,
			subassembly_definition_id: definition.id,
			subassembly_definition_revision: definition.revision,
		}
		state.assemblyGroups.push(group)
		for (const [index, member] of definition.members.entries()) {
			const matrix = [...member.relative_transform.matrix]
			matrix[3] = (matrix[3] ?? 0) + requestBody.translation[0]
			matrix[7] = (matrix[7] ?? 0) + requestBody.translation[1]
			matrix[11] = (matrix[11] ?? 0) + requestBody.translation[2]
			state.occurrences.push({
				id: `occ_subassembly_${state.subassemblyInstanceCreateCount}_${index + 1}`,
				node_id: member.node_id,
				model_id: member.model_id,
				model_revision_id: member.model_revision_id,
				parent_group_id: group.id,
				subassembly_member_id: member.id,
				name: member.name,
				suppressed: member.suppressed,
				transform: { matrix },
			})
		}
		state.historyEntries = [{
			id: `hist_subassembly_instance_${state.subassemblyInstanceCreateCount}`, sequence: state.cadRevision,
			status: 'applied', command_type: 'subassembly-instance-create', target_id: group.id,
			summary: `Instantiate subassembly ${group.name}`, created_at: now,
		}]
		await route.fulfill({ json: { document: smokeCADDocument(state) } })
		return
	}
	if (assemblyConstraintRoute) {
		const constraintID = decodeURIComponent(assemblyConstraintRoute[1] ?? '')
		if (request.method() === 'POST' && !constraintID) {
			const requestBody = request.postDataJSON() as {
				name?: string
				first_occurrence_id?: string
				second_occurrence_id?: string
				first_anchor?: [number, number, number]
				second_anchor?: [number, number, number]
				offset?: [number, number, number]
			}
			const hasInbound = state.assemblyConstraints.some((constraint) => constraint.second_occurrence_id === requestBody.second_occurrence_id)
			const closesCycle = state.assemblyConstraints.some(
				(constraint) => constraint.first_occurrence_id === requestBody.second_occurrence_id && constraint.second_occurrence_id === requestBody.first_occurrence_id,
			)
			if (!requestBody.first_occurrence_id || !requestBody.second_occurrence_id || requestBody.first_occurrence_id === requestBody.second_occurrence_id || hasInbound || closesCycle) {
				await route.fulfill({ json: { message: 'invalid assembly constraint' }, status: 400 })
				return
			}
			recordAssemblyMutation(state)
			state.assemblyConstraintCreateCount += 1
			const constraint: FixtureAssemblyConstraint = {
				id: `cst_smoke_${state.assemblyConstraintCreateCount}`,
				kind: 'mate',
				name: requestBody.name ?? `Point mate ${state.assemblyConstraintCreateCount}`,
				first_occurrence_id: requestBody.first_occurrence_id,
				second_occurrence_id: requestBody.second_occurrence_id,
				status: 'solved',
				solver: 'point-coincident-v1',
				first_anchor: requestBody.first_anchor ?? [0, 0, 0],
				second_anchor: requestBody.second_anchor ?? [0, 0, 0],
				offset: requestBody.offset ?? [0, 0, 0],
				residual: 0,
			}
			state.assemblyConstraints.push(constraint)
			solveFixtureAssemblyConstraints(state)
			state.historyEntries = [{
				id: `hist_assembly_constraint_create_${state.assemblyConstraintCreateCount}`, sequence: state.cadRevision,
				status: 'applied', command_type: 'assembly-constraint-create', target_id: constraint.id,
				summary: `Record mate ${constraint.name}`, created_at: now,
			}]
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
		const constraintIndex = state.assemblyConstraints.findIndex((constraint) => constraint.id === constraintID)
		if (constraintIndex < 0) {
			await route.fulfill({ json: { message: 'assembly constraint not found' }, status: 404 })
			return
		}
		if (request.method() === 'DELETE') {
			recordAssemblyMutation(state)
			state.assemblyConstraints.splice(constraintIndex, 1)
			state.assemblyConstraintDeleteCount += 1
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
	}
	const assemblyGroupRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/cad-document/groups(?:/([^/]+))?$`))
	if (assemblyGroupRoute) {
		const groupID = decodeURIComponent(assemblyGroupRoute[1] ?? '')
		if (request.method() === 'POST' && !groupID) {
			const requestBody = request.postDataJSON() as { name?: string; parent_group_id?: string }
			recordAssemblyMutation(state)
			state.assemblyGroupCreateCount += 1
			const group: FixtureAssemblyGroup = {
				id: `grp_smoke_${state.assemblyGroupCreateCount}`,
				parent_group_id: requestBody.parent_group_id ?? '',
				name: requestBody.name ?? `Group ${state.assemblyGroupCreateCount}`,
				suppressed: false,
			}
			state.assemblyGroups.push(group)
			state.historyEntries = [{
				id: `hist_assembly_group_create_${state.assemblyGroupCreateCount}`, sequence: state.cadRevision,
				status: 'applied', command_type: 'assembly-group-create', target_id: group.id,
				summary: `Create group ${group.name}`, created_at: now,
			}]
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
		const groupIndex = state.assemblyGroups.findIndex((group) => group.id === groupID)
		if (groupIndex < 0) {
			await route.fulfill({ json: { message: 'assembly group not found' }, status: 404 })
			return
		}
		if (request.method() === 'PATCH') {
			const requestBody = request.postDataJSON() as { name?: string; parent_group_id?: string; suppressed?: boolean }
			if (state.assemblyGroups[groupIndex]!.subassembly_definition_id && (requestBody.name !== undefined || requestBody.parent_group_id !== undefined)) {
				await route.fulfill({ json: { message: 'subassembly instance group is immutable' }, status: 400 })
				return
			}
			recordAssemblyMutation(state)
			state.assemblyGroupUpdateCount += 1
			state.assemblyGroups[groupIndex] = {
				...state.assemblyGroups[groupIndex]!,
				...(requestBody.name !== undefined ? { name: requestBody.name } : {}),
				...(requestBody.parent_group_id !== undefined ? { parent_group_id: requestBody.parent_group_id } : {}),
				...(requestBody.suppressed !== undefined ? { suppressed: requestBody.suppressed } : {}),
			}
			state.historyEntries = [{
				id: `hist_assembly_group_update_${state.assemblyGroupUpdateCount}`, sequence: state.cadRevision,
				status: 'applied', command_type: 'assembly-group-update', target_id: groupID,
				summary: `Update group ${state.assemblyGroups[groupIndex]!.name}`, created_at: now,
			}]
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
		if (request.method() === 'DELETE') {
			const hasContents = state.assemblyGroups.some((group) => group.parent_group_id === groupID) || state.occurrences.some((occurrence) => occurrence.parent_group_id === groupID)
			if (hasContents) {
				await route.fulfill({ json: { message: 'assembly group is not empty' }, status: 400 })
				return
			}
			recordAssemblyMutation(state)
			state.assemblyGroups.splice(groupIndex, 1)
			state.assemblyGroupDeleteCount += 1
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
	}
	const occurrenceRoute = pathname.match(new RegExp(`^/api/v1/projects/${projectId}/cad-document/occurrences/([^/]+)(?:/(duplicate|move))?$`))
	if (occurrenceRoute) {
		if (state.occurrences.length === 0 && state.models.length > 0) {
			state.occurrences = [defaultSmokeOccurrence(state, (state.models[0] as { id: string }).id)]
		}
		const occurrenceID = decodeURIComponent(occurrenceRoute[1] ?? '')
		const action = occurrenceRoute[2]
		const occurrenceIndex = state.occurrences.findIndex((occurrence) => occurrence.id === occurrenceID)
		if (occurrenceIndex < 0) {
			await route.fulfill({ json: { message: 'occurrence not found' }, status: 404 })
			return
		}
		if (state.occurrences[occurrenceIndex]!.subassembly_member_id) {
			await route.fulfill({ json: { message: 'subassembly instance member is immutable' }, status: 400 })
			return
		}
		if (request.method() === 'POST' && action === 'duplicate') {
			recordAssemblyMutation(state)
			const source = state.occurrences[occurrenceIndex]!
			state.occurrenceDuplicateCount += 1
			state.occurrences.splice(occurrenceIndex + 1, 0, {
				...source,
				id: `occ_smoke_copy_${state.occurrenceDuplicateCount}`,
				name: `${source.name} copy`,
				transform: { matrix: [...source.transform.matrix] },
			})
			state.historyEntries = [{
				id: `hist_occurrence_duplicate_${state.occurrenceDuplicateCount}`, sequence: state.cadRevision,
				status: 'applied', command_type: 'occurrence-create', target_id: occurrenceID,
				summary: `Duplicate ${source.name}`, created_at: now,
			}]
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
		if (request.method() === 'PATCH' && !action) {
			if (state.conflictNextTransform) {
				state.conflictNextTransform = false
				await route.fulfill({ json: { message: 'document revision conflict' }, status: 409 })
				return
			}
			const requestBody = request.postDataJSON() as { name?: string; suppressed?: boolean; parent_group_id?: string; transform?: { matrix?: number[] } }
			if (requestBody.transform?.matrix) {
				if (state.assemblyConstraints.some((constraint) => constraint.second_occurrence_id === occurrenceID)) {
					await route.fulfill({ json: { message: 'driven occurrence placement is solver-owned' }, status: 400 })
					return
				}
				if (state.assemblyConstraints.length > 0) {
					recordAssemblyMutation(state)
				}
				state.translationX = requestBody.transform.matrix[3] ?? 0
				state.occurrences[occurrenceIndex] = {
					...state.occurrences[occurrenceIndex]!,
					transform: { matrix: [...requestBody.transform.matrix] },
				}
				state.transformUpdateCount += 1
				if (state.assemblyConstraints.length === 0) {
					state.cadRevision += 1
					state.canUndo = true
					state.canRedo = false
				}
				solveFixtureAssemblyConstraints(state)
			} else {
				recordAssemblyMutation(state)
			}
			state.occurrenceUpdateCount += 1
			state.occurrences[occurrenceIndex] = {
				...state.occurrences[occurrenceIndex]!,
				...(requestBody.name !== undefined ? { name: requestBody.name } : {}),
				...(requestBody.suppressed !== undefined ? { suppressed: requestBody.suppressed } : {}),
				...(requestBody.parent_group_id !== undefined ? { parent_group_id: requestBody.parent_group_id } : {}),
			}
			state.historyEntries = [{
				id: `hist_occurrence_update_${state.occurrenceUpdateCount}`, sequence: state.cadRevision,
				status: 'applied', command_type: 'occurrence-update', target_id: occurrenceID,
				summary: `Update ${state.occurrences[occurrenceIndex]!.name}`, created_at: now,
			}]
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
		if (request.method() === 'POST' && action === 'move') {
			const requestBody = request.postDataJSON() as { target_index?: number }
			const targetIndex = requestBody.target_index ?? occurrenceIndex
			if (targetIndex < 0 || targetIndex >= state.occurrences.length || targetIndex === occurrenceIndex) {
				await route.fulfill({ json: { message: 'invalid occurrence move' }, status: 400 })
				return
			}
			recordAssemblyMutation(state)
			const [occurrence] = state.occurrences.splice(occurrenceIndex, 1)
			state.occurrences.splice(targetIndex, 0, occurrence!)
			state.occurrenceMoveCount += 1
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
		if (request.method() === 'DELETE' && !action) {
			if (state.occurrences.filter((occurrence) => occurrence.model_id === state.occurrences[occurrenceIndex]!.model_id).length <= 1) {
				await route.fulfill({ json: { message: 'last occurrence' }, status: 400 })
				return
			}
			recordAssemblyMutation(state)
			state.occurrences.splice(occurrenceIndex, 1)
			state.occurrenceDeleteCount += 1
			await route.fulfill({ json: { document: smokeCADDocument(state) } })
			return
		}
	}
  if (
    request.method() === 'PATCH' &&
    pathname === `/api/v1/projects/${projectId}/cad-document/nodes/node_mdl_smoke_lcad/transform`
  ) {
    if (state.conflictNextTransform) {
      state.conflictNextTransform = false
      await route.fulfill({ json: { message: 'document revision conflict' }, status: 409 })
      return
    }
    const requestBody = request.postDataJSON() as { transform?: { matrix?: number[] } }
    state.translationX = requestBody.transform?.matrix?.[3] ?? 0
    state.transformUpdateCount += 1
    state.cadRevision += 1
    state.canUndo = true
    state.canRedo = false
    state.historyEntries = [
      {
        id: 'hist_smoke_transform',
        sequence: state.transformUpdateCount,
        status: 'applied',
        command_type: 'transform',
        target_id: 'node_mdl_smoke_lcad',
        summary: 'Move Smoke bracket',
        created_at: now,
      },
    ]
    await route.fulfill({ json: { document: smokeCADDocument(state) } })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/cad-document/history/undo`) {
    state.undoCount += 1
    const historyEntry = state.historyEntries[0] as { command_type?: string; status?: string } | undefined
    if (historyEntry?.command_type === 'feature-graph-change') {
      state.parametricArtifactSourceCode = state.featureGraphBeforeSourceCode
      state.currentModelRevisionID = state.featureGraphBeforeRevisionID
      state.modelRevisionSequence = state.featureGraphBeforeRevisionSequence
      historyEntry.status = 'undone'
      state.models = [smokeSavedModel(state)]
	} else if (state.assemblyUndoStack.length > 0) {
		state.assemblyRedoStack.push(assemblySnapshot(state))
		restoreAssemblySnapshot(state, state.assemblyUndoStack.pop()!)
    } else {
      state.translationX = 0
      state.occurrences = state.occurrences.map((occurrence) => ({
        ...occurrence,
        transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      }))
    }
    state.cadRevision += 1
    state.canUndo = false
    state.canRedo = true
    await route.fulfill({ json: { document: smokeCADDocument(state) } })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/cad-document/history/redo`) {
    state.redoCount += 1
    const historyEntry = state.historyEntries[0] as { command_type?: string; status?: string } | undefined
    if (historyEntry?.command_type === 'feature-graph-change') {
      state.parametricArtifactSourceCode = state.featureGraphAfterSourceCode
      state.currentModelRevisionID = state.featureGraphAfterRevisionID
      state.modelRevisionSequence = state.featureGraphAfterRevisionSequence
      historyEntry.status = 'applied'
      state.models = [smokeSavedModel(state)]
	} else if (state.assemblyRedoStack.length > 0) {
		state.assemblyUndoStack.push(assemblySnapshot(state))
		restoreAssemblySnapshot(state, state.assemblyRedoStack.pop()!)
    } else {
      state.translationX = 12
      state.occurrences = state.occurrences.map((occurrence) => ({
        ...occurrence,
        transform: { matrix: [1, 0, 0, 12, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      }))
    }
    state.cadRevision += 1
    state.canUndo = true
    state.canRedo = false
    await route.fulfill({ json: { document: smokeCADDocument(state) } })
    return
  }
  if (request.method() === 'PATCH' && pathname === `/api/v1/projects/${projectId}/models/${state.savedModelID}/feature-dsl-graph`) {
    const requestBody = request.postDataJSON() as { source_code?: string; expected_revision?: number }
    if (requestBody.expected_revision !== state.cadRevision) {
      await route.fulfill({ json: { message: 'document revision conflict' }, status: 409 })
      return
    }
    state.featureGraphBeforeSourceCode = state.parametricArtifactSourceCode
    state.featureGraphBeforeRevisionID = state.currentModelRevisionID
    state.featureGraphBeforeRevisionSequence = state.modelRevisionSequence
    state.parametricArtifactSourceCode = requestBody.source_code ?? state.parametricArtifactSourceCode
    state.modelRevisionSequence += 1
    state.currentModelRevisionID = `mvr_smoke_${state.modelRevisionSequence}`
    state.featureGraphAfterSourceCode = state.parametricArtifactSourceCode
    state.featureGraphAfterRevisionID = state.currentModelRevisionID
    state.featureGraphAfterRevisionSequence = state.modelRevisionSequence
    state.featureGraphUpdateCount += 1
    state.cadRevision += 1
    state.canUndo = true
    state.canRedo = false
    state.historyEntries = [
      {
        id: 'hist_smoke_feature_graph_change',
        sequence: 3,
        status: 'applied',
        command_type: 'feature-graph-change',
        target_id: state.savedModelID,
        summary: `Update feature graph for ${state.savedModelFilename}`,
        feature_graph_version: 1,
        feature_graph_transitions: fixtureFeatureGraphTransitions(
          state.featureGraphBeforeSourceCode,
          state.featureGraphAfterSourceCode,
        ),
        created_at: now,
      },
    ]
    state.models = [smokeSavedModel(state)]
    await route.fulfill({ json: { model: smokeSavedModel(state) } })
    return
  }
  if (request.method() === 'PATCH' && pathname === `/api/v1/projects/${projectId}/models/${state.savedModelID}/parametric-parameters`) {
    const requestBody = request.postDataJSON() as { parameter_values?: Record<string, unknown> }
    state.savedParameterValues = requestBody.parameter_values ?? {}
    state.modelParameterUpdateCount += 1
    state.modelRevisionSequence += 1
    state.currentModelRevisionID = `mvr_smoke_${state.modelRevisionSequence}`
    state.cadRevision += 1
    state.historyEntries = [
      {
        id: 'hist_smoke_parameter_change',
        sequence: 1,
        status: 'applied',
        command_type: 'parameter-change',
        target_id: state.savedModelID,
        summary: `Update parameters for ${state.savedModelFilename}`,
        created_at: now,
      },
    ]
    state.models = [smokeSavedModel(state)]
    await route.fulfill({ json: { model: smokeSavedModel(state) } })
    return
  }
  if (request.method() === 'GET' && pathname === `/api/v1/projects/${projectId}/models/${state.savedModelID}/source`) {
    state.featureDSLSourceRequestCount += 1
    await route.fulfill({
      body: state.parametricArtifactSourceCode,
      contentType: 'application/json',
    })
    return
  }
	if (
		request.method() === 'GET' &&
		pathname === `/api/v1/projects/${projectId}/models/${state.savedModelID}/revisions/${state.currentModelRevisionID}/source`
	) {
		state.featureDSLSourceRequestCount += 1
		await route.fulfill({
			body: state.parametricArtifactSourceCode,
			contentType: 'application/json',
		})
		return
	}
  await route.fulfill({ json: { message: `Unhandled smoke request: ${request.method()} ${pathname}` }, status: 500 })
}

type FixtureFeatureGraphNode = {
  id: string
  type: string
  path: string
  index: number
  parentID: string
  canonical: string
}

function fixtureFeatureGraphTransitions(beforeSourceCode: string, afterSourceCode: string) {
  const beforeNodes = fixtureFeatureGraphNodes(beforeSourceCode)
  const afterNodes = fixtureFeatureGraphNodes(afterSourceCode)
  const beforeByID = new Map(beforeNodes.map((node) => [node.id, node]))
  const afterByID = new Map(afterNodes.map((node) => [node.id, node]))
  const transitions: Array<Record<string, unknown>> = []

  for (const after of afterNodes) {
    const before = beforeByID.get(after.id)
    if (!before) {
      transitions.push({
        node_id: after.id,
        change: 'added',
        after_type: after.type,
        after_path: after.path,
        after_index: after.index,
      })
      continue
    }
    if (before.type !== after.type || before.canonical !== after.canonical) {
      transitions.push({
        node_id: after.id,
        change: 'updated',
        before_type: before.type,
        after_type: after.type,
        before_path: before.path,
        after_path: after.path,
        before_index: before.index,
        after_index: after.index,
      })
    }
    if (before.parentID !== after.parentID || before.index !== after.index) {
      transitions.push({
        node_id: after.id,
        change: 'moved',
        before_type: before.type,
        after_type: after.type,
        before_path: before.path,
        after_path: after.path,
        before_index: before.index,
        after_index: after.index,
      })
    }
  }

  for (const before of beforeNodes) {
    if (!afterByID.has(before.id)) {
      transitions.push({
        node_id: before.id,
        change: 'removed',
        before_type: before.type,
        before_path: before.path,
        before_index: before.index,
      })
    }
  }
  return transitions
}

function fixtureFeatureGraphNodes(sourceCode: string): FixtureFeatureGraphNode[] {
  const document = JSON.parse(sourceCode) as { features?: Array<Record<string, unknown>> }
  const nodes: FixtureFeatureGraphNode[] = []
  const append = (features: Array<Record<string, unknown>>, parentID: string, parentPath: string) => {
    features.forEach((feature, index) => {
      const id = String(feature.id ?? '')
      const type = String(feature.type ?? '')
      const path = parentPath ? `${parentPath}/operands/${id}` : `features/${id}`
      const local = { ...feature }
      delete local.operands
      nodes.push({ id, type, path, index, parentID, canonical: JSON.stringify(local) })
      if (type === 'boolean' && Array.isArray(feature.operands)) {
        append(feature.operands as Array<Record<string, unknown>>, id, path)
      }
    })
  }
  append(document.features ?? [], '', '')
  return nodes
}

export function captureBrowserErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`)
    }
  })
  return errors
}

export async function installProjectAPIFixture(page: Page, state = createProjectFixtureState()) {
  await page.route('**/api/v1/**', (route) => fulfillAPI(route, state))
  return {
    state,
    seedSavedModel() {
      state.models = [smokeSavedModel(state)]
			state.occurrences = [defaultSmokeOccurrence(state)]
    },
    seedSubassemblySource() {
      state.models = [smokeSavedModel(state)]
			state.assemblyGroups = [{ id: 'grp_subassembly_source', parent_group_id: '', name: 'Drive source', suppressed: false }]
			const first = { ...defaultSmokeOccurrence(state), parent_group_id: 'grp_subassembly_source', name: 'Drive left' }
			state.occurrences = [
				first,
				{
					...first,
					id: 'occurrence_subassembly_source_right',
					name: 'Drive right',
					transform: { matrix: [1, 0, 0, 15, 0, 1, 0, 5, 0, 0, 1, 0, 0, 0, 0, 1] },
				},
			]
    },
    seedTransformModel() {
      state.models = [
        {
          ...smokeSavedModel(state),
          original_filename: 'smoke-bracket.glb',
          format: 'glb',
          content_type: 'model/gltf-binary',
          parse_status: 'error',
          parse_error: 'preview intentionally unavailable in transform fixture',
          metadata: {
            ...smokeSavedModel(state).metadata,
            asset_type: 'model',
            source_kind: '',
            schema: '',
            parameter_count: 0,
            parameter_values: {},
          },
        },
      ]
			state.occurrences = [defaultSmokeOccurrence(state)]
    },
  }
}
