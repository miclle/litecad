import { exportShapeToStep, loadOpenCascade, runStepRoundTripWithKernel } from './opencascade-step'
import { summarizeCadKernelMesh } from './kernel-protocol'
import { resolveCadKernelSmokeInput, type CadKernelSmokeInput } from './kernel-smoke-input'

type CadKernelSmokeReport = {
  ok: boolean
  packageName: string
  inputKind: CadKernelSmokeInput['kind']
  filename: string
  sourceStepBytes: number
  exportedStepBytes: number
  vertexCount: number
  triangleCount: number
  hasNormals: boolean
  elapsedMs: number
}

declare global {
  interface Window {
    __litecadCadKernelSmoke?: CadKernelSmokeReport | { ok: false; error: string }
  }
}

const statusElement = document.querySelector<HTMLPreElement>('#cad-kernel-smoke-status')
const startedAt = performance.now()

function renderReport(report: CadKernelSmokeReport | { ok: false; error: string }) {
  window.__litecadCadKernelSmoke = report
  if (statusElement) {
    statusElement.dataset.status = report.ok ? 'ok' : 'error'
    statusElement.textContent = JSON.stringify(report, null, 2)
  }
}

async function runSmoke() {
  const openCascade = await loadOpenCascade()
  const input = await loadSmokeStepInput(openCascade, resolveCadKernelSmokeInput(window.location.search))
  const roundTrip = await runStepRoundTripWithKernel(openCascade, {
    filename: input.filename,
    stepText: input.stepText,
  })
  const meshSummary = summarizeCadKernelMesh(roundTrip.mesh)

  renderReport({
    ok: true,
    packageName: 'replicad-opencascadejs@0.23.0',
    inputKind: input.kind,
    filename: input.filename,
    sourceStepBytes: input.stepText.length,
    exportedStepBytes: roundTrip.exportedStepText.length,
    ...meshSummary,
    elapsedMs: Math.round(performance.now() - startedAt),
  })
}

async function loadSmokeStepInput(openCascade: Awaited<ReturnType<typeof loadOpenCascade>>, input: CadKernelSmokeInput) {
  if (input.kind === 'step-url') {
    const response = await fetch(input.url)
    if (!response.ok) {
      throw new Error(`Failed to load STEP smoke fixture: ${response.status} ${response.statusText}`)
    }
    return {
      kind: input.kind,
      filename: input.url.split('/').pop() || 'litecad-smoke.step',
      stepText: await response.text(),
    }
  }

  const box = new openCascade.BRepPrimAPI_MakeBox_2(10, 20, 30)
  box.Build(new openCascade.Message_ProgressRange_1())

  try {
    const sourceStepText = exportShapeToStep(openCascade, box.Shape())
    return {
      kind: input.kind,
      filename: 'litecad-smoke-box.step',
      stepText: sourceStepText,
    }
  } finally {
    box.delete()
  }
}

runSmoke().catch((error: unknown) => {
  renderReport({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  })
})
