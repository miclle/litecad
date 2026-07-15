import { useMemo, useState } from 'react'
import { Braces, CornerDownRight, LoaderCircle, RotateCcw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  featureDSLGraphNodeLocalValue,
  flattenFeatureDSLGraph,
  replaceFeatureDSLGraphNode,
  type FeatureDSLGraphNode,
} from 'src/cad/feature-dsl-graph'
import type { CadKernelFeatureDSLDocument } from 'src/cad/kernel-protocol'
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

type FeatureDSLGraphDraft = {
  artifactID: string
  baseSourceCode: string
  sourceCode: string
  selectedNodeID: string
  nodeSourceCode: string
  nodeError: string
}

export function FeatureDSLGraphEditor({
  artifact,
  compileFeatureDSL,
  debounceMs,
  isSaving = false,
  onSave,
}: FeatureDSLGraphEditorProps) {
  const { t } = useTranslation()
  const [draftState, setDraftState] = useState(() => createFeatureDSLGraphDraft(artifact))
  const hasCurrentDraft = draftState.artifactID === artifact.id && draftState.baseSourceCode === artifact.source_code
  const draft = hasCurrentDraft ? draftState : createFeatureDSLGraphDraft(artifact)
  const sourceCode = draft.sourceCode
  const parsedGraph = useMemo(() => parseFeatureDSLGraph(sourceCode), [sourceCode])
  const selectedNode = parsedGraph.nodes.find((node) => node.id === draft.selectedNodeID) ?? parsedGraph.nodes[0]
  const draftArtifact = useMemo(
    () => ({ ...artifact, source_code: sourceCode, compile_status: 'success' as const, compile_error: '' }),
    [artifact, sourceCode],
  )
  const parameterValues = useMemo(() => featureDSLParameterValues(artifact.parameter_values), [artifact.parameter_values])
  const preview = useParametricArtifactPreview({ artifact: draftArtifact, compileFeatureDSL, debounceMs, parameterValues })
  const hasChanges = sourceCode.trim() !== artifact.source_code.trim()
  const hasMatchingEnvelope = useMemo(
    () => featureDSLEnvelopeMatches(artifact.source_code, sourceCode),
    [artifact.source_code, sourceCode],
  )
  const envelopeError = hasChanges && !hasMatchingEnvelope ? t('project.parametric.featureGraphEnvelopeChanged') : ''
  const selectedNodeSourceCode = selectedNode ? prettyJSON(featureDSLGraphNodeLocalValue(selectedNode)) : ''
  const hasDraftChanges = hasChanges || Boolean(draft.nodeError) || draft.nodeSourceCode !== selectedNodeSourceCode
  const canSave =
    hasChanges &&
    hasMatchingEnvelope &&
    !draft.nodeError &&
    preview.status === 'success' &&
    preview.isCurrent &&
    !isSaving

  const resetDraft = () => setDraftState(createFeatureDSLGraphDraft(artifact))

  const selectNode = (node: FeatureDSLGraphNode) =>
    setDraftState({
      ...draft,
      selectedNodeID: node.id,
      nodeSourceCode: prettyJSON(featureDSLGraphNodeLocalValue(node)),
      nodeError: '',
    })

  const updateNode = (nextNodeSourceCode: string) => {
    if (!selectedNode || !parsedGraph.document) {
      return
    }
    try {
      const nextNodeValue = parseJSONObject(
        nextNodeSourceCode,
        t('project.parametric.featureGraphNodeObjectRequired'),
      )
      if (nextNodeValue.id !== selectedNode.id) {
        throw new Error(t('project.parametric.featureGraphNodeIDChanged', { id: selectedNode.id }))
      }
      if (typeof nextNodeValue.type !== 'string' || nextNodeValue.type.trim() === '') {
        throw new Error(t('project.parametric.featureGraphNodeTypeRequired'))
      }
      const nextDocument = replaceFeatureDSLGraphNode(parsedGraph.document, selectedNode.id, nextNodeValue)
      setDraftState({
        ...draft,
        sourceCode: prettyJSON(nextDocument),
        nodeSourceCode: nextNodeSourceCode,
        nodeError: '',
      })
    } catch (error) {
      setDraftState({
        ...draft,
        nodeSourceCode: nextNodeSourceCode,
        nodeError:
          error instanceof SyntaxError
            ? t('project.parametric.invalidDslSource')
            : error instanceof Error
              ? error.message
              : t('project.parametric.invalidDslSource'),
      })
    }
  }

  const updateCompleteSource = (nextSourceCode: string) => {
    const nextGraph = parseFeatureDSLGraph(nextSourceCode)
    const nextSelectedNode =
      nextGraph.nodes.find((node) => node.id === draft.selectedNodeID) ?? nextGraph.nodes[0]
    setDraftState({
      ...draft,
      sourceCode: nextSourceCode,
      selectedNodeID: nextSelectedNode?.id ?? draft.selectedNodeID,
      nodeSourceCode: nextSelectedNode
        ? prettyJSON(featureDSLGraphNodeLocalValue(nextSelectedNode))
        : draft.nodeSourceCode,
      nodeError: '',
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="rounded-lg border border-border bg-muted/30 p-2">
        <p className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
          {t('project.parametric.featureGraphSummary', {
            version: parsedGraph.document?.version ?? '—',
            count: parsedGraph.nodes.length,
          })}
        </p>
        {parsedGraph.nodes.length > 0 ? (
          <ul aria-label={t('project.parametric.featureGraphNodes')} className="space-y-0.5">
            {parsedGraph.nodes.map((node) => (
              <li key={node.id}>
                <Button
                  aria-label={t('project.parametric.selectFeatureGraphNode', { id: node.id })}
                  className="h-7 w-full justify-start gap-1.5 px-2 font-mono text-[10px]"
                  onClick={() => selectNode(node)}
                  style={{ paddingLeft: `${8 + node.depth * 14}px` }}
                  type="button"
                  variant={selectedNode?.id === node.id ? 'secondary' : 'ghost'}
                >
                  {node.depth > 0 ? <CornerDownRight className="text-muted-foreground" /> : <Braces className="text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-left">{node.id}</span>
                  <span className="shrink-0 text-muted-foreground">{node.type}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {selectedNode ? (
        <Field data-invalid={Boolean(draft.nodeError) || Boolean(envelopeError) || preview.status === 'error'}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`feature-graph-node-${artifact.id}`}>{t('project.parametric.featureGraphNodeSource')}</FieldLabel>
          </div>
          <FieldDescription className="break-all font-mono text-[10px]">{selectedNode.path}</FieldDescription>
          <Textarea
            aria-invalid={Boolean(draft.nodeError) || Boolean(envelopeError) || preview.status === 'error'}
            aria-label={t('project.parametric.featureGraphNodeSource')}
            className="min-h-40 resize-y font-mono text-xs"
            id={`feature-graph-node-${artifact.id}`}
            onChange={(event) => updateNode(event.target.value)}
            spellCheck={false}
            value={draft.nodeSourceCode}
          />
          {draft.nodeError ? <FieldError>{draft.nodeError}</FieldError> : null}
        </Field>
      ) : null}

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              aria-label={t('project.parametric.editCompleteFeatureGraph')}
              className="w-full justify-start"
              size="sm"
              type="button"
              variant="outline"
            />
          }
        >
          <Braces data-icon="inline-start" />
          {t('project.parametric.editCompleteFeatureGraph')}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Field data-invalid={Boolean(envelopeError) || preview.status === 'error'}>
            <FieldLabel htmlFor={`feature-graph-source-${artifact.id}`}>
              {t('project.parametric.completeFeatureGraphSource')}
            </FieldLabel>
            <Textarea
              aria-invalid={Boolean(envelopeError) || preview.status === 'error'}
              aria-label={t('project.parametric.completeFeatureGraphSource')}
              className="min-h-56 resize-y font-mono text-xs"
              id={`feature-graph-source-${artifact.id}`}
              onChange={(event) => updateCompleteSource(event.target.value)}
              spellCheck={false}
              value={sourceCode}
            />
          </Field>
        </CollapsibleContent>
      </Collapsible>

      {envelopeError || preview.error ? <FieldError>{envelopeError || preview.error}</FieldError> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          aria-label={t('project.parametric.resetFeatureGraph')}
          disabled={!hasDraftChanges || isSaving}
          onClick={resetDraft}
          size="sm"
          type="button"
          variant="outline"
        >
          <RotateCcw data-icon="inline-start" />
          {t('project.parametric.resetFeatureGraph')}
        </Button>
        <Button disabled={!canSave} onClick={() => onSave(sourceCode.trim())} size="sm" type="button">
          {preview.status === 'pending' || isSaving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          {t('project.parametric.applyFeatureGraph')}
        </Button>
      </div>
    </div>
  )
}

function createFeatureDSLGraphDraft(artifact: ProjectParametricArtifact): FeatureDSLGraphDraft {
  const graph = parseFeatureDSLGraph(artifact.source_code)
  const selectedNode = graph.nodes[0]
  return {
    artifactID: artifact.id,
    baseSourceCode: artifact.source_code,
    sourceCode: artifact.source_code,
    selectedNodeID: selectedNode?.id ?? '',
    nodeSourceCode: selectedNode ? prettyJSON(featureDSLGraphNodeLocalValue(selectedNode)) : '',
    nodeError: '',
  }
}

function parseFeatureDSLGraph(sourceCode: string): {
  document?: CadKernelFeatureDSLDocument
  nodes: FeatureDSLGraphNode[]
} {
  try {
    const document = JSON.parse(sourceCode) as CadKernelFeatureDSLDocument
    return { document, nodes: flattenFeatureDSLGraph(document) }
  } catch {
    return { nodes: [] }
  }
}

function parseJSONObject(sourceCode: string, objectRequiredError: string): Record<string, unknown> {
  const value = JSON.parse(sourceCode) as unknown
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(objectRequiredError)
  }
  return value as Record<string, unknown>
}

function prettyJSON(value: unknown) {
  return JSON.stringify(value, null, 2)
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
