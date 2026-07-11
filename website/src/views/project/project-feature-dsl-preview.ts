import type { CadKernelFeatureDSLDocument, CadKernelFeatureDSLInput } from 'src/cad/kernel-protocol'
import type { ProjectModel } from 'src/types/project'

export function buildFeatureDSLPreviewInput(model: ProjectModel, sourceText: string): CadKernelFeatureDSLInput {
  return buildFeatureDSLKernelInput(
    {
      filename: model.original_filename,
      parameterValues: model.metadata.parameter_values ?? {},
    },
    sourceText,
  )
}

export function buildFeatureDSLKernelInput(
  source: { filename: string; parameterValues?: Record<string, unknown> },
  sourceText: string,
): CadKernelFeatureDSLInput {
  let document: CadKernelFeatureDSLDocument
  try {
    document = JSON.parse(sourceText) as CadKernelFeatureDSLDocument
  } catch {
    throw new Error('Invalid LiteCAD feature DSL source')
  }

  return {
    filename: source.filename,
    document,
    parameterValues: numericFeatureDSLParameterValues(document, source.parameterValues ?? {}),
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
