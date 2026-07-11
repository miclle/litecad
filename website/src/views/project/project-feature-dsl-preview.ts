import type { CadKernelFeatureDSLDocument, CadKernelFeatureDSLPreviewRequest } from 'src/cad/kernel-protocol'
import type { ProjectModel } from 'src/types/project'

type CadKernelFeatureDSLPreviewInput = CadKernelFeatureDSLPreviewRequest['payload']

export function buildFeatureDSLPreviewInput(model: ProjectModel, sourceText: string): CadKernelFeatureDSLPreviewInput {
  let document: CadKernelFeatureDSLDocument
  try {
    document = JSON.parse(sourceText) as CadKernelFeatureDSLDocument
  } catch {
    throw new Error('Invalid LiteCAD feature DSL source')
  }

  return {
    filename: model.original_filename,
    document,
    parameterValues: numericFeatureDSLParameterValues(document, model.metadata.parameter_values ?? {}),
  }
}

function numericFeatureDSLParameterValues(document: CadKernelFeatureDSLDocument, values: Record<string, unknown>) {
  const numericValues: Record<string, number> = {}
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'number' && document.parameters?.[name]?.type === 'number') {
      numericValues[name] = value
    }
  }
  return numericValues
}
