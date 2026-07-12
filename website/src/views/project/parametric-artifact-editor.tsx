import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Box, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { parseOpenSCADParameters } from 'src/cad/openscad-parameters'
import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import type { ProjectParametricArtifact } from 'src/types/project'
import {
  defaultOpenSCADParameterValues,
  useParametricArtifactPreview,
  type ParametricArtifactCompile,
  type ParametricFeatureDSLArtifactCompile,
} from './use-parametric-artifact-preview'

type ParametricArtifactEditorProps = {
  artifact: ProjectParametricArtifact
  autoSaveOnPreviewSuccess?: boolean
  compile?: ParametricArtifactCompile
  compileFeatureDSL?: ParametricFeatureDSLArtifactCompile
  debounceMs?: number
  initialParameterValues?: Record<string, unknown>
  onSaveAsModel?: (parameterValues: Record<string, OpenSCADParameterValue>) => void
  onSaveParameters?: (parameterValues: Record<string, OpenSCADParameterValue>) => void
  saveLabel?: string
}

type ParameterEditorState = {
  artifactID: string
  initialSignature: string
  values: Record<string, OpenSCADParameterValue>
}

export function ParametricArtifactEditor({
  artifact,
  autoSaveOnPreviewSuccess = false,
  compile,
  compileFeatureDSL,
  debounceMs,
  initialParameterValues,
  onSaveAsModel,
  onSaveParameters,
  saveLabel = 'Save as model',
}: ParametricArtifactEditorProps) {
  const parsedParameters = useMemo(() => parseOpenSCADParameters(artifact.source_code), [artifact.source_code])
  const defaultValues = useMemo(() => defaultOpenSCADParameterValues(parsedParameters), [parsedParameters])
  const editorInitialValues = useMemo(
    () => ({
      ...defaultValues,
      ...openSCADParameterValuesFromUnknown(artifact.parameter_values),
      ...openSCADParameterValuesFromUnknown(initialParameterValues),
    }),
    [artifact.parameter_values, defaultValues, initialParameterValues],
  )
  const editorInitialSignature = useMemo(() => stableParameterValueSignature(editorInitialValues), [editorInitialValues])
  const [parameterEditorState, setParameterEditorState] = useState<ParameterEditorState>(() => ({
    artifactID: artifact.id,
    initialSignature: editorInitialSignature,
    values: editorInitialValues,
  }))
  const autoSaveSignatureRef = useRef('')
  const savedParameterSignatureRef = useRef(`${artifact.id}:${editorInitialSignature}`)
  const parameterValues =
    parameterEditorState.artifactID === artifact.id && parameterEditorState.initialSignature === editorInitialSignature
      ? parameterEditorState.values
      : editorInitialValues

  useEffect(() => {
    savedParameterSignatureRef.current = `${artifact.id}:${editorInitialSignature}`
    setParameterEditorState({
      artifactID: artifact.id,
      initialSignature: editorInitialSignature,
      values: editorInitialValues,
    })
  }, [artifact.id, editorInitialSignature, editorInitialValues])

  const preview = useParametricArtifactPreview({ artifact, compile, compileFeatureDSL, debounceMs, parameterValues })
  const canSave = preview.status === 'success' && Boolean(onSaveAsModel)
  const parameterSignature = useMemo(() => stableParameterValueSignature(parameterValues), [parameterValues])
  const shouldAutoSaveOnPreviewSuccess = autoSaveOnPreviewSuccess && artifact.source_kind === 'litecad-feature-dsl'

  const updateParameterValue = (name: string, value: OpenSCADParameterValue) => {
    setParameterEditorState((currentState) => {
      const currentValues =
        currentState.artifactID === artifact.id && currentState.initialSignature === editorInitialSignature ? currentState.values : editorInitialValues
      return {
        artifactID: artifact.id,
        initialSignature: editorInitialSignature,
        values: { ...currentValues, [name]: value },
      }
    })
  }

  const handleSave = () => {
    onSaveAsModel?.(parameterValues)
  }

  useEffect(() => {
    if (!shouldAutoSaveOnPreviewSuccess || onSaveParameters || preview.status !== 'success' || !preview.isCurrent || !onSaveAsModel) {
      return
    }

    const signature = `${artifact.id}:${parameterSignature}`
    if (autoSaveSignatureRef.current === signature) {
      return
    }

    autoSaveSignatureRef.current = signature
    onSaveAsModel(parameterValues)
  }, [artifact.id, onSaveAsModel, onSaveParameters, parameterSignature, parameterValues, preview.isCurrent, preview.status, shouldAutoSaveOnPreviewSuccess])

  useEffect(() => {
    if (!onSaveParameters) {
      return
    }

    const signature = `${artifact.id}:${parameterSignature}`
    if (savedParameterSignatureRef.current === signature) {
      return
    }

    savedParameterSignatureRef.current = signature
    onSaveParameters(parameterValues)
  }, [artifact.id, onSaveParameters, parameterSignature, parameterValues])

  return (
    <section aria-label="Parametric artifact" className="mt-4 min-w-0 overflow-hidden border-t border-[#e2e8f0] pt-4">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-[#0f172a]" title={artifact.title}>
          {artifact.title}
        </h2>
      </div>

      <FieldSet className="mt-3 min-w-0 gap-3">
        {preview.parameters.length > 0 ? (
          <FieldGroup className="min-w-0 gap-2">
            <FieldTitle className="text-xs text-[#334155]">Parameters</FieldTitle>
            <div className="grid min-w-0 gap-2">
              {preview.parameters.map((parameter) => {
                const value = parameterValues[parameter.name] ?? parameter.value
                if (parameter.type === 'number') {
                  const range = parameter.range ?? { min: 0, step: 1, max: Math.max(Number(value) || 1, 1) * 2 }
                  return (
                    <Field className="min-w-0 gap-1" key={parameter.name}>
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel className="font-mono text-[10px] uppercase text-[#64748b]">{parameter.name}</FieldLabel>
                        <Input
                          aria-label={`${parameter.name} value`}
                          className="h-7 w-20 rounded-md border-[#d6dbe3] px-2 text-right font-mono text-[11px]"
                          inputMode="decimal"
                          onChange={(event) => updateParameterValue(parameter.name, Number(event.target.value))}
                          type="number"
                          value={Number(value)}
                        />
                      </div>
                      <input
                        aria-label={`${parameter.name} parameter`}
                        className="h-5 min-w-0 max-w-full accent-[#1d4ed8]"
                        max={range.max}
                        min={range.min}
                        onChange={(event) => updateParameterValue(parameter.name, Number(event.target.value))}
                        step={range.step}
                        type="range"
                        value={Number(value)}
                      />
                    </Field>
                  )
                }
                if (parameter.type === 'boolean') {
                  return (
                    <label className="flex items-center justify-between gap-3 rounded-md border border-[#e2e8f0] bg-white px-2 py-1.5 text-xs" key={parameter.name}>
                      <span className="font-mono uppercase text-[#64748b]">{parameter.name}</span>
                      <input
                        aria-label={`${parameter.name} parameter`}
                        checked={Boolean(value)}
                        className="size-4 accent-[#1d4ed8]"
                        onChange={(event) => updateParameterValue(parameter.name, event.target.checked)}
                        type="checkbox"
                      />
                    </label>
                  )
                }
                if (parameter.type === 'color') {
                  return (
                    <Field className="min-w-0 gap-1" key={parameter.name}>
                      <FieldLabel className="font-mono text-[10px] uppercase text-[#64748b]">{parameter.name}</FieldLabel>
                      <Input
                        aria-label={`${parameter.name} parameter`}
                        className="h-8 rounded-md border-[#d6dbe3] bg-white"
                        onChange={(event) => updateParameterValue(parameter.name, event.target.value)}
                        type="color"
                        value={String(value)}
                      />
                    </Field>
                  )
                }
                if (parameter.options && parameter.options.length > 0) {
                  return (
                    <Field className="min-w-0 gap-1" key={parameter.name}>
                      <FieldLabel className="font-mono text-[10px] uppercase text-[#64748b]">{parameter.name}</FieldLabel>
                      <select
                        aria-label={`${parameter.name} parameter`}
                        className="h-8 rounded-md border border-[#d6dbe3] bg-white px-2 text-xs text-[#0f172a] outline-none focus:border-[#94a3b8] focus:ring-2 focus:ring-[#bfdbfe]"
                        onChange={(event) => updateParameterValue(parameter.name, event.target.value)}
                        value={String(value)}
                      >
                        {parameter.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )
                }
                return (
                  <Field className="min-w-0 gap-1" key={parameter.name}>
                    <FieldLabel className="font-mono text-[10px] uppercase text-[#64748b]">{parameter.name}</FieldLabel>
                    <Input
                      aria-label={`${parameter.name} parameter`}
                      className="h-8 rounded-md border-[#d6dbe3] bg-white px-2 text-xs"
                      onChange={(event) => updateParameterValue(parameter.name, event.target.value)}
                      type="text"
                      value={String(value)}
                    />
                  </Field>
                )
              })}
            </div>
          </FieldGroup>
        ) : null}

        {preview.error ? (
          <FieldError className="flex items-start gap-2 text-[11px] leading-4">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{preview.error}</span>
          </FieldError>
        ) : null}

        {shouldAutoSaveOnPreviewSuccess || onSaveParameters ? null : (
          <Button className="justify-center" disabled={!canSave} onClick={handleSave} size="sm" type="button">
            {canSave ? <Save data-icon="inline-start" /> : <Box data-icon="inline-start" />}
            {saveLabel}
          </Button>
        )}
      </FieldSet>
    </section>
  )
}

function stableParameterValueSignature(parameterValues: Record<string, OpenSCADParameterValue>) {
  const ordered: Record<string, OpenSCADParameterValue> = {}
  for (const key of Object.keys(parameterValues).sort()) {
    ordered[key] = parameterValues[key]
  }
  return JSON.stringify(ordered)
}

function openSCADParameterValuesFromUnknown(values: Record<string, unknown> | undefined) {
  const parameterValues: Record<string, OpenSCADParameterValue> = {}
  for (const [name, value] of Object.entries(values ?? {})) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      parameterValues[name] = value
    }
  }
  return parameterValues
}
