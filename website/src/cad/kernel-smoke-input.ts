export type CadKernelSmokeInput = { kind: 'generated-box' } | { kind: 'step-url'; url: string }
export type CadKernelSmokeTransport = 'direct' | 'worker'

export function resolveCadKernelSmokeInput(search: string): CadKernelSmokeInput {
  const stepUrl = new URLSearchParams(search).get('stepUrl')?.trim()
  if (stepUrl) {
    return { kind: 'step-url', url: stepUrl }
  }
  return { kind: 'generated-box' }
}

export function resolveCadKernelSmokeTransport(search: string): CadKernelSmokeTransport {
  return new URLSearchParams(search).get('transport') === 'worker' ? 'worker' : 'direct'
}
