import type { CadKernelOperation } from 'src/cad/kernel-protocol'
import type { ProjectCADDocument, ProjectModel } from 'src/types/project'
import { cadKernelGeometryOperationsForModel, getModelDisplayName, parsedPreviewModels } from './project-preview-assets'

export type StepExportTarget = {
	occurrenceId: string
  modelId: string
	modelRevisionId: string
  sourceFormat: 'step' | 'lcad'
  displayName: string
  sourceFilename: string
  downloadFilename: string
  parameterValues?: Record<string, unknown>
  operations: CadKernelOperation[]
}

export type StepExportDownload = {
  filename: string
  stepText: string
}

export type StepExportMode = 'separate' | 'merged'

export function buildStepExportTargets(models: ProjectModel[], cadDocument: ProjectCADDocument | undefined): StepExportTarget[] {
	if (!cadDocument?.assembly) {
		return []
	}
	const modelByID = new Map(models.map((model) => [model.id, model]))
	return cadDocument.assembly.occurrences
		.flatMap((occurrence) => {
			const model = modelByID.get(occurrence.model_id)
			return model ? [{ model, occurrence }] : []
		})
		.filter(({ model }) => parsedPreviewModels([model]).length > 0)
		.filter(({ model }) => model.format === 'step' || model.format === 'lcad')
		.map(({ model, occurrence }) => ({
			occurrenceId: occurrence.id,
			modelId: model.id,
			modelRevisionId: occurrence.model_revision_id,
      sourceFormat: model.format === 'lcad' ? 'lcad' : 'step',
      displayName: getModelDisplayName(model),
      sourceFilename: model.original_filename,
      downloadFilename: stepExportFilename(model.original_filename, cadDocument?.revision ?? 0),
      ...(model.format === 'lcad' ? { parameterValues: model.metadata.parameter_values ?? {} } : {}),
			operations: [
				...(model.format === 'step' ? cadKernelGeometryOperationsForModel(cadDocument, model.id) : []),
				{
					id: `${occurrence.id}_placement`,
					type: 'transform' as const,
					modelId: model.id,
					matrix: occurrence.transform.matrix,
				},
			] satisfies CadKernelOperation[],
		}))
}

export function defaultSelectedStepExportTargetIDs(targets: readonly StepExportTarget[]) {
	return new Set(targets.map((target) => target.occurrenceId))
}

export function selectedStepExportTargets(targets: readonly StepExportTarget[], selectedTargetIDs: ReadonlySet<string>) {
	return targets.filter((target) => selectedTargetIDs.has(target.occurrenceId))
}

export function stepExportFilename(sourceFilename: string, revision: number) {
  const baseName = sourceFilename.replace(/\.[^.]+$/, '').trim() || 'model'
  const safeBaseName = baseName.replace(/[\\/:*?"<>|]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'model'
  return `${safeBaseName}-litecad-r${revision}.step`
}

export function stepAssemblyExportFilename(projectName: string, revision: number) {
  const baseName = projectName.trim() || 'assembly'
  const safeBaseName = baseName.replace(/[\\/:*?"<>|]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'assembly'
  return `${safeBaseName}-litecad-assembly-r${revision}.step`
}

export function createStepExportBlob(stepText: string) {
  return new Blob([stepText], { type: 'model/step;charset=utf-8' })
}

export function publishStepExportDownload({ filename, stepText }: StepExportDownload) {
  const objectUrl = URL.createObjectURL(createStepExportBlob(stepText))
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
