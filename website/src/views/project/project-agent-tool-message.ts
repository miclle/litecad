function normalizeToolMessageBody(body: string) {
  const trimmed = body.trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }
  const lines = trimmed.split('\n')
  if (lines.length < 3 || !lines[0]?.trim().startsWith('```') || lines.at(-1)?.trim() !== '```') {
    return trimmed
  }
  return lines.slice(1, -1).join('\n').trim()
}

export function generatedArtifactTitleFromAIChatBody(body: string) {
  try {
    const parsed = JSON.parse(normalizeToolMessageBody(body)) as { tool?: string; input?: { title?: string } }
    if (parsed.tool === 'build_parametric_model' && parsed.input?.title) {
      return parsed.input.title
    }
  } catch {
    return ''
  }
  return ''
}

export function displayAiChatBody(body: string) {
  const generatedTitle = generatedArtifactTitleFromAIChatBody(body)
  if (generatedTitle) {
    return `Generated source draft: ${generatedTitle}`
  }
  return body
}
