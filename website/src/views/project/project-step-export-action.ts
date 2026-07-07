import type { CadKernelWorkerResult } from 'src/cad/kernel-worker-client'
import type { CadKernelStepRoundTripInput } from 'src/cad/opencascade-step'
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
