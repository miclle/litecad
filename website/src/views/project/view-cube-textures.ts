import * as THREE from 'three'

export function createCanvasLabelTexture({
  background,
  color,
  fontSize,
  height = 128,
  label,
  width = 256,
}: {
  background?: string
  color: string
  fontSize: number
  height?: number
  label: string
  width?: number
}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, width, height)
    if (background) {
      context.fillStyle = background
      context.fillRect(0, 0, width, height)
    }
    context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineWidth = 4
    context.strokeStyle = 'rgba(17,19,16,0.42)'
    context.fillStyle = color
    context.strokeText(label, width / 2, height / 2 + 3)
    context.fillText(label, width / 2, height / 2 + 3)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createViewCubeFaceTexture({ background, color, label }: { background: number; color: string; label: string }) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = `#${background.toString(16).padStart(6, '0')}`
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = 12
    context.strokeStyle = 'rgba(245, 240, 226, 0.42)'
    context.fillStyle = color

    let fontSize = 150
    const maxTextWidth = canvas.width * 0.82
    do {
      context.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      fontSize -= 2
    } while (context.measureText(label).width > maxTextWidth && fontSize > 56)

    context.strokeText(label, canvas.width / 2, canvas.height / 2 + 10)
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 10)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
