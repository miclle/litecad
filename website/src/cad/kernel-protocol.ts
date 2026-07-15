export type CadKernelMesh = {
  positions: number[]
  normals: number[]
  indices: number[]
}

export type CadKernelMeshSummary = {
  vertexCount: number
  triangleCount: number
  hasNormals: boolean
}

export type CadKernelBoxFeature = {
  origin: readonly number[]
  size: readonly number[]
}

export type CadKernelFeatureDSLArithmeticExpression = {
  op: 'add' | 'sub' | 'mul' | 'div'
  args: readonly [CadKernelFeatureDSLExpression, CadKernelFeatureDSLExpression]
}

export type CadKernelFeatureDSLExpression = number | string | CadKernelFeatureDSLArithmeticExpression

export type CadKernelFeatureDSLNumberParameter = {
  type: 'number'
  default: number
  min?: number
  max?: number
  step?: number
}

export type CadKernelFeatureDSLBooleanParameter = {
  type: 'boolean'
  default: boolean
}

export type CadKernelFeatureDSLStringParameter = {
  type: 'string'
  default: string
  options?: string[]
}

export type CadKernelFeatureDSLParameter =
  | CadKernelFeatureDSLNumberParameter
  | CadKernelFeatureDSLBooleanParameter
  | CadKernelFeatureDSLStringParameter

export type CadKernelFeatureDSLRepeat = {
  count: number
  step: readonly CadKernelFeatureDSLExpression[]
}

export type CadKernelFeatureDSLTransform = {
  translate?: readonly CadKernelFeatureDSLExpression[]
  rotate?: {
    axis: readonly CadKernelFeatureDSLExpression[]
    angle_degrees: CadKernelFeatureDSLExpression
    origin?: readonly CadKernelFeatureDSLExpression[]
  }
  scale?: readonly CadKernelFeatureDSLExpression[]
}

export type CadKernelFeatureDSLBoxFeature = {
  id: string
  type: 'box'
  origin?: readonly CadKernelFeatureDSLExpression[]
  size: readonly CadKernelFeatureDSLExpression[]
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLBoxCutFeature = {
  id: string
  type: 'box_cut'
  origin?: readonly CadKernelFeatureDSLExpression[]
  size: readonly CadKernelFeatureDSLExpression[]
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLCylinderFeature = {
  id: string
  type: 'cylinder'
  origin: readonly CadKernelFeatureDSLExpression[]
  axis?: readonly CadKernelFeatureDSLExpression[]
  radius?: CadKernelFeatureDSLExpression
  diameter?: CadKernelFeatureDSLExpression
  height: CadKernelFeatureDSLExpression
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLCylinderCutFeature = {
  id: string
  type: 'cylinder_cut'
  origin: readonly CadKernelFeatureDSLExpression[]
  axis?: readonly CadKernelFeatureDSLExpression[]
  radius?: CadKernelFeatureDSLExpression
  diameter?: CadKernelFeatureDSLExpression
  depth: CadKernelFeatureDSLExpression
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLSphereFeature = {
  id: string
  type: 'sphere'
  origin: readonly CadKernelFeatureDSLExpression[]
  radius?: CadKernelFeatureDSLExpression
  diameter?: CadKernelFeatureDSLExpression
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLEllipsoidFeature = {
  id: string
  type: 'ellipsoid'
  origin: readonly CadKernelFeatureDSLExpression[]
  radius_x?: CadKernelFeatureDSLExpression
  radius_y?: CadKernelFeatureDSLExpression
  radius_z?: CadKernelFeatureDSLExpression
  diameter_x?: CadKernelFeatureDSLExpression
  diameter_y?: CadKernelFeatureDSLExpression
  diameter_z?: CadKernelFeatureDSLExpression
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLEllipseExtrudeFeature = {
  id: string
  type: 'ellipse_extrude'
  origin: readonly CadKernelFeatureDSLExpression[]
  radius_x?: CadKernelFeatureDSLExpression
  radius_y?: CadKernelFeatureDSLExpression
  diameter_x?: CadKernelFeatureDSLExpression
  diameter_y?: CadKernelFeatureDSLExpression
  height: CadKernelFeatureDSLExpression
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLRectangleSketch = {
  type: 'rectangle'
  size: readonly CadKernelFeatureDSLExpression[]
}

export type CadKernelFeatureDSLCircleSketch = {
  type: 'circle'
  radius?: CadKernelFeatureDSLExpression
  diameter?: CadKernelFeatureDSLExpression
}

export type CadKernelFeatureDSLEllipseSketch = {
  type: 'ellipse'
  radius_x?: CadKernelFeatureDSLExpression
  radius_y?: CadKernelFeatureDSLExpression
  diameter_x?: CadKernelFeatureDSLExpression
  diameter_y?: CadKernelFeatureDSLExpression
}

export type CadKernelFeatureDSLSketch = CadKernelFeatureDSLRectangleSketch | CadKernelFeatureDSLCircleSketch | CadKernelFeatureDSLEllipseSketch

export type CadKernelFeatureDSLSketchPlane = 'XY' | 'XZ' | 'YZ'

export type CadKernelFeatureDSLSketchDefinitionFeature = {
  id: string
  type: 'sketch'
  plane?: CadKernelFeatureDSLSketchPlane
  origin?: readonly CadKernelFeatureDSLExpression[]
  profile: CadKernelFeatureDSLSketch
}

export type CadKernelFeatureDSLSketchReference = string | CadKernelFeatureDSLSketch

export type CadKernelFeatureDSLExtrudeDirection = 'positive' | 'negative' | 'symmetric'

export type CadKernelFeatureDSLExtrudeFeature = {
  id: string
  type: 'extrude'
  origin?: readonly CadKernelFeatureDSLExpression[]
  sketch: CadKernelFeatureDSLSketchReference
  height: CadKernelFeatureDSLExpression
  direction?: CadKernelFeatureDSLExtrudeDirection
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLTaperedExtrudeFeature = {
  id: string
  type: 'tapered_extrude'
  origin?: readonly CadKernelFeatureDSLExpression[]
  sketch: CadKernelFeatureDSLSketchReference
  height: CadKernelFeatureDSLExpression
  top_scale: CadKernelFeatureDSLExpression
  direction?: CadKernelFeatureDSLExtrudeDirection
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLExtrudeCutFeature = {
  id: string
  type: 'extrude_cut'
  origin: readonly CadKernelFeatureDSLExpression[]
  sketch: CadKernelFeatureDSLSketchReference
  depth: CadKernelFeatureDSLExpression
  direction?: CadKernelFeatureDSLExtrudeDirection
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLRevolveFeature = {
  id: string
  type: 'revolve'
  sketch: CadKernelFeatureDSLSketchReference
  origin?: readonly CadKernelFeatureDSLExpression[]
  plane?: CadKernelFeatureDSLSketchPlane
  axis_origin?: readonly CadKernelFeatureDSLExpression[]
  axis?: readonly CadKernelFeatureDSLExpression[]
  angle_degrees?: CadKernelFeatureDSLExpression
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLSweepFeature = {
  id: string
  type: 'sweep'
  sketch: CadKernelFeatureDSLSketchReference
  origin?: readonly CadKernelFeatureDSLExpression[]
  plane?: CadKernelFeatureDSLSketchPlane
  path: readonly (readonly CadKernelFeatureDSLExpression[])[]
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLLoftSection = {
  origin: readonly CadKernelFeatureDSLExpression[]
  sketch: CadKernelFeatureDSLSketchReference
  plane?: CadKernelFeatureDSLSketchPlane
}

export type CadKernelFeatureDSLLoftFeature = {
  id: string
  type: 'loft'
  sections: readonly CadKernelFeatureDSLLoftSection[]
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLBooleanFeature = {
  id: string
  type: 'boolean'
  operation: 'union' | 'subtract' | 'intersect'
  operands: readonly CadKernelFeatureDSLFeature[]
  origin?: readonly CadKernelFeatureDSLExpression[]
  repeat?: CadKernelFeatureDSLRepeat
  transform?: CadKernelFeatureDSLTransform
}

export type CadKernelFeatureDSLFilletFeature = {
  id: string
  type: 'fillet'
  radius: CadKernelFeatureDSLExpression
}

export type CadKernelFeatureDSLChamferFeature = {
  id: string
  type: 'chamfer'
  distance: CadKernelFeatureDSLExpression
}

export type CadKernelFeatureDSLFeature =
  | CadKernelFeatureDSLSketchDefinitionFeature
  | CadKernelFeatureDSLBoxFeature
  | CadKernelFeatureDSLBoxCutFeature
  | CadKernelFeatureDSLExtrudeFeature
  | CadKernelFeatureDSLTaperedExtrudeFeature
  | CadKernelFeatureDSLExtrudeCutFeature
  | CadKernelFeatureDSLCylinderFeature
  | CadKernelFeatureDSLCylinderCutFeature
  | CadKernelFeatureDSLSphereFeature
  | CadKernelFeatureDSLEllipsoidFeature
  | CadKernelFeatureDSLEllipseExtrudeFeature
  | CadKernelFeatureDSLRevolveFeature
  | CadKernelFeatureDSLSweepFeature
  | CadKernelFeatureDSLLoftFeature
  | CadKernelFeatureDSLBooleanFeature
  | CadKernelFeatureDSLFilletFeature
  | CadKernelFeatureDSLChamferFeature

export type CadKernelFeatureDSLDocument = {
  version: 1
  unit: string
  parameters?: Record<string, CadKernelFeatureDSLParameter>
  features: CadKernelFeatureDSLFeature[]
}

export type CadKernelFeatureDSLInput = {
  filename: string
  document: CadKernelFeatureDSLDocument
  parameterValues?: Record<string, number>
}

export type CadKernelTransformOperation = {
  id: string
  type: 'transform'
  modelId: string
  matrix: readonly number[]
}

export type CadKernelBoxUnionOperation = {
  id: string
  type: 'box-union'
  modelId: string
  box: CadKernelBoxFeature
}

export type CadKernelOperation = CadKernelTransformOperation | CadKernelBoxUnionOperation

export type CadKernelStepRoundTripRequest = {
  id: string
  type: 'step-round-trip'
  payload: {
    filename: string
    stepText: string
    operations?: CadKernelOperation[]
  }
}

export type CadKernelStepPreviewRequest = {
  id: string
  type: 'step-preview'
  payload: {
    filename: string
    stepText: string
    operations?: CadKernelOperation[]
  }
}

export type CadKernelStepAssemblyExportSource = {
  filename: string
  stepText: string
  operations?: CadKernelOperation[]
}

export type CadKernelStepAssemblyExportRequest = {
  id: string
  type: 'step-assembly-export'
  payload: {
    filename: string
    sources: CadKernelStepAssemblyExportSource[]
  }
}

export type CadKernelSectionPlane = {
  origin: readonly number[]
  normal: readonly number[]
}

export type CadKernelSectionGeometryRequest = {
  id: string
  type: 'section-geometry'
  payload: {
    filename: string
    sources: CadKernelStepAssemblyExportSource[]
    plane: CadKernelSectionPlane
  }
}

export type CadKernelShapeReferenceScopeInput = {
  occurrenceId: string
  modelRevisionId: string
}

export type CadKernelShapeInspectionSource = CadKernelStepAssemblyExportSource & {
  referenceScope: CadKernelShapeReferenceScopeInput
}

export type CadKernelShapeInspectionRequest = {
  id: string
  type: 'shape-inspection'
  payload: {
    sources: CadKernelShapeInspectionSource[]
  }
}

export type CadKernelFeatureDSLPreviewRequest = {
  id: string
  type: 'feature-dsl-preview'
  payload: CadKernelFeatureDSLInput
}

export type CadKernelFeatureDSLExportRequest = {
  id: string
  type: 'feature-dsl-export'
  payload: CadKernelFeatureDSLInput
}

export type CadKernelRequest =
  | CadKernelStepRoundTripRequest
  | CadKernelStepPreviewRequest
  | CadKernelStepAssemblyExportRequest
  | CadKernelSectionGeometryRequest
  | CadKernelShapeInspectionRequest
  | CadKernelFeatureDSLPreviewRequest
  | CadKernelFeatureDSLExportRequest

export type CadKernelStepRoundTripResponse = {
  id: string
  type: 'step-round-trip-result'
  result: {
    mesh: CadKernelMesh
    meshSummary: CadKernelMeshSummary
    exportedStepText: string
  }
}

export type CadKernelStepPreviewResponse = {
  id: string
  type: 'step-preview-result'
  result: {
    mesh: CadKernelMesh
    componentMeshes?: CadKernelMesh[]
    meshSummary: CadKernelMeshSummary
  }
}

export type CadKernelStepAssemblyExportResponse = {
  id: string
  type: 'step-assembly-export-result'
  result: {
    exportedStepText: string
  }
}

export type CadKernelSectionGeometryResponse = {
  id: string
  type: 'section-geometry-result'
  result: {
    status: 'ready' | 'empty'
    edgeCount: number
    exportedStepText: string
  }
}

export type CadKernelShapeReferenceScope = CadKernelShapeReferenceScopeInput & {
  operationsSignature: string
}

export type CadKernelGeometricReference = {
  id: string
  kind: 'face' | 'edge'
  index: number
  measure: number
}

export type CadKernelShapeProperties = {
  volume: number
  surfaceArea: number
  edgeLength: number
  centerOfMass: readonly [number, number, number]
  solidCount: number
  faceCount: number
  edgeCount: number
}

export type CadKernelShapeInspectionTarget = CadKernelShapeProperties & {
  referenceScope: CadKernelShapeReferenceScope
  references: CadKernelGeometricReference[]
}

export type CadKernelShapeInspectionResult = {
  derivation: 'occt-brep-properties'
  targets: CadKernelShapeInspectionTarget[]
  totals: CadKernelShapeProperties
}

export type CadKernelShapeInspectionResponse = {
  id: string
  type: 'shape-inspection-result'
  result: CadKernelShapeInspectionResult
}

export type CadKernelFeatureDSLPreviewResponse = {
  id: string
  type: 'feature-dsl-preview-result'
  result: {
    mesh: CadKernelMesh
    meshSummary: CadKernelMeshSummary
  }
}

export type CadKernelFeatureDSLExportResponse = {
  id: string
  type: 'feature-dsl-export-result'
  result: {
    exportedStepText: string
  }
}

export type CadKernelErrorResponse = {
  id: string
  type: 'error'
  error: string
}

export type CadKernelResponse =
  | CadKernelStepRoundTripResponse
  | CadKernelStepPreviewResponse
  | CadKernelStepAssemblyExportResponse
  | CadKernelSectionGeometryResponse
  | CadKernelShapeInspectionResponse
  | CadKernelFeatureDSLPreviewResponse
  | CadKernelFeatureDSLExportResponse
  | CadKernelErrorResponse

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function isCadKernelRequest(value: unknown): value is CadKernelRequest {
  if (
    !isRecord(value) ||
    (value.type !== 'step-round-trip' &&
      value.type !== 'step-preview' &&
      value.type !== 'step-assembly-export' &&
      value.type !== 'section-geometry' &&
      value.type !== 'shape-inspection' &&
      value.type !== 'feature-dsl-preview' &&
      value.type !== 'feature-dsl-export') ||
    typeof value.id !== 'string'
  ) {
    return false
  }
  const payload = value.payload
  if (value.type === 'feature-dsl-preview' || value.type === 'feature-dsl-export') {
    return isCadKernelFeatureDSLInput(payload)
  }
  if (value.type === 'step-assembly-export') {
    return (
      isRecord(payload) &&
      typeof payload.filename === 'string' &&
      Array.isArray(payload.sources) &&
      payload.sources.length > 0 &&
      payload.sources.every(isCadKernelAssemblyExportSource)
    )
  }
  if (value.type === 'section-geometry') {
    return (
      isRecord(payload) &&
      typeof payload.filename === 'string' &&
      Array.isArray(payload.sources) &&
      payload.sources.length > 0 &&
      payload.sources.every(isCadKernelAssemblyExportSource) &&
      isCadKernelSectionPlane(payload.plane)
    )
  }
  if (value.type === 'shape-inspection') {
    return (
      isRecord(payload) &&
      Array.isArray(payload.sources) &&
      payload.sources.length > 0 &&
      payload.sources.every(isCadKernelShapeInspectionSource)
    )
  }

  return (
    isRecord(payload) &&
    typeof payload.filename === 'string' &&
    typeof payload.stepText === 'string' &&
    isCadKernelOperations(payload.operations)
  )
}

function isCadKernelFeatureDSLInput(value: unknown): value is CadKernelFeatureDSLInput {
  return (
    isRecord(value) &&
    typeof value.filename === 'string' &&
    isCadKernelFeatureDSLDocument(value.document) &&
    isFeatureDSLParameterValues(value.parameterValues)
  )
}

function isCadKernelFeatureDSLDocument(value: unknown): value is CadKernelFeatureDSLDocument {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.unit === 'string' &&
    (value.parameters === undefined || (isRecord(value.parameters) && Object.values(value.parameters).every(isFeatureDSLParameter))) &&
    Array.isArray(value.features) &&
    value.features.length > 0 &&
    value.features.every(isFeatureDSLFeature) &&
    hasUniqueFeatureDSLNodeIDs(value.features)
  )
}

function hasUniqueFeatureDSLNodeIDs(features: unknown[]) {
  const ids = new Set<string>()
  const pending = [...features]
  while (pending.length > 0) {
    const feature = pending.pop()
    if (!isRecord(feature) || typeof feature.id !== 'string') {
      return false
    }
    const featureID = feature.id.trim()
    if (!featureID || featureID !== feature.id || ids.has(featureID)) {
      return false
    }
    ids.add(featureID)
    if (feature.type === 'boolean' && Array.isArray(feature.operands)) {
      pending.push(...feature.operands)
    }
  }
  return true
}

function isFeatureDSLParameter(value: unknown): value is CadKernelFeatureDSLParameter {
  if (!isRecord(value)) {
    return false
  }
  if (value.type === 'boolean') {
    return typeof value.default === 'boolean'
  }
  if (value.type === 'string') {
    return (
      typeof value.default === 'string' &&
      (value.options === undefined || (Array.isArray(value.options) && value.options.every((option) => typeof option === 'string')))
    )
  }
  return (
    value.type === 'number' &&
    typeof value.default === 'number' &&
    Number.isFinite(value.default) &&
    (value.min === undefined || (typeof value.min === 'number' && Number.isFinite(value.min))) &&
    (value.max === undefined || (typeof value.max === 'number' && Number.isFinite(value.max))) &&
    (value.step === undefined || (typeof value.step === 'number' && Number.isFinite(value.step) && value.step > 0))
  )
}

function isFeatureDSLFeature(value: unknown): value is CadKernelFeatureDSLFeature {
  if (!isRecord(value) || typeof value.id !== 'string' || !isSupportedFeatureDSLType(value.type)) {
    return false
  }
  if (value.type !== 'boolean' && value.operands !== undefined) {
    return false
  }
  if (value.transform !== undefined && !isFeatureDSLTransform(value.transform)) {
    return false
  }
  if (value.type === 'box' || value.type === 'box_cut') {
    return isFeatureDSLBoxLikeFeature(value)
  }
  if (value.type === 'sketch') {
    return isFeatureDSLSketchDefinitionFeature(value)
  }
  if (value.type === 'extrude') {
    return isFeatureDSLExtrudeFeature(value)
  }
  if (value.type === 'tapered_extrude') {
    return isFeatureDSLTaperedExtrudeFeature(value)
  }
  if (value.type === 'extrude_cut') {
    return isFeatureDSLExtrudeCutFeature(value)
  }
  if (value.type === 'cylinder') {
    return isFeatureDSLCylinderLikeFeature(value, 'height')
  }
  if (value.type === 'cylinder_cut') {
    return isFeatureDSLCylinderLikeFeature(value, 'depth')
  }
  if (value.type === 'sphere') {
    return isFeatureDSLSphereFeature(value)
  }
  if (value.type === 'ellipsoid') {
    return isFeatureDSLEllipsoidFeature(value)
  }
  if (value.type === 'ellipse_extrude') {
    return isFeatureDSLEllipseExtrudeFeature(value)
  }
  if (value.type === 'revolve') {
    return isFeatureDSLRevolveFeature(value)
  }
  if (value.type === 'sweep') {
    return isFeatureDSLSweepFeature(value)
  }
  if (value.type === 'loft') {
    return isFeatureDSLLoftFeature(value)
  }
  if (value.type === 'boolean') {
    return isFeatureDSLBooleanFeature(value)
  }
  if (value.type === 'fillet') {
    return isFeatureDSLExpression(value.radius)
  }
  if (value.type === 'chamfer') {
    return isFeatureDSLExpression(value.distance)
  }
  return false
}

function isFeatureDSLBoxLikeFeature(value: Record<string, unknown>) {
  return (
    isFeatureDSLExpressionTuple(value.size, 3) &&
    (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLExtrudeFeature(value: Record<string, unknown>) {
  return (
    (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3)) &&
    isFeatureDSLSketchReference(value.sketch) &&
    isFeatureDSLExpression(value.height) &&
    (value.direction === undefined || isFeatureDSLExtrudeDirection(value.direction)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLTaperedExtrudeFeature(value: Record<string, unknown>) {
  return isFeatureDSLExtrudeFeature(value) && isFeatureDSLExpression(value.top_scale)
}

function isFeatureDSLExtrudeCutFeature(value: Record<string, unknown>) {
  return (
    isFeatureDSLExpressionTuple(value.origin, 3) &&
    isFeatureDSLSketchReference(value.sketch) &&
    isFeatureDSLExpression(value.depth) &&
    (value.direction === undefined || isFeatureDSLExtrudeDirection(value.direction)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLSketchDefinitionFeature(value: Record<string, unknown>) {
  return (
    (value.plane === undefined || isFeatureDSLSketchPlane(value.plane)) &&
    (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3)) &&
    isFeatureDSLSketch(value.profile)
  )
}

function isFeatureDSLRevolveFeature(value: Record<string, unknown>) {
  return (
    isFeatureDSLSketchReference(value.sketch) &&
    (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3)) &&
    (value.plane === undefined || isFeatureDSLSketchPlane(value.plane)) &&
    (value.axis_origin === undefined || isFeatureDSLExpressionTuple(value.axis_origin, 3)) &&
    (value.axis === undefined || isFeatureDSLAxisTuple(value.axis)) &&
    (value.angle_degrees === undefined || isFeatureDSLExpression(value.angle_degrees)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLSweepFeature(value: Record<string, unknown>) {
  return (
    isFeatureDSLSketchReference(value.sketch) &&
    (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3)) &&
    (value.plane === undefined || isFeatureDSLSketchPlane(value.plane)) &&
    Array.isArray(value.path) &&
    value.path.length >= 2 &&
    value.path.every((point) => isFeatureDSLExpressionTuple(point, 3)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLLoftFeature(value: Record<string, unknown>) {
  return (
    Array.isArray(value.sections) &&
    value.sections.length >= 2 &&
    value.sections.every(isFeatureDSLLoftSection) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLLoftSection(value: unknown) {
  return (
    isRecord(value) &&
    isFeatureDSLExpressionTuple(value.origin, 3) &&
    isFeatureDSLSketchReference(value.sketch) &&
    (value.plane === undefined || isFeatureDSLSketchPlane(value.plane))
  )
}

function isFeatureDSLBooleanFeature(value: Record<string, unknown>) {
  return (
    (value.operation === 'union' || value.operation === 'subtract' || value.operation === 'intersect') &&
	    Array.isArray(value.operands) &&
	    value.operands.length >= 2 &&
	    value.operands.every(isFeatureDSLBooleanOperand) &&
	    (value.origin === undefined || isFeatureDSLExpressionTuple(value.origin, 3)) &&
	    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
	  )
}

function isFeatureDSLBooleanOperand(value: unknown) {
  if (!isFeatureDSLFeature(value)) {
    return false
  }
  return value.type !== 'sketch' && value.type !== 'fillet' && value.type !== 'chamfer' && !value.type.endsWith('_cut')
}

function isFeatureDSLSketchReference(value: unknown): value is CadKernelFeatureDSLSketchReference {
  return typeof value === 'string' || isFeatureDSLSketch(value)
}

function isFeatureDSLExtrudeDirection(value: unknown): value is CadKernelFeatureDSLExtrudeDirection {
  return value === 'positive' || value === 'negative' || value === 'symmetric'
}

function isFeatureDSLSketch(value: unknown): value is CadKernelFeatureDSLSketch {
  return isFeatureDSLRectangleSketch(value) || isFeatureDSLCircleSketch(value) || isFeatureDSLEllipseSketch(value)
}

function isFeatureDSLRectangleSketch(value: unknown): value is CadKernelFeatureDSLRectangleSketch {
  return isRecord(value) && value.type === 'rectangle' && isFeatureDSLExpressionTuple(value.size, 2)
}

function isFeatureDSLCircleSketch(value: unknown): value is CadKernelFeatureDSLCircleSketch {
  if (!isRecord(value) || value.type !== 'circle') {
    return false
  }
  if (value.size !== undefined) {
    return false
  }
  const hasRadius = value.radius !== undefined
  const hasDiameter = value.diameter !== undefined
  return hasRadius !== hasDiameter && (hasRadius ? isFeatureDSLExpression(value.radius) : isFeatureDSLExpression(value.diameter))
}

function isFeatureDSLEllipseSketch(value: unknown) {
  return (
    isRecord(value) &&
    value.type === 'ellipse' &&
    isFeatureDSLAxisRadiusExpression(value.radius_x, value.diameter_x) &&
    isFeatureDSLAxisRadiusExpression(value.radius_y, value.diameter_y)
  )
}

function isFeatureDSLSketchPlane(value: unknown): value is CadKernelFeatureDSLSketchPlane {
  return value === 'XY' || value === 'XZ' || value === 'YZ'
}

function isFeatureDSLSphereFeature(value: Record<string, unknown>) {
  const hasRadius = value.radius !== undefined
  const hasDiameter = value.diameter !== undefined
  return (
    isFeatureDSLExpressionTuple(value.origin, 3) &&
    hasRadius !== hasDiameter &&
    (hasRadius ? isFeatureDSLExpression(value.radius) : isFeatureDSLExpression(value.diameter)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLEllipsoidFeature(value: Record<string, unknown>) {
  return (
    isFeatureDSLExpressionTuple(value.origin, 3) &&
    isFeatureDSLAxisRadiusExpression(value.radius_x, value.diameter_x) &&
    isFeatureDSLAxisRadiusExpression(value.radius_y, value.diameter_y) &&
    isFeatureDSLAxisRadiusExpression(value.radius_z, value.diameter_z) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLEllipseExtrudeFeature(value: Record<string, unknown>) {
  return (
    isFeatureDSLExpressionTuple(value.origin, 3) &&
    isFeatureDSLAxisRadiusExpression(value.radius_x, value.diameter_x) &&
    isFeatureDSLAxisRadiusExpression(value.radius_y, value.diameter_y) &&
    isFeatureDSLExpression(value.height) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat))
  )
}

function isFeatureDSLAxisRadiusExpression(radius: unknown, diameter: unknown) {
  const hasRadius = radius !== undefined
  const hasDiameter = diameter !== undefined
  return hasRadius !== hasDiameter && (hasRadius ? isFeatureDSLExpression(radius) : isFeatureDSLExpression(diameter))
}

function isFeatureDSLCylinderLikeFeature(value: Record<string, unknown>, lengthKey: 'height' | 'depth') {
  const hasRadius = value.radius !== undefined
  const hasDiameter = value.diameter !== undefined
  return (
    isFeatureDSLExpressionTuple(value.origin, 3) &&
    (value.axis === undefined || isFeatureDSLAxisTuple(value.axis)) &&
    (value.repeat === undefined || isFeatureDSLRepeat(value.repeat)) &&
    hasRadius !== hasDiameter &&
    (hasRadius ? isFeatureDSLExpression(value.radius) : isFeatureDSLExpression(value.diameter)) &&
    isFeatureDSLExpression(value[lengthKey])
  )
}

function isFeatureDSLRepeat(value: unknown): value is CadKernelFeatureDSLRepeat {
  return (
    isRecord(value) &&
    typeof value.count === 'number' &&
    Number.isInteger(value.count) &&
    value.count >= 1 &&
    value.count <= 128 &&
    isFeatureDSLExpressionTuple(value.step, 3)
  )
}

function isFeatureDSLTransform(value: unknown): value is CadKernelFeatureDSLTransform {
  if (!isRecord(value)) {
    return false
  }
  if (value.translate !== undefined && !isFeatureDSLExpressionTuple(value.translate, 3)) {
    return false
  }
  if (value.scale !== undefined && !isFeatureDSLPositiveExpressionTuple(value.scale, 3)) {
    return false
  }
  if (value.rotate === undefined) {
    return true
  }
  if (!isRecord(value.rotate)) {
    return false
  }
  return (
    isFeatureDSLAxisTuple(value.rotate.axis) &&
    isFeatureDSLExpression(value.rotate.angle_degrees) &&
    (value.rotate.origin === undefined || isFeatureDSLExpressionTuple(value.rotate.origin, 3))
  )
}

function isFeatureDSLPositiveExpressionTuple(value: unknown, length: number): value is CadKernelFeatureDSLExpression[] {
  return (
    isFeatureDSLExpressionTuple(value, length) &&
    value.every((entry) => typeof entry !== 'number' || entry > 0)
  )
}

function isFeatureDSLAxisTuple(value: unknown): value is CadKernelFeatureDSLExpression[] {
  if (!isFeatureDSLExpressionTuple(value, 3)) {
    return false
  }
  return value.some((entry) => typeof entry === 'string' || entry !== 0)
}

function isFeatureDSLExpressionTuple(value: unknown, length: number): value is CadKernelFeatureDSLExpression[] {
  return Array.isArray(value) && value.length === length && value.every(isFeatureDSLExpression)
}

function isFeatureDSLExpression(value: unknown): value is CadKernelFeatureDSLExpression {
  if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string') {
    return true
  }
  return (
    isRecord(value) &&
    (value.op === 'add' || value.op === 'sub' || value.op === 'mul' || value.op === 'div') &&
    Array.isArray(value.args) &&
    value.args.length === 2 &&
    value.args.every(isFeatureDSLExpression)
  )
}

function isFeatureDSLParameterValues(value: unknown): value is Record<string, number> | undefined {
  if (value === undefined) {
    return true
  }
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function isCadKernelAssemblyExportSource(value: unknown): value is CadKernelStepAssemblyExportSource {
  return (
    isRecord(value) &&
    typeof value.filename === 'string' &&
    typeof value.stepText === 'string' &&
    isCadKernelOperations(value.operations)
  )
}

function isCadKernelShapeInspectionSource(value: unknown): value is CadKernelShapeInspectionSource {
  if (!isCadKernelAssemblyExportSource(value)) {
    return false
  }
  const referenceScope = (value as CadKernelShapeInspectionSource).referenceScope
  if (!isRecord(referenceScope)) {
    return false
  }
  const occurrenceID = referenceScope.occurrenceId
  const revisionID = referenceScope.modelRevisionId
  return (
    typeof occurrenceID === 'string' &&
    occurrenceID.trim() === occurrenceID &&
    occurrenceID !== '' &&
    typeof revisionID === 'string' &&
    revisionID.trim() === revisionID &&
    revisionID !== ''
  )
}

function isCadKernelSectionPlane(value: unknown): value is CadKernelSectionPlane {
  return (
    isRecord(value) &&
    isFiniteNumberTuple(value.origin, 3) &&
    isFiniteNumberTuple(value.normal, 3) &&
    value.normal.some((entry) => entry !== 0)
  )
}

function isCadKernelOperations(value: unknown): value is CadKernelOperation[] | undefined {
  if (value === undefined) {
    return true
  }
  return Array.isArray(value) && value.every(isCadKernelOperation)
}

function isCadKernelOperation(value: unknown): value is CadKernelOperation {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.modelId !== 'string') {
    return false
  }
  if (value.type === 'box-union') {
    return isCadKernelBoxFeature(value.box)
  }
  return (
    value.type === 'transform' &&
    Array.isArray(value.matrix) &&
    value.matrix.length === 16 &&
    value.matrix.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function isCadKernelBoxFeature(value: unknown): value is CadKernelBoxFeature {
  if (!isRecord(value) || !isFiniteNumberTuple(value.origin, 3) || !isFiniteNumberTuple(value.size, 3)) {
    return false
  }
  return value.size.every((entry) => entry > 0)
}

function isFiniteNumberTuple(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

export function summarizeCadKernelMesh(mesh: CadKernelMesh): CadKernelMeshSummary {
  return {
    vertexCount: Math.floor(mesh.positions.length / 3),
    triangleCount: Math.floor(mesh.indices.length / 3),
    hasNormals: mesh.normals.length > 0,
  }
}

export function cadKernelErrorResponse(id: string, error: unknown): CadKernelErrorResponse {
  return {
    id,
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
}
import { isSupportedFeatureDSLType } from './feature-dsl-capabilities'
