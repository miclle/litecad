import { useMemo, useState } from 'react'
import { LoaderCircle, RotateCcw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import type { ProjectParametricArtifact } from 'src/types/project'
import { useParametricArtifactPreview, type ParametricFeatureDSLArtifactCompile } from './use-parametric-artifact-preview'

type FeatureDSLGraphEditorProps = {
  artifact: ProjectParametricArtifact
  compileFeatureDSL?: ParametricFeatureDSLArtifactCompile
  debounceMs?: number
  isSaving?: boolean
  onSave: (sourceCode: string) => void
}

type FeatureDSLGraphNode = {
  id: string
  type: string
}

export function FeatureDSLGraphEditor({
  artifact,
  compileFeatureDSL,
  debounceMs,
  isSaving = false,
  onSave,
}: FeatureDSLGraphEditorProps) {
  const { t } = useTranslation()
  const [draftState, setDraftState] = useState(() => ({
    artifactID: artifact.id,
    baseSourceCode: artifact.source_code,
    sourceCode: artifact.source_code,
  }))
  const hasCurrentDraft = draftState.artifactID === artifact.id && draftState.baseSourceCode === artifact.source_code
  const sourceCode = hasCurrentDraft ? draftState.sourceCode : artifact.source_code
  const draftArtifact = useMemo(
    () => ({ ...artifact, source_code: sourceCode, compile_status: 'success' as const, compile_error: '' }),
    [artifact, sourceCode],
  )
  const parameterValues = useMemo(() => featureDSLParameterValues(artifact.parameter_values), [artifact.parameter_values])
  const preview = useParametricArtifactPreview({ artifact: draftArtifact, compileFeatureDSL, debounceMs, parameterValues })
  const nodes = useMemo(() => featureDSLGraphNodes(sourceCode), [sourceCode])
  const hasChanges = sourceCode.trim() !== artifact.source_code.trim()
  const hasMatchingEnvelope = useMemo(
    () => featureDSLEnvelopeMatches(artifact.source_code, sourceCode),
    [artifact.source_code, sourceCode],
  )
  const envelopeError = hasChanges && !hasMatchingEnvelope ? t('project.parametric.featureGraphEnvelopeChanged') : ''
  const canSave = hasChanges && hasMatchingEnvelope && preview.status === 'success' && preview.isCurrent && !isSaving

  const resetDraft = () =>
    setDraftState({ artifactID: artifact.id, baseSourceCode: artifact.source_code, sourceCode: artifact.source_code })

  const updateDraft = (nextSourceCode: string) =>
    setDraftState({ artifactID: artifact.id, baseSourceCode: artifact.source_code, sourceCode: nextSourceCode })

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {nodes.length > 0 ? (
        <ul aria-label={t('project.parametric.featureGraphNodes')} className="divide-y divide-border border-y border-border">
          {nodes.map((node, index) => (
            <li className="flex min-w-0 items-center justify-between gap-3 py-1.5 font-mono text-[10px]" key={`${node.id}:${index}`}>
              <span className="truncate text-foreground">{node.id}</span>
              <span className="shrink-0 text-muted-foreground">{node.type}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Field data-invalid={Boolean(envelopeError) || preview.status === 'error'}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={`feature-graph-source-${artifact.id}`}>{t('project.parametric.featureGraphSource')}</FieldLabel>
          <Button
            aria-label={t('project.parametric.resetFeatureGraph')}
            disabled={!hasChanges || isSaving}
            onClick={resetDraft}
            size="icon-xs"
            title={t('project.parametric.resetFeatureGraph')}
            type="button"
            variant="ghost"
          >
            <RotateCcw />
          </Button>
        </div>
        <Textarea
          aria-invalid={Boolean(envelopeError) || preview.status === 'error'}
          aria-label={t('project.parametric.featureGraphSource')}
          className="min-h-56 resize-y font-mono text-xs"
          id={`feature-graph-source-${artifact.id}`}
          onChange={(event) => updateDraft(event.target.value)}
          spellCheck={false}
          value={sourceCode}
        />
        {envelopeError || preview.error ? <FieldError>{envelopeError || preview.error}</FieldError> : null}
      </Field>

      <Button disabled={!canSave} onClick={() => onSave(sourceCode.trim())} size="sm" type="button">
        {preview.status === 'pending' || isSaving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
        {t('project.parametric.applyFeatureGraph')}
      </Button>
    </div>
  )
}

function featureDSLGraphNodes(sourceCode: string): FeatureDSLGraphNode[] {
  try {
    const document = JSON.parse(sourceCode) as { features?: Array<{ id?: unknown; type?: unknown }> }
    return (document.features ?? []).flatMap((feature) =>
      typeof feature.id === 'string' && typeof feature.type === 'string' ? [{ id: feature.id, type: feature.type }] : [],
    )
  } catch {
    return []
  }
}

function featureDSLParameterValues(values: Record<string, unknown>) {
  const result: Record<string, OpenSCADParameterValue> = {}
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      result[name] = value
    }
  }
  return result
}

function featureDSLEnvelopeMatches(initialSourceCode: string, draftSourceCode: string) {
  try {
    return featureDSLEnvelopeSignature(initialSourceCode) === featureDSLEnvelopeSignature(draftSourceCode)
  } catch {
    return true
  }
}

function featureDSLEnvelopeSignature(sourceCode: string) {
  const document = JSON.parse(sourceCode) as Record<string, unknown>
  const envelope = { ...document }
  delete envelope.features
  return JSON.stringify(stableJSONValue(envelope))
}

function stableJSONValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJSONValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJSONValue(entry)]),
    )
  }
  return value
}
