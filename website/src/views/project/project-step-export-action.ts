import type { CadKernelWorkerFeatureDSLExportResult, CadKernelWorkerResult } from 'src/cad/kernel-worker-client'
import type { CadKernelFeatureDSLExportInput, CadKernelStepAssemblyExportInput, CadKernelStepRoundTripInput } from 'src/cad/opencascade-step'
import type { StepExportDownload, StepExportTarget } from './project-step-export'
import { buildFeatureDSLKernelInput } from './project-feature-dsl-preview'

type ExportedStepTextResult = {
  exportedStepText: string
}

export type BuildStepAssemblySourcesOptions = {
  targets: StepExportTarget[]
	fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
}

export async function buildStepAssemblySources({
  targets,
  fetchSourceText,
  runFeatureDSLExport,
}: BuildStepAssemblySourcesOptions): Promise<CadKernelStepAssemblyExportInput['sources']> {
  return Promise.all(
		targets.map(async (target) => {
      if (target.sourceFormat === 'step') {
        return {
          filename: target.sourceFilename,
			stepText: await fetchSourceText(target.modelId, target.modelRevisionId),
          operations: target.operations,
        }
			}
			const sourceText = await fetchSourceText(target.modelId, target.modelRevisionId)
			const result = await runFeatureDSLExport(
				buildFeatureDSLKernelInput(
					{
						filename: target.sourceFilename,
						parameterValues: target.parameterValues ?? {},
					},
					sourceText,
				),
			)
			return {
				filename: target.sourceFilename,
				stepText: result.exportedStepText,
				operations: target.operations,
      }
    }),
  )
}

export type ExportStepTargetOptions = {
  target: StepExportTarget
	fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelWorkerResult>
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
  publishDownload: (download: StepExportDownload) => void
}

export async function exportStepTarget({
  target,
  fetchSourceText,
  runStepRoundTrip,
  runFeatureDSLExport,
  publishDownload,
}: ExportStepTargetOptions): Promise<ExportedStepTextResult> {
  const result = await exportTargetToStepText({ target, fetchSourceText, runStepRoundTrip, runFeatureDSLExport })

  publishDownload({
    filename: target.downloadFilename,
    stepText: result.exportedStepText,
  })

  return result
}

export type ExportStepTargetsSeparatelyOptions = {
  targets: StepExportTarget[]
	fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelWorkerResult>
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
  publishDownload: (download: StepExportDownload) => void
}

export async function exportStepTargetsSeparately({
  targets,
  fetchSourceText,
  runStepRoundTrip,
  runFeatureDSLExport,
  publishDownload,
}: ExportStepTargetsSeparatelyOptions) {
  const results: ExportedStepTextResult[] = []
  for (const target of targets) {
    results.push(
      await exportStepTarget({
        target,
        fetchSourceText,
        runStepRoundTrip,
        runFeatureDSLExport,
        publishDownload,
      }),
    )
  }
  return results
}

export type ExportMergedStepTargetsOptions = {
  targets: StepExportTarget[]
  downloadFilename: string
	fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  runStepAssemblyExport: (input: CadKernelStepAssemblyExportInput) => Promise<{ exportedStepText: string }>
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
  publishDownload: (download: StepExportDownload) => void
}

export async function exportMergedStepTargets({
  targets,
  downloadFilename,
  fetchSourceText,
  runStepAssemblyExport,
  runFeatureDSLExport,
  publishDownload,
}: ExportMergedStepTargetsOptions) {
  const sources = await buildStepAssemblySources({ targets, fetchSourceText, runFeatureDSLExport })
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

type ExportTargetToStepTextOptions = {
  target: StepExportTarget
	fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  runStepRoundTrip: (input: CadKernelStepRoundTripInput) => Promise<CadKernelWorkerResult>
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
}

async function exportTargetToStepText({ target, fetchSourceText, runStepRoundTrip, runFeatureDSLExport }: ExportTargetToStepTextOptions) {
	const sourceText = await fetchSourceText(target.modelId, target.modelRevisionId)
	if (target.sourceFormat === 'lcad') {
		const generated = await runFeatureDSLExport(
			buildFeatureDSLKernelInput(
        {
          filename: target.sourceFilename,
          parameterValues: target.parameterValues ?? {},
        },
        sourceText,
			),
		)
		return runStepRoundTrip({
			filename: target.sourceFilename.replace(/\.lcad\.json$/i, '.step'),
			stepText: generated.exportedStepText,
			operations: target.operations,
		})
	}
  return runStepRoundTrip({
    filename: target.sourceFilename,
    stepText: sourceText,
    operations: target.operations,
  })
}
