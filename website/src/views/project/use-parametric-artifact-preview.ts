import { useEffect, useMemo, useRef, useState } from 'react'

import type { CadKernelFeatureDSLInput } from 'src/cad/kernel-protocol'
import { runFeatureDSLPreviewInWorker, type CadKernelWorkerFeatureDSLPreviewResult } from 'src/cad/kernel-worker-client'
import { compileOpenSCADInWorker, type OpenSCADCompileInput } from 'src/cad/openscad-client'
import type { OpenSCADCompileResult, OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import { parseOpenSCADParameters, type OpenSCADParameter } from 'src/cad/openscad-parameters'
import type { ProjectParametricArtifact } from 'src/types/project'
import { buildFeatureDSLKernelInput } from './project-feature-dsl-preview'

export type ParametricArtifactCompileStatus = 'idle' | 'pending' | 'success' | 'error'

export type ParametricArtifactCompile = (input: OpenSCADCompileInput) => Promise<OpenSCADCompileResult>
export type ParametricFeatureDSLArtifactCompile = (input: CadKernelFeatureDSLInput) => Promise<CadKernelWorkerFeatureDSLPreviewResult>

export type ParametricArtifactPreviewState = {
  error: string
  inputSignature: string
  isCurrent: boolean
  parameters: ReturnType<typeof parseOpenSCADParameters>
  result?: OpenSCADCompileResult | CadKernelWorkerFeatureDSLPreviewResult
  status: ParametricArtifactCompileStatus
}

type UseParametricArtifactPreviewOptions = {
  artifact?: ProjectParametricArtifact
  compile?: ParametricArtifactCompile
  compileFeatureDSL?: ParametricFeatureDSLArtifactCompile
  debounceMs?: number
  parameterValues: Record<string, OpenSCADParameterValue>
}

export function defaultOpenSCADParameterValues(parameters: ReturnType<typeof parseOpenSCADParameters>) {
  return parameters.reduce<Record<string, OpenSCADParameterValue>>((values, parameter) => {
    values[parameter.name] = parameter.value
    return values
  }, {})
}

export function useParametricArtifactPreview({
  artifact,
  compile = compileOpenSCADInWorker,
  compileFeatureDSL = runFeatureDSLPreviewInWorker,
  debounceMs = 250,
  parameterValues,
}: UseParametricArtifactPreviewOptions): ParametricArtifactPreviewState {
  const parameters = useMemo(() => parseParametricArtifactParameters(artifact), [artifact])
  const parameterSignature = useMemo(() => stableJSONStringify(parameterValues), [parameterValues])
  const inputSignature = artifact
    ? `${artifact.id}:${artifact.source_kind}:${artifact.source_code}:${artifact.compile_status}:${artifact.compile_error}:${parameterSignature}`
    : ''
  const sequenceRef = useRef(0)
  const [state, setState] = useState<Pick<ParametricArtifactPreviewState, 'error' | 'inputSignature' | 'result' | 'status'>>({
    error: '',
    inputSignature: '',
    status: artifact ? 'pending' : 'idle',
  })

  useEffect(() => {
    if (!artifact) {
      sequenceRef.current += 1
      return
    }
    if (artifact.source_kind === 'litecad-feature-dsl') {
      const sequence = sequenceRef.current + 1
      sequenceRef.current = sequence
      if (artifact.compile_status === 'error') {
        return
      }

      const timer = window.setTimeout(() => {
        Promise.resolve()
          .then(() =>
            compileFeatureDSL(
              buildFeatureDSLKernelInput(
                {
                  filename: featureDSLArtifactFilename(artifact),
                  parameterValues,
                },
                artifact.source_code,
              ),
            ),
          )
          .then((result) => {
            if (sequenceRef.current !== sequence) {
              return
            }
            setState({ error: '', inputSignature, result, status: 'success' })
          })
          .catch((error: unknown) => {
            if (sequenceRef.current !== sequence) {
              return
            }
            setState({ error: error instanceof Error ? error.message : String(error), inputSignature, result: undefined, status: 'error' })
          })
      }, Math.max(0, debounceMs))

      return () => {
        window.clearTimeout(timer)
      }
    }

    const sequence = sequenceRef.current + 1
    sequenceRef.current = sequence

    const timer = window.setTimeout(() => {
      compile({ code: artifact.source_code, parameterValues })
        .then((result) => {
          if (sequenceRef.current !== sequence) {
            return
          }
          setState({ error: '', inputSignature, result, status: 'success' })
        })
        .catch((error: unknown) => {
          if (sequenceRef.current !== sequence) {
            return
          }
          setState({ error: error instanceof Error ? error.message : String(error), inputSignature, result: undefined, status: 'error' })
        })
    }, Math.max(0, debounceMs))

    return () => {
      window.clearTimeout(timer)
    }
    // parameterSignature intentionally represents parameterValues for stable effect comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    artifact?.id,
    artifact?.title,
    artifact?.source_code,
    artifact?.source_kind,
    artifact?.compile_status,
    artifact?.compile_error,
    compile,
    compileFeatureDSL,
    debounceMs,
    inputSignature,
    parameterSignature,
  ])

  if (!artifact) {
    return { error: '', inputSignature, isCurrent: true, parameters, result: undefined, status: 'idle' }
  }
  if (artifact.source_kind === 'litecad-feature-dsl' && artifact.compile_status === 'error') {
    return {
      error: artifact.compile_error || 'LiteCAD feature DSL preview failed',
      inputSignature,
      isCurrent: true,
      parameters,
      result: undefined,
      status: 'error',
    }
  }
  if (state.inputSignature !== inputSignature) {
    return { error: '', inputSignature, isCurrent: false, parameters, result: undefined, status: 'pending' }
  }
  return { ...state, isCurrent: true, parameters }
}

function featureDSLArtifactFilename(artifact: ProjectParametricArtifact) {
  const slug = artifact.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || artifact.id}.lcad.json`
}

function parseParametricArtifactParameters(artifact: ProjectParametricArtifact | undefined): OpenSCADParameter[] {
  if (!artifact) {
    return []
  }
  if (artifact.source_kind === 'litecad-feature-dsl') {
    return parseLiteCADFeatureDSLParameters(artifact.source_code)
  }
  return parseOpenSCADParameters(artifact.source_code)
}

function parseLiteCADFeatureDSLParameters(source: string): OpenSCADParameter[] {
  let document: { parameters?: Record<string, { type?: unknown; default?: unknown; min?: unknown; max?: unknown; step?: unknown; options?: unknown }> }
  try {
    document = JSON.parse(source) as typeof document
  } catch {
    return []
  }
  const parameters: OpenSCADParameter[] = []
  for (const [name, parameter] of Object.entries(document.parameters ?? {})) {
    const group = ''
    if (parameter.type === 'number' && typeof parameter.default === 'number') {
      const min = typeof parameter.min === 'number' ? parameter.min : undefined
      const max = typeof parameter.max === 'number' ? parameter.max : undefined
      const step = typeof parameter.step === 'number' ? parameter.step : 1
      const range = min === undefined || max === undefined ? undefined : { min, step, max }
      parameters.push(range ? { name, type: 'number', value: parameter.default, range, group } : { name, type: 'number', value: parameter.default, group })
      continue
    }
    if (parameter.type === 'boolean' && typeof parameter.default === 'boolean') {
      parameters.push({ name, type: 'boolean', value: parameter.default, group })
      continue
    }
    if (parameter.type === 'string' && typeof parameter.default === 'string') {
      const options = Array.isArray(parameter.options) ? parameter.options.filter((option): option is string => typeof option === 'string') : []
      parameters.push(options.length > 0 ? { name, type: 'string', value: parameter.default, options, group } : { name, type: 'string', value: parameter.default, group })
    }
  }
  return parameters
}

function stableJSONStringify(value: Record<string, OpenSCADParameterValue>) {
  const ordered: Record<string, OpenSCADParameterValue> = {}
  for (const key of Object.keys(value).sort()) {
    ordered[key] = value[key]
  }
  return JSON.stringify(ordered)
}
