import type { ProjectAgentParametricTelemetry, ProjectParametricArtifact } from 'src/types/project'

type ParametricRunTranslator = (key: string, options?: Record<string, unknown>) => string

export function formatParametricRunSummary(title: string, telemetry?: ProjectAgentParametricTelemetry, t: ParametricRunTranslator = defaultParametricRunTranslator) {
  const baseSummary = t('project.parametric.generatedDraft', { title })
  if (!telemetry) {
    return baseSummary
  }
  return `${baseSummary}\n\n${t('project.parametric.runSummary', {
    toolMode: formatToolMode(telemetry.tool_mode, t),
    sourceKind: telemetry.source_kind,
    duration: formatDuration(telemetry.duration_ms),
  })}`
}

export function formatParametricArtifactGenerationSummary(artifact: ProjectParametricArtifact, t: ParametricRunTranslator = defaultParametricRunTranslator) {
  if (!artifact.generation_tool_mode) {
    return ''
  }
  return t('project.parametric.generatedWith', {
    toolMode: formatToolMode(artifact.generation_tool_mode, t),
    sourceKind: artifact.source_kind,
    duration: formatDuration(artifact.generation_duration_ms),
  })
}

function formatToolMode(toolMode: ProjectAgentParametricTelemetry['tool_mode'], t: ParametricRunTranslator) {
  if (toolMode === 'native_tool') {
    return t('project.parametric.nativeTool')
  }
  return t('project.parametric.jsonFallback')
}

function formatDuration(durationMS: number) {
  if (!Number.isFinite(durationMS) || durationMS < 0) {
    return '0ms'
  }
  if (durationMS < 1000) {
    return `${Math.round(durationMS)}ms`
  }
  return `${(durationMS / 1000).toFixed(2)}s`
}

function defaultParametricRunTranslator(key: string, options: Record<string, unknown> = {}) {
  if (key === 'project.parametric.generatedDraft') {
    return `Generated source draft: ${String(options.title ?? '')}`
  }
  if (key === 'project.parametric.runSummary') {
    return `Run: ${String(options.toolMode ?? '')} · ${String(options.sourceKind ?? '')} · ${String(options.duration ?? '')}`
  }
  if (key === 'project.parametric.generatedWith') {
    return `Generated with ${String(options.toolMode ?? '')} · ${String(options.sourceKind ?? '')} · ${String(options.duration ?? '')}`
  }
  if (key === 'project.parametric.nativeTool') {
    return 'native tool'
  }
  if (key === 'project.parametric.jsonFallback') {
    return 'JSON fallback'
  }
  return key
}
