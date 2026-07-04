import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, BrainCircuit, Cuboid, FileUp, Gauge, Layers3, Orbit, Play, Ruler, Sparkles } from 'lucide-react'
import * as THREE from 'three'

import { fetchStudioStatus } from 'src/api/studio'

const pipeline = [
  { label: 'Describe', value: 'Turn design intent into structured geometry briefs.', icon: BrainCircuit },
  { label: 'Preview', value: 'Inspect the first mesh in a browser-native viewport.', icon: Orbit },
  { label: 'Import', value: 'Prepare for STEP, STL, and GLB review workflows.', icon: FileUp },
  { label: 'Measure', value: 'Keep dimensions and manufacturing checks close to the model.', icon: Gauge },
]

const prompts = [
  'A wall mounted modular shelf bracket, 220 mm wide, filleted load ribs, two M6 screw holes.',
  'Compact desktop enclosure for an AI camera, vented back plate, snap-fit lid, 3 mm wall thickness.',
  'Parametric drone arm joint, carbon tube socket, integrated cable channel, printable as one part.',
]

const features = [
  {
    title: 'Prompt-first CAD exploration',
    body: 'Capture intent, constraints, and dimensions before the model becomes expensive to change.',
    icon: Sparkles,
  },
  {
    title: 'Web-native 3D review',
    body: 'Open the preview anywhere, rotate the shape, and discuss geometry without desktop CAD setup.',
    icon: Cuboid,
  },
  {
    title: 'STEP-oriented pipeline',
    body: 'Designed around real mechanical exchange formats instead of stopping at decorative meshes.',
    icon: Layers3,
  },
  {
    title: 'Measurement-ready workflow',
    body: 'Build toward sections, dimensions, and manufacturability checks as first-class review tools.',
    icon: Ruler,
  },
]

function Home() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const [activePrompt, setActivePrompt] = useState(0)
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
      curveSegments: 68,
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
  }, [showEdges])

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#f7f5ef]">
      <section className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div className="max-w-5xl">
            <div className="inline-flex items-center gap-2 border border-[#cfc6b2] bg-[#fcfaf3] px-3 py-2 font-mono text-xs uppercase text-[#7a6c52]">
              <Box className="size-4" />
              AI 3D design preview
            </div>

            <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.04] text-[#171814] sm:text-6xl lg:text-7xl">
              AI-native CAD ideas, previewed in the browser.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[#55594f] sm:text-lg sm:leading-8">
              litecad is a web product for turning early mechanical ideas into visible 3D direction: describe the part,
              inspect a preview, and prepare the workflow for real CAD exchange formats.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#171814] px-5 text-sm font-semibold text-[#f7f5ef] no-underline transition hover:bg-[#303329]"
                href="#demo"
              >
                <Play className="size-4 fill-current" />
                View demo
              </a>
              <a
                className="inline-flex h-12 items-center justify-center rounded-md border border-[#cfc6b2] bg-[#fcfaf3] px-5 text-sm font-semibold text-[#303329] no-underline transition hover:border-[#52625a]"
                href="#features"
              >
                Explore features
              </a>
            </div>
          </div>

          <div className="grid gap-3 border-y border-[#d9d3c2] py-4 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <p className="font-mono text-2xl text-[#171814]">STEP</p>
              <p className="mt-1 text-sm text-[#6c6f65]">exchange-first direction</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[#171814]">WebGL</p>
              <p className="mt-1 text-sm text-[#6c6f65]">instant visual review</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[#171814]">AI</p>
              <p className="mt-1 text-sm text-[#6c6f65]">prompt iteration loop</p>
            </div>
          </div>
        </div>

        <div id="demo" className="mt-6 overflow-hidden rounded-md border border-[#d8cfbc] bg-[#fcfaf3]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9d3c2] px-4 py-3">
            <div className="font-mono text-xs uppercase text-[#7a6c52]">Live demo preview</div>
            <div className="rounded-sm border border-[#cfc6b2] bg-[#f7f1e4] px-3 py-1.5 font-mono text-xs uppercase text-[#52625a]">
              {statusQuery.data?.status ?? (statusQuery.isLoading ? 'syncing' : 'offline')}
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative min-h-[340px] overflow-hidden bg-[#f1eadb] sm:min-h-[400px] lg:min-h-[440px]">
              <div ref={canvasHostRef} className="absolute inset-0" />
              <div className="pointer-events-none absolute left-4 top-4 max-w-xs rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/88 p-4 backdrop-blur">
                <p className="font-mono text-xs uppercase text-[#7a6c52]">Generated concept</p>
                <p className="mt-2 text-sm leading-6 text-[#303329]">
                  A bracket-like mechanical preview with bevels, ribs, grid scale, and optional edge overlay.
                </p>
              </div>
            </div>

            <aside className="grid gap-4 border-t border-[#d9d3c2] p-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:block lg:border-l lg:border-t-0">
              <p className="font-mono text-xs uppercase text-[#7a6c52]">Sample prompt</p>
              <p className="min-h-24 rounded-md border border-[#d8cfbc] bg-white p-3 text-sm leading-6 text-[#303329] sm:col-span-2 lg:mt-3 lg:min-h-28">
                {prompts[activePrompt]}
              </p>

              <div className="flex gap-2 lg:mt-3">
                {prompts.map((prompt, index) => (
                  <button
                    aria-label={`Show prompt ${index + 1}`}
                    className={`size-9 rounded-sm border text-sm transition ${
                      activePrompt === index
                        ? 'border-[#52625a] bg-[#52625a] text-white'
                        : 'border-[#cfc6b2] bg-[#f7f1e4] text-[#4d5148] hover:border-[#52625a]'
                    }`}
                    key={prompt}
                    onClick={() => setActivePrompt(index)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                ))}
              </div>

              <label className="flex min-w-44 items-center justify-between rounded-md border border-[#d8cfbc] bg-[#f7f1e4] p-3 text-sm font-medium text-[#303329] lg:mt-5">
                Edge overlay
                <input
                  checked={showEdges}
                  className="size-5 accent-[#52625a]"
                  onChange={(event) => setShowEdges(event.target.checked)}
                  type="checkbox"
                />
              </label>
            </aside>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-[#d9d3c2] bg-[#fcfaf3] px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase text-[#7a6c52]">Product focus</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#171814] sm:text-4xl">
              A lightweight path from idea to inspectable 3D.
            </h2>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-[#d8cfbc] bg-[#d8cfbc] md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div className="bg-[#fcfaf3] p-5" key={feature.title}>
                  <Icon className="size-5 text-[#52625a]" />
                  <h3 className="mt-5 text-base font-semibold text-[#171814]">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#666a60]">{feature.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-[1480px] gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-xs uppercase text-[#7a6c52]">Workflow</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#171814]">Built for the first product loop.</h2>
            <p className="mt-4 text-sm leading-6 text-[#666a60]">
              The homepage demo shows the intended product rhythm: describe, preview, import, and measure.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-md border border-[#d8cfbc] bg-[#d8cfbc] md:grid-cols-4">
            {pipeline.map((item, index) => {
              const Icon = item.icon
              return (
                <div className="bg-[#fcfaf3] p-5" key={item.label}>
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-[#52625a]" />
                    <span className="font-mono text-xs text-[#9b8c6f]">0{index + 1}</span>
                  </div>
                  <p className="mt-6 text-sm font-semibold text-[#171814]">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-[#6c6f65]">{item.value}</p>
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
