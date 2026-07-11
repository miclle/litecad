export type OpenSCADParameterRange = {
  min: number
  step: number
  max: number
}

export type OpenSCADParameter =
  | {
      name: string
      type: 'number'
      value: number
      range?: OpenSCADParameterRange
      group: string
    }
  | {
      name: string
      type: 'string' | 'color'
      value: string
      options?: string[]
      group: string
    }
  | {
      name: string
      type: 'boolean'
      value: boolean
      group: string
    }

const groupCommentPattern = /^\/\*\s*\[([^\]]+)]\s*\*\/\s*$/
const assignmentPattern = /^([A-Za-z_]\w*)\s*=\s*([^;]+);\s*(?:(?:\/\/)\s*(\[[^\]]+]))?\s*$/

export function parseOpenSCADParameters(code: string): OpenSCADParameter[] {
  const parameters: OpenSCADParameter[] = []
  let group = ''

  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('//')) {
      continue
    }
    if (/^(module|function)\s+/.test(line)) {
      break
    }

    const groupMatch = line.match(groupCommentPattern)
    if (groupMatch) {
      group = groupMatch[1].trim()
      continue
    }

    const assignmentMatch = line.match(assignmentPattern)
    if (!assignmentMatch) {
      continue
    }
    const [, name, rawValue, rawCustomizer] = assignmentMatch
    const parameter = parseOpenSCADParameter(name, rawValue.trim(), rawCustomizer, group)
    if (parameter) {
      parameters.push(parameter)
    }
  }

  return parameters
}

function parseOpenSCADParameter(name: string, rawValue: string, rawCustomizer: string | undefined, group: string): OpenSCADParameter | null {
  if (rawValue === 'true' || rawValue === 'false') {
    return { name, type: 'boolean', value: rawValue === 'true', group }
  }

  const numericValue = Number(rawValue)
  if (Number.isFinite(numericValue)) {
    const range = parseOpenSCADRange(rawCustomizer)
    return range ? { name, type: 'number', value: numericValue, range, group } : { name, type: 'number', value: numericValue, group }
  }

  const stringValue = parseOpenSCADString(rawValue)
  if (stringValue !== null) {
    const options = parseOpenSCADOptions(rawCustomizer)
    const type = name.endsWith('_color') ? 'color' : 'string'
    return options.length > 0 ? { name, type, value: stringValue, options, group } : { name, type, value: stringValue, group }
  }

  return null
}

function parseOpenSCADString(rawValue: string) {
  const match = rawValue.match(/^"([^"]*)"$/)
  return match ? match[1] : null
}

function parseOpenSCADRange(rawCustomizer: string | undefined): OpenSCADParameterRange | undefined {
  if (!rawCustomizer) {
    return undefined
  }
  const parts = trimCustomizer(rawCustomizer).split(':').map((part) => Number(part.trim()))
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined
  }
  return { min: parts[0], step: parts[1], max: parts[2] }
}

function parseOpenSCADOptions(rawCustomizer: string | undefined) {
  if (!rawCustomizer) {
    return []
  }
  const body = trimCustomizer(rawCustomizer)
  if (body.includes(':')) {
    return []
  }
  return body
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

function trimCustomizer(rawCustomizer: string) {
  return rawCustomizer.replace(/^\[/, '').replace(/]$/, '').trim()
}
