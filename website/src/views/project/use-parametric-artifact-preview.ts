import { useEffect, useMemo, useRef, useState } from 'react'

import { compileOpenSCADInWorker, type OpenSCADCompileInput } from 'src/cad/openscad-client'
import type { OpenSCADCompileResult, OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import { parseOpenSCADParameters } from 'src/cad/openscad-parameters'
import type { ProjectParametricArtifact } from 'src/types/project'

export type ParametricArtifactCompileStatus = 'idle' | 'pending' | 'success' | 'error'

export type ParametricArtifactCompile = (input: OpenSCADCompileInput) => Promise<OpenSCADCompileResult>

export type ParametricArtifactPreviewState = {
  error: string
  parameters: ReturnType<typeof parseOpenSCADParameters>
  result?: OpenSCADCompileResult
  status: ParametricArtifactCompileStatus
}

type UseParametricArtifactPreviewOptions = {
  artifact?: ProjectParametricArtifact
  compile?: ParametricArtifactCompile
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
  debounceMs = 250,
  parameterValues,
}: UseParametricArtifactPreviewOptions): ParametricArtifactPreviewState {
  const parameters = useMemo(() => parseOpenSCADParameters(artifact?.source_code ?? ''), [artifact?.source_code])
  const parameterSignature = useMemo(() => stableJSONStringify(parameterValues), [parameterValues])
  const sequenceRef = useRef(0)
  const [state, setState] = useState<Pick<ParametricArtifactPreviewState, 'error' | 'result' | 'status'>>({
    error: '',
    status: artifact ? 'pending' : 'idle',
  })

  useEffect(() => {
    if (!artifact) {
      sequenceRef.current += 1
      setState({ error: '', result: undefined, status: 'idle' })
      return
    }

    const sequence = sequenceRef.current + 1
    sequenceRef.current = sequence
    setState({ error: '', result: undefined, status: 'pending' })

    const timer = window.setTimeout(() => {
      compile({ code: artifact.source_code, parameterValues })
        .then((result) => {
          if (sequenceRef.current !== sequence) {
            return
          }
          setState({ error: '', result, status: 'success' })
        })
        .catch((error: unknown) => {
          if (sequenceRef.current !== sequence) {
            return
          }
          setState({ error: error instanceof Error ? error.message : String(error), result: undefined, status: 'error' })
        })
    }, Math.max(0, debounceMs))

    return () => {
      window.clearTimeout(timer)
    }
    // parameterSignature intentionally represents parameterValues for stable effect comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.id, artifact?.source_code, compile, debounceMs, parameterSignature])

  return { ...state, parameters }
}

function stableJSONStringify(value: Record<string, OpenSCADParameterValue>) {
  const ordered: Record<string, OpenSCADParameterValue> = {}
  for (const key of Object.keys(value).sort()) {
    ordered[key] = value[key]
  }
  return JSON.stringify(ordered)
}
