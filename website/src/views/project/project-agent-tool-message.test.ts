import { describe, expect, it } from 'vitest'

import { displayAiChatBody, generatedArtifactTitleFromAIChatBody } from './project-agent-tool-message'

describe('project agent tool messages', () => {
  it('extracts generated artifact titles from strict and fenced tool JSON', () => {
    const toolJSON = `{
      "tool": "build_parametric_model",
      "input": {
        "title": "Sphere 50 mm",
        "version": "v1",
        "source_kind": "litecad-feature-dsl",
        "code": "{\\"version\\":1,\\"unit\\":\\"millimetre\\",\\"features\\":[{\\"id\\":\\"body\\",\\"type\\":\\"sphere\\",\\"origin\\":[0,0,0],\\"diameter\\":50}]}"
      }
    }`

    expect(generatedArtifactTitleFromAIChatBody(toolJSON)).toBe('Sphere 50 mm')
    expect(generatedArtifactTitleFromAIChatBody(`\`\`\`json\n${toolJSON}\n\`\`\``)).toBe('Sphere 50 mm')
    expect(displayAiChatBody(`\`\`\`json\n${toolJSON}\n\`\`\``)).toBe('Generated source draft: Sphere 50 mm')
  })

  it('keeps normal assistant text unchanged', () => {
    expect(displayAiChatBody('The project has six sources.')).toBe('The project has six sources.')
  })
})
