import type { CadKernelWorkerFeatureDSLExportResult, CadKernelWorkerSectionGeometryResult } from 'src/cad/kernel-worker-client'
import type { CadKernelFeatureDSLExportInput, CadKernelSectionGeometryInput } from 'src/cad/opencascade-step'
import { buildStepAssemblySources } from './project-step-export-action'
import type { StepExportTarget } from './project-step-export'

type GenerateProjectSectionGeometryOptions = {
  filename: string
  fetchSourceText: (modelId: string, modelRevisionId: string) => Promise<string>
  plane: CadKernelSectionGeometryInput['plane']
  runFeatureDSLExport: (input: CadKernelFeatureDSLExportInput) => Promise<CadKernelWorkerFeatureDSLExportResult>
  runSectionGeometry: (input: CadKernelSectionGeometryInput) => Promise<CadKernelWorkerSectionGeometryResult>
  targets: StepExportTarget[]
}

export async function generateProjectSectionGeometry({ filename, fetchSourceText, plane, runFeatureDSLExport, runSectionGeometry, targets }: GenerateProjectSectionGeometryOptions) {
  if (targets.length === 0) {
    throw new Error('Section geometry requires at least one visible target')
  }
  const sources = await buildStepAssemblySources({ targets, fetchSourceText, runFeatureDSLExport })
  return runSectionGeometry({ filename, sources, plane })
}

export function projectSectionArtifactFilename(projectName: string, revision: number) {
  const baseName = projectName.trim() || 'assembly'
  const safeBaseName =
    baseName
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'assembly'
  return `${safeBaseName}-litecad-section-r${revision}.step`
}
