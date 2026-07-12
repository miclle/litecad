import type { ProjectAgentParametricTelemetry } from 'src/types/project'

export function formatParametricRunSummary(title: string, telemetry?: ProjectAgentParametricTelemetry) {
  const baseSummary = `Generated source draft: ${title}`
  if (!telemetry) {
    return baseSummary
  }
  return `${baseSummary}\n\nRun: ${formatToolMode(telemetry.tool_mode)} · ${telemetry.source_kind} · ${formatDuration(telemetry.duration_ms)}`
}

function formatToolMode(toolMode: ProjectAgentParametricTelemetry['tool_mode']) {
  return toolMode === 'native_tool' ? 'native tool' : 'JSON fallback'
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
