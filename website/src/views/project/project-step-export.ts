import type { CadKernelOperation } from 'src/cad/kernel-protocol'
import type { ProjectCADDocument, ProjectModel } from 'src/types/project'
import { cadKernelOperationsForModel, getModelDisplayName, parsedPreviewModels } from './project-preview-assets'

export type StepExportTarget = {
  modelId: string
  displayName: string
  sourceFilename: string
  downloadFilename: string
  operations: CadKernelOperation[]
}

export type StepExportDownload = {
  filename: string
  stepText: string
}

export type StepExportMode = 'separate' | 'merged'

export function buildStepExportTargets(models: ProjectModel[], cadDocument: ProjectCADDocument | undefined): StepExportTarget[] {
  return parsedPreviewModels(models)
    .filter((model) => model.format === 'step')
    .map((model) => ({
      modelId: model.id,
      displayName: getModelDisplayName(model),
      sourceFilename: model.original_filename,
      downloadFilename: stepExportFilename(model.original_filename, cadDocument?.revision ?? 0),
      operations: cadKernelOperationsForModel(cadDocument, model.id),
    }))
}

export function defaultSelectedStepExportTargetIDs(targets: readonly StepExportTarget[]) {
  return new Set(targets.map((target) => target.modelId))
}

export function selectedStepExportTargets(targets: readonly StepExportTarget[], selectedTargetIDs: ReadonlySet<string>) {
  return targets.filter((target) => selectedTargetIDs.has(target.modelId))
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
