import type { CadKernelWorkerFeatureDSLExportResult, CadKernelWorkerShapeInspectionResult } from 'src/cad/kernel-worker-client'
import type { CadKernelFeatureDSLExportInput, CadKernelShapeInspectionInput } from 'src/cad/opencascade-step'
import { buildStepAssemblySources } from './project-step-export-action'
import type { StepExportTarget } from './project-step-export'

type GenerateProjectTopologyInspectionOptions = {
  fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
  runShapeInspection: (input: CadKernelShapeInspectionInput) => Promise<CadKernelWorkerShapeInspectionResult>
  targets: StepExportTarget[]
}

export async function generateProjectTopologyInspection({
  fetchSourceText,
  runFeatureDSLExport,
  runShapeInspection,
  targets,
}: GenerateProjectTopologyInspectionOptions) {
  if (targets.length === 0) {
    throw new Error('Topology inspection requires at least one visible target')
  }
  const sources = await buildStepAssemblySources({ targets, fetchSourceText, runFeatureDSLExport })
  return runShapeInspection({
    sources: sources.map((source, index) => {
      const target = targets[index]
      if (!target) {
        throw new Error('Topology inspection target scope is unavailable')
      }
      return {
        ...source,
        referenceScope: { occurrenceId: target.occurrenceId, modelRevisionId: target.modelRevisionId },
      }
    }),
  })
}
