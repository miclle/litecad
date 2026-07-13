import { useQuery } from '@tanstack/react-query'
import { Box, BrainCircuit, Cuboid, Database, FileUp, Gauge, Layers3, Orbit, Ruler, Sparkles } from 'lucide-react'

import { fetchStudioStatus } from 'src/api/studio'

const pipeline = [
  { label: 'Describe', value: 'Turn design intent into structured geometry briefs.', icon: BrainCircuit },
  { label: 'Import', value: 'Attach real STEP, GLTF, GLB, or STL source files to project records.', icon: FileUp },
  { label: 'Preview', value: 'Convert imported geometry into browser-native review data.', icon: Orbit },
  { label: 'Measure', value: 'Keep dimensions and manufacturing checks close to the model.', icon: Gauge },
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
    body: 'Designed around real mechanical exchange formats and project-owned preview assets instead of decorative mock geometry.',
    icon: Layers3,
  },
  {
    title: 'Measurement-ready workflow',
    body: 'Build toward sections, dimensions, and manufacturability checks as first-class review tools.',
    icon: Ruler,
  },
]

function Home() {
  const statusQuery = useQuery({
    queryKey: ['studio-status'],
    queryFn: async () => (await fetchStudioStatus()).data,
  })

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
                href="/projects"
              >
                <FileUp className="size-4" />
                Open projects
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
              <p className="font-mono text-2xl text-[#171814]">STEP+</p>
              <p className="mt-1 text-sm text-[#6c6f65]">exchange-first imports</p>
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
            <div className="font-mono text-xs uppercase text-[#7a6c52]">Import pipeline status</div>
            <div className="rounded-sm border border-[#cfc6b2] bg-[#f7f1e4] px-3 py-1.5 font-mono text-xs uppercase text-[#52625a]">
              {statusQuery.data?.status ?? (statusQuery.isLoading ? 'syncing' : 'offline')}
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative min-h-[340px] overflow-hidden bg-[#f1eadb] sm:min-h-[400px] lg:min-h-[440px]">
              <div className="absolute inset-0 bg-[linear-gradient(#ddd4c0_1px,transparent_1px),linear-gradient(90deg,#ddd4c0_1px,transparent_1px)] bg-[size:32px_32px]" />
              <div className="absolute inset-6 border border-dashed border-[#bcb39e]" />
              <div className="absolute left-4 top-4 max-w-sm rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/90 p-4 backdrop-blur">
                <p className="font-mono text-xs uppercase text-[#7a6c52]">Empty by default</p>
                <p className="mt-2 text-sm leading-6 text-[#303329]">
                  The workbench starts from uploaded project-owned CAD sources instead of generated demo geometry.
                </p>
              </div>
              <div className="absolute bottom-4 right-4 rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/90 p-4 text-right backdrop-blur">
                <Database className="ml-auto size-5 text-[#52625a]" />
                <p className="mt-3 font-mono text-xs uppercase text-[#7a6c52]">Current phase</p>
                <p className="mt-1 text-sm font-semibold text-[#303329]">Multi-format source preview</p>
              </div>
            </div>

            <aside className="grid gap-4 border-t border-[#d9d3c2] p-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:block lg:border-l lg:border-t-0">
              <p className="font-mono text-xs uppercase text-[#7a6c52]">Shipped now</p>
              <div className="rounded-md border border-[#d8cfbc] bg-white p-3 text-sm leading-6 text-[#303329] sm:col-span-2 lg:mt-3">
                Signed-in projects can store STEP, GLTF, GLB, and STL sources, parse lightweight metadata, and load real preview assets.
              </div>

              <p className="font-mono text-xs uppercase text-[#7a6c52] lg:mt-5">Next</p>
              <div className="rounded-md border border-[#d8cfbc] bg-[#f7f1e4] p-3 text-sm leading-6 text-[#303329] sm:col-span-2 lg:mt-3">
                Durable geometry state, saved measurement/section records, export history, and full CAD feature semantics remain tracked in TODO.
              </div>
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
              The first loop is intentionally narrow: create a project, upload a real CAD source, then build preview and geometry services from that stored asset.
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
