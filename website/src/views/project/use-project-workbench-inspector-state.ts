import type { CADTranslation } from './cad-document-transforms'
import { translationFromCADTransform } from './cad-document-transforms'
import type { BoxFeatureDraft } from './cad-document-box-features'
import type { ProjectInspectorSelection, TransformDraft } from './project-inspector'
import { getModelDisplayName } from './project-preview-assets'
import type { CADAssemblyOccurrence, CADDocumentNode, Project, ProjectCADDocument, ProjectModel } from 'src/types/project'
import { useTranslation } from 'react-i18next'

type ProjectPreviewSummary = {
  previewLabel: string
}

type ProjectWorkbenchInspectorStateOptions = {
  boxErrorsByModelId: Record<string, string>
  boxFeatureDraftsByModelId: Record<string, BoxFeatureDraft>
  deleteError: string
  getBoxFeatureDraft: (modelId: string) => BoxFeatureDraft
  isBoxUnionPendingFor: (modelId: string) => boolean
  latestModel?: ProjectModel
  latestTriangleCount: number
  previewSummary: ProjectPreviewSummary
  project?: Project
  projectCADDocument?: ProjectCADDocument
  selectedDocumentNode?: CADDocumentNode
	selectedOccurrence?: CADAssemblyOccurrence
  selectedSourceModel?: ProjectModel
  stepExportErrorByModelId: Record<string, string>
  stepExportStatusByModelId: Record<string, string>
  transformDraftsByNodeId: Record<string, TransformDraft>
  transformErrorsByNodeId: Record<string, string>
}

export function useProjectWorkbenchInspectorState({
  boxErrorsByModelId,
  boxFeatureDraftsByModelId,
  deleteError,
  getBoxFeatureDraft,
  isBoxUnionPendingFor,
  latestModel,
  latestTriangleCount,
  previewSummary,
  project,
  projectCADDocument,
  selectedDocumentNode,
	selectedOccurrence,
  selectedSourceModel,
  stepExportErrorByModelId,
  stepExportStatusByModelId,
  transformDraftsByNodeId,
  transformErrorsByNodeId,
}: ProjectWorkbenchInspectorStateOptions) {
  const { i18n, t } = useTranslation()
  const documentUnitLabel = cadUnitLabel(projectCADDocument?.unit)
  const updatedAt = project
    ? new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(project.updated_at))
    : ''
  const projectDescription = project?.description || t('project.inspector.noDescription')
  const selectedModelDisplayName =
    selectedDocumentNode?.source_format === 'step-component'
      ? selectedDocumentNode.name
		: selectedOccurrence?.name || (selectedSourceModel
        ? getModelDisplayName(selectedSourceModel)
			: '')
	const selectedTransformTargetID = selectedDocumentNode?.parent_node_id ? selectedDocumentNode.id : (selectedOccurrence?.id ?? selectedDocumentNode?.id)
	const selectedTransform = selectedDocumentNode?.parent_node_id ? selectedDocumentNode.transform : (selectedOccurrence?.transform ?? selectedDocumentNode?.transform)
	const selectedModelTransformDraft = selectedTransformTargetID
		? transformDraftsByNodeId[selectedTransformTargetID] ?? transformDraftFromTranslation(translationFromCADTransform(selectedTransform))
    : undefined
	const selectedModelTransformError = selectedTransformTargetID ? transformErrorsByNodeId[selectedTransformTargetID] : ''
  const selectedModelSupportsFuseBox = selectedSourceModel?.format === 'step'
  const selectedModelBoxFeatureDraft = selectedSourceModel
    ? boxFeatureDraftsByModelId[selectedSourceModel.id] ?? getBoxFeatureDraft(selectedSourceModel.id)
    : undefined
  const selectedModelBoxFeatureError = selectedSourceModel ? boxErrorsByModelId[selectedSourceModel.id] : ''
  const isSelectedModelBoxFeatureUpdating = selectedSourceModel ? isBoxUnionPendingFor(selectedSourceModel.id) : false
  const selectedModelStepExportError = selectedSourceModel ? stepExportErrorByModelId[selectedSourceModel.id] : ''
  const selectedModelStepExportStatus = selectedSourceModel ? stepExportStatusByModelId[selectedSourceModel.id] : ''
  const selectedModelDetails = selectedSourceModel
    ? [
        { label: t('project.inspector.details.format'), value: selectedDocumentNode?.source_format === 'step-component' ? 'STEP-COMPONENT' : selectedSourceModel.format.toUpperCase() },
        { label: t('project.inspector.details.status'), value: selectedSourceModel.parse_status },
        { label: t('project.inspector.details.unit'), value: selectedSourceModel.metadata.length_unit || documentUnitLabel },
        { label: t('project.inspector.details.entities'), value: selectedSourceModel.metadata.entity_count },
        { label: t('project.inspector.details.triangles'), value: selectedSourceModel.metadata.triangle_count },
      ]
    : []
  const documentDetails = [
    { label: t('project.inspector.details.updated'), value: updatedAt },
    { label: t('project.inspector.details.preview'), value: previewSummary.previewLabel },
    ...(latestModel
      ? [
          {
            label: t('project.inspector.details.schema'),
            value: latestModel.metadata.schema || latestModel.metadata.asset_type.toUpperCase() || latestModel.parse_status,
          },
          { label: t('project.inspector.details.unit'), value: latestModel.metadata.length_unit || t('project.inspector.unknown') },
          { label: t('project.inspector.details.entities'), value: latestModel.metadata.entity_count },
          { label: t('project.inspector.details.triangles'), value: latestTriangleCount },
        ]
      : []),
  ]
  const inspectorSelection: ProjectInspectorSelection | undefined =
    selectedDocumentNode && selectedModelTransformDraft
      ? {
          deleteError,
          details: selectedModelDetails,
          name: selectedModelDisplayName,
			nodeId: selectedTransformTargetID ?? selectedDocumentNode.id,
          stepExportError: selectedModelStepExportError,
          stepExportStatus: selectedModelStepExportStatus,
          transformDraft: selectedModelTransformDraft,
          transformError: selectedModelTransformError,
        }
      : undefined

  return {
    documentDetails,
    documentUnitLabel,
    inspectorSelection,
    isSelectedModelBoxFeatureUpdating,
    projectDescription,
    selectedModelBoxFeatureDraft,
    selectedModelBoxFeatureError,
    selectedModelDisplayName,
    selectedModelSupportsFuseBox,
  }
}

export function transformDraftFromTranslation(translation: CADTranslation): TransformDraft {
  return {
    x: String(translation.x),
    y: String(translation.y),
    z: String(translation.z),
  }
}

export function parseTransformDraft(draft: TransformDraft | undefined): CADTranslation | undefined {
  if (!draft) {
    return undefined
  }
  const translation = {
    x: Number(draft.x),
    y: Number(draft.y),
    z: Number(draft.z),
  }
  if (!Number.isFinite(translation.x) || !Number.isFinite(translation.y) || !Number.isFinite(translation.z)) {
    return undefined
  }
  return translation
}

export function cadUnitLabel(unit: string | undefined) {
  const normalizedUnit = unit?.trim().toLowerCase()
  if (normalizedUnit === 'millimetre' || normalizedUnit === 'millimeter' || normalizedUnit === 'millimeters' || normalizedUnit === 'millimetres') {
    return 'mm'
  }
  if (normalizedUnit === 'centimetre' || normalizedUnit === 'centimeter' || normalizedUnit === 'centimeters' || normalizedUnit === 'centimetres') {
    return 'cm'
  }
  if (normalizedUnit === 'metre' || normalizedUnit === 'meter' || normalizedUnit === 'meters' || normalizedUnit === 'metres') {
    return 'm'
  }
  if (normalizedUnit === 'inch' || normalizedUnit === 'inches') {
    return 'in'
  }
  return unit || 'unit'
}
