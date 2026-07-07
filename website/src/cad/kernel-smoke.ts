import { exportShapeToStep, loadOpenCascade, runStepRoundTripWithKernel } from './opencascade-step'
import { summarizeCadKernelMesh } from './kernel-protocol'

type CadKernelSmokeReport = {
  ok: boolean
  packageName: string
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
  const box = new openCascade.BRepPrimAPI_MakeBox_2(10, 20, 30)
  box.Build(new openCascade.Message_ProgressRange_1())

  try {
    const sourceStepText = exportShapeToStep(openCascade, box.Shape())
    const roundTrip = await runStepRoundTripWithKernel(openCascade, {
      filename: 'litecad-smoke-box.step',
      stepText: sourceStepText,
    })
    const meshSummary = summarizeCadKernelMesh(roundTrip.mesh)

    renderReport({
      ok: true,
      packageName: 'replicad-opencascadejs@0.23.0',
      sourceStepBytes: sourceStepText.length,
      exportedStepBytes: roundTrip.exportedStepText.length,
      ...meshSummary,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
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
