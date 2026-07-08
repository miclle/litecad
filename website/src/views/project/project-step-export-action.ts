import type { CadKernelWorkerResult } from 'src/cad/kernel-worker-client'
import type { CadKernelStepAssemblyExportInput, CadKernelStepRoundTripInput } from 'src/cad/opencascade-step'
import type { StepExportDownload, StepExportTarget } from './project-step-export'

export type ExportStepTargetOptions = {
  target: StepExportTarget
  fetchSourceText: (modelId: string) => Promise<string>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelWorkerResult>
  publishDownload: (download: StepExportDownload) => void
}

export async function exportStepTarget({
  target,
  fetchSourceText,
  runStepRoundTrip,
  publishDownload,
}: ExportStepTargetOptions) {
  const stepText = await fetchSourceText(target.modelId)
  const result = await runStepRoundTrip({
    filename: target.sourceFilename,
    stepText,
    operations: target.operations,
  })

  publishDownload({
    filename: target.downloadFilename,
    stepText: result.exportedStepText,
  })

  return result
}

export type ExportStepTargetsSeparatelyOptions = {
  targets: StepExportTarget[]
  fetchSourceText: (modelId: string) => Promise<string>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelWorkerResult>
  publishDownload: (download: StepExportDownload) => void
}

export async function exportStepTargetsSeparately({
  targets,
  fetchSourceText,
  runStepRoundTrip,
  publishDownload,
}: ExportStepTargetsSeparatelyOptions) {
  const results: CadKernelWorkerResult[] = []
  for (const target of targets) {
    results.push(
      await exportStepTarget({
        target,
        fetchSourceText,
        runStepRoundTrip,
        publishDownload,
      }),
    )
  }
  return results
}

export type ExportMergedStepTargetsOptions = {
  targets: StepExportTarget[]
  downloadFilename: string
  fetchSourceText: (modelId: string) => Promise<string>
  runStepAssemblyExport: (input: CadKernelStepAssemblyExportInput) => Promise<{ exportedStepText: string }>
  publishDownload: (download: StepExportDownload) => void
}

export async function exportMergedStepTargets({
  targets,
  downloadFilename,
  fetchSourceText,
  runStepAssemblyExport,
  publishDownload,
}: ExportMergedStepTargetsOptions) {
  const sources = await Promise.all(
    targets.map(async (target) => ({
      filename: target.sourceFilename,
      stepText: await fetchSourceText(target.modelId),
      operations: target.operations,
    })),
  )
  const result = await runStepAssemblyExport({
    filename: downloadFilename,
    sources,
  })

  publishDownload({
    filename: downloadFilename,
    stepText: result.exportedStepText,
  })

  return result
}
