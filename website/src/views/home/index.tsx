import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, BrainCircuit, FileUp, Gauge, Orbit, Play, SlidersHorizontal } from 'lucide-react'
import * as THREE from 'three'

import { fetchStudioStatus } from 'src/api/studio'

const pipeline = [
  { label: 'Prompt', value: 'constraint brief', icon: BrainCircuit },
  { label: 'Import', value: 'STEP / STL / GLB', icon: FileUp },
  { label: 'Preview', value: 'Three.js viewport', icon: Orbit },
  { label: 'Measure', value: 'dimensions soon', icon: Gauge },
]

const prompts = [
  'A wall mounted modular shelf bracket, 220 mm wide, filleted load ribs, two M6 screw holes.',
  'Compact desktop enclosure for an AI camera, vented back plate, snap-fit lid, 3 mm wall thickness.',
  'Parametric drone arm joint, carbon tube socket, integrated cable channel, printable as one part.',
]

function Home() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const [activePrompt, setActivePrompt] = useState(prompts[0])
  const [detail, setDetail] = useState(68)
  const [showEdges, setShowEdges] = useState(true)
  const statusQuery = useQuery({
    queryKey: ['studio-status'],
    queryFn: async () => (await fetchStudioStatus()).data,
  })

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) {
      return undefined
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f1eadb')

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(4.5, 3.2, 5.6)
    camera.lookAt(0, 0.4, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)

    const group = new THREE.Group()
    scene.add(group)

    const shape = new THREE.Shape()
    shape.moveTo(-1.65, -0.75)
    shape.lineTo(1.1, -0.75)
    shape.quadraticCurveTo(1.75, -0.75, 1.75, -0.1)
    shape.lineTo(1.75, 0.72)
    shape.quadraticCurveTo(1.75, 1.15, 1.31, 1.16)
    shape.lineTo(-1.2, 1.16)
    shape.quadraticCurveTo(-1.72, 1.16, -1.75, 0.62)
    shape.lineTo(-1.75, -0.48)
    shape.quadraticCurveTo(-1.75, -0.75, -1.65, -0.75)

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.72,
      bevelEnabled: true,
      bevelSegments: 8,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      curveSegments: Math.max(16, detail),
    })
    geometry.center()

    const material = new THREE.MeshStandardMaterial({
      color: '#cfd8c0',
      roughness: 0.58,
      metalness: 0.08,
    })
    const body = new THREE.Mesh(geometry, material)
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    const ribMaterial = new THREE.MeshStandardMaterial({ color: '#52625a', roughness: 0.5, metalness: 0.18 })
    for (const x of [-0.82, 0, 0.82]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.72, 0.86), ribMaterial)
      rib.position.set(x, 0.08, 0)
      rib.castShadow = true
      group.add(rib)
    }

    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#25322f', transparent: true, opacity: showEdges ? 0.5 : 0 })
    const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 22), edgeMaterial)
    group.add(edgeLines)

    const grid = new THREE.GridHelper(7, 14, '#9f9a8a', '#ddd4c0')
    grid.position.y = -1.16
    scene.add(grid)

    const hemiLight = new THREE.HemisphereLight('#fff9ec', '#8c927e', 2.2)
    scene.add(hemiLight)

    const keyLight = new THREE.DirectionalLight('#fff2d2', 3.2)
    keyLight.position.set(4, 6, 4)
    keyLight.castShadow = true
    scene.add(keyLight)

    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    resize()

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      group.rotation.y += 0.006
      group.rotation.x = Math.sin(Date.now() / 1400) * 0.04
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      geometry.dispose()
      material.dispose()
      ribMaterial.dispose()
      edgeLines.geometry.dispose()
      edgeMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [detail, showEdges])

  return (
    <div className="min-h-[calc(100vh-56px)]">
      <section className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="order-2 border-b border-[#d9d3c2] bg-[#fcfaf3] p-5 lg:order-1 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 font-mono text-xs uppercase text-[#7a6c52]">
            <Box className="size-4" />
            AI 3D design workspace
          </div>

          <div className="mt-8 space-y-4">
            <h1 className="text-4xl font-semibold leading-tight text-[#171814] sm:text-5xl">
              litecad
            </h1>
            <p className="max-w-[34rem] text-base leading-7 text-[#5f6259]">
              A web-native CAD preview surface for prompt-driven parts, STEP-first imports, and fast browser inspection.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <label className="text-sm font-medium text-[#303329]" htmlFor="design-prompt">
              Design brief
            </label>
            <textarea
              id="design-prompt"
              value={activePrompt}
              onChange={(event) => setActivePrompt(event.target.value)}
              className="min-h-36 w-full resize-none rounded-md border border-[#cfc6b2] bg-white p-4 text-sm leading-6 text-[#171814] outline-none transition focus:border-[#52625a] focus:ring-2 focus:ring-[#52625a]/20"
            />
            <div className="flex flex-wrap gap-2">
              {prompts.map((prompt, index) => (
                <button
                  className="rounded-sm border border-[#cfc6b2] bg-[#f7f1e4] px-3 py-2 text-left text-xs text-[#4d5148] transition hover:border-[#52625a] hover:text-[#171814]"
                  key={prompt}
                  onClick={() => setActivePrompt(prompt)}
                  type="button"
                >
                  v{index + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-4">
            <div className="rounded-md border border-[#d8cfbc] bg-[#f7f1e4] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[#303329]">
                  <SlidersHorizontal className="size-4" />
                  Tessellation
                </div>
                <span className="font-mono text-sm text-[#52625a]">{detail}</span>
              </div>
              <input
                aria-label="Tessellation"
                className="mt-4 w-full accent-[#52625a]"
                max="96"
                min="24"
                onChange={(event) => setDetail(Number(event.target.value))}
                type="range"
                value={detail}
              />
            </div>

            <label className="flex items-center justify-between rounded-md border border-[#d8cfbc] bg-[#f7f1e4] p-4 text-sm font-medium text-[#303329]">
              Edge overlay
              <input
                checked={showEdges}
                className="size-5 accent-[#52625a]"
                onChange={(event) => setShowEdges(event.target.checked)}
                type="checkbox"
              />
            </label>

            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#171814] px-4 text-sm font-semibold text-[#f7f5ef] transition hover:bg-[#303329]"
              type="button"
            >
              <Play className="size-4 fill-current" />
              Generate preview
            </button>
          </div>
        </aside>

        <div className="order-1 flex min-h-[620px] flex-col lg:order-2 lg:min-h-[720px]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9d3c2] px-5 py-4">
            <div>
              <p className="font-mono text-xs uppercase text-[#7a6c52]">Studio status</p>
              <p className="mt-1 text-sm text-[#4d5148]">
                {statusQuery.isLoading
                  ? 'Connecting to litecad API...'
                  : statusQuery.data?.summary ?? 'API status unavailable'}
              </p>
            </div>
            <div className="rounded-sm border border-[#cfc6b2] bg-[#fcfaf3] px-3 py-2 font-mono text-xs uppercase text-[#52625a]">
              {statusQuery.data?.status ?? 'offline'}
            </div>
          </div>

          <div className="relative min-h-[460px] flex-1 overflow-hidden bg-[#f1eadb]">
            <div ref={canvasHostRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute left-5 top-5 max-w-xs rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/86 p-4 backdrop-blur">
              <p className="font-mono text-xs uppercase text-[#7a6c52]">Viewport</p>
              <p className="mt-2 text-sm leading-6 text-[#303329]">
                Live mesh preview with bevels, structural ribs, grid scale, and edge inspection.
              </p>
            </div>
          </div>

          <div className="grid border-t border-[#d9d3c2] bg-[#fcfaf3] md:grid-cols-4">
            {pipeline.map((item) => {
              const Icon = item.icon
              return (
                <div className="border-b border-[#d9d3c2] p-5 md:border-b-0 md:border-r last:md:border-r-0" key={item.label}>
                  <Icon className="size-5 text-[#52625a]" />
                  <p className="mt-4 text-sm font-semibold text-[#171814]">{item.label}</p>
                  <p className="mt-1 text-sm text-[#6c6f65]">{item.value}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
