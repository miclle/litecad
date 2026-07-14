import type { Page, Route } from '@playwright/test'

export const projectId = 'project_smoke'
const now = '2026-07-10T00:00:00Z'

type FixtureOccurrence = {
	id: string
	node_id: string
	model_id: string
	model_revision_id: string
	name: string
	suppressed: boolean
	transform: { matrix: number[] }
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
	occurrences: FixtureOccurrence[]
	occurrenceUndoStack: FixtureOccurrence[][]
	occurrenceRedoStack: FixtureOccurrence[][]
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
		occurrences: [],
		occurrenceUndoStack: [],
		occurrenceRedoStack: [],
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
    schema_version: 2,
    revision: state.models.length > 0 ? state.cadRevision : 1,
    unit: 'mm',
	assembly: {
		id: `assembly_${projectId}`,
		name: 'Workbench Smoke',
		occurrences: occurrences.map((occurrence) => ({ ...occurrence, model_revision_id: state.currentModelRevisionID })),
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

function recordOccurrenceMutation(state: ProjectAPIFixtureState) {
	state.occurrenceUndoStack.push(cloneOccurrences(state.occurrences))
	state.occurrenceRedoStack = []
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
    [`/api/v1/projects/${projectId}/cad-document`]: { document: smokeCADDocument(state) },
    [`/api/v1/projects/${projectId}/cad-document/history`]: { entries: state.historyEntries },
  }
  if (request.method() === 'GET' && pathname in responses) {
    await route.fulfill({ json: responses[pathname] })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/agent/conversations/agc_smoke/messages`) {
    const requestBody = request.postDataJSON() as { messages?: Array<{ role: 'assistant' | 'user'; body: string }> }
    const userMessageBody = requestBody.messages?.at(-1)?.body ?? 'Inspect smoke project'
    state.messages = [
      {
        id: 'agm_smoke_user',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        role: 'user',
        body: userMessageBody,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'agm_smoke',
        project_id: projectId,
        conversation_id: 'agc_smoke',
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
        summary: state.modelRevisionSequence > 1 ? 'Updated parametric parameters' : 'Initial model source',
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
		if (request.method() === 'POST' && action === 'duplicate') {
			recordOccurrenceMutation(state)
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
			const requestBody = request.postDataJSON() as { name?: string; suppressed?: boolean; transform?: { matrix?: number[] } }
			if (requestBody.transform?.matrix) {
				state.translationX = requestBody.transform.matrix[3] ?? 0
				state.occurrences[occurrenceIndex] = {
					...state.occurrences[occurrenceIndex]!,
					transform: { matrix: [...requestBody.transform.matrix] },
				}
				state.transformUpdateCount += 1
				state.cadRevision += 1
				state.canUndo = true
				state.canRedo = false
			} else {
				recordOccurrenceMutation(state)
			}
			state.occurrenceUpdateCount += 1
			state.occurrences[occurrenceIndex] = {
				...state.occurrences[occurrenceIndex]!,
				...(requestBody.name !== undefined ? { name: requestBody.name } : {}),
				...(requestBody.suppressed !== undefined ? { suppressed: requestBody.suppressed } : {}),
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
			recordOccurrenceMutation(state)
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
			recordOccurrenceMutation(state)
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
		if (state.occurrenceUndoStack.length > 0) {
			state.occurrenceRedoStack.push(cloneOccurrences(state.occurrences))
			state.occurrences = state.occurrenceUndoStack.pop()!
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
		if (state.occurrenceRedoStack.length > 0) {
			state.occurrenceUndoStack.push(cloneOccurrences(state.occurrences))
			state.occurrences = state.occurrenceRedoStack.pop()!
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
