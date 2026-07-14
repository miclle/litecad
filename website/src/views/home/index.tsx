import { useQuery } from '@tanstack/react-query'
import { Box, BrainCircuit, Cuboid, Database, FileUp, Gauge, Layers3, Orbit, Ruler, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { fetchStudioStatus } from 'src/api/studio'

const pipeline = [
  { label: 'home.pipeline.describe.label', value: 'home.pipeline.describe.value', icon: BrainCircuit },
  { label: 'home.pipeline.import.label', value: 'home.pipeline.import.value', icon: FileUp },
  { label: 'home.pipeline.preview.label', value: 'home.pipeline.preview.value', icon: Orbit },
  { label: 'home.pipeline.measure.label', value: 'home.pipeline.measure.value', icon: Gauge },
]

const features = [
  {
    title: 'home.features.prompt.title',
    body: 'home.features.prompt.body',
    icon: Sparkles,
  },
  {
    title: 'home.features.review.title',
    body: 'home.features.review.body',
    icon: Cuboid,
  },
  {
    title: 'home.features.pipeline.title',
    body: 'home.features.pipeline.body',
    icon: Layers3,
  },
  {
    title: 'home.features.measure.title',
    body: 'home.features.measure.body',
    icon: Ruler,
  },
]

function Home() {
  const { t } = useTranslation()
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
              {t('home.badge')}
            </div>

            <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.04] text-[#171814] sm:text-6xl lg:text-7xl">
              {t('home.title')}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[#55594f] sm:text-lg sm:leading-8">{t('home.body')}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#171814] px-5 text-sm font-semibold text-[#f7f5ef] no-underline transition hover:bg-[#303329]"
                href="/projects"
              >
                <FileUp className="size-4" />
                {t('home.openProjects')}
              </a>
              <a
                className="inline-flex h-12 items-center justify-center rounded-md border border-[#cfc6b2] bg-[#fcfaf3] px-5 text-sm font-semibold text-[#303329] no-underline transition hover:border-[#52625a]"
                href="#features"
              >
                {t('home.exploreFeatures')}
              </a>
            </div>
          </div>

          <div className="grid gap-3 border-y border-[#d9d3c2] py-4 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <p className="font-mono text-2xl text-[#171814]">STEP+</p>
              <p className="mt-1 text-sm text-[#6c6f65]">{t('home.stats.imports')}</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[#171814]">WebGL</p>
              <p className="mt-1 text-sm text-[#6c6f65]">{t('home.stats.review')}</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[#171814]">AI</p>
              <p className="mt-1 text-sm text-[#6c6f65]">{t('home.stats.ai')}</p>
            </div>
          </div>
        </div>

        <div id="demo" className="mt-6 overflow-hidden rounded-md border border-[#d8cfbc] bg-[#fcfaf3]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9d3c2] px-4 py-3">
            <div className="font-mono text-xs uppercase text-[#7a6c52]">{t('home.importStatus')}</div>
            <div className="rounded-sm border border-[#cfc6b2] bg-[#f7f1e4] px-3 py-1.5 font-mono text-xs uppercase text-[#52625a]">
              {statusQuery.data?.status ?? (statusQuery.isLoading ? t('home.syncing') : t('home.offline'))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative min-h-[340px] overflow-hidden bg-[#f1eadb] sm:min-h-[400px] lg:min-h-[440px]">
              <div className="absolute inset-0 bg-[linear-gradient(#ddd4c0_1px,transparent_1px),linear-gradient(90deg,#ddd4c0_1px,transparent_1px)] bg-[size:32px_32px]" />
              <div className="absolute inset-6 border border-dashed border-[#bcb39e]" />
              <div className="absolute left-4 top-4 max-w-sm rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/90 p-4 backdrop-blur">
                <p className="font-mono text-xs uppercase text-[#7a6c52]">{t('home.emptyTitle')}</p>
                <p className="mt-2 text-sm leading-6 text-[#303329]">{t('home.emptyBody')}</p>
              </div>
              <div className="absolute bottom-4 right-4 rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/90 p-4 text-right backdrop-blur">
                <Database className="ml-auto size-5 text-[#52625a]" />
                <p className="mt-3 font-mono text-xs uppercase text-[#7a6c52]">{t('home.currentPhase')}</p>
                <p className="mt-1 text-sm font-semibold text-[#303329]">{t('home.currentPhaseBody')}</p>
              </div>
            </div>

            <aside className="grid gap-4 border-t border-[#d9d3c2] p-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:block lg:border-l lg:border-t-0">
              <p className="font-mono text-xs uppercase text-[#7a6c52]">{t('home.shippedNow')}</p>
              <div className="rounded-md border border-[#d8cfbc] bg-white p-3 text-sm leading-6 text-[#303329] sm:col-span-2 lg:mt-3">
                {t('home.shippedNowBody')}
              </div>

              <p className="font-mono text-xs uppercase text-[#7a6c52] lg:mt-5">{t('home.next')}</p>
              <div className="rounded-md border border-[#d8cfbc] bg-[#f7f1e4] p-3 text-sm leading-6 text-[#303329] sm:col-span-2 lg:mt-3">
                {t('home.nextBody')}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-[#d9d3c2] bg-[#fcfaf3] px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase text-[#7a6c52]">{t('home.productFocus')}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#171814] sm:text-4xl">{t('home.featureTitle')}</h2>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-[#d8cfbc] bg-[#d8cfbc] md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div className="bg-[#fcfaf3] p-5" key={feature.title}>
                  <Icon className="size-5 text-[#52625a]" />
                  <h3 className="mt-5 text-base font-semibold text-[#171814]">{t(feature.title)}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#666a60]">{t(feature.body)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-[1480px] gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-xs uppercase text-[#7a6c52]">{t('home.workflow')}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#171814]">{t('home.workflowTitle')}</h2>
            <p className="mt-4 text-sm leading-6 text-[#666a60]">{t('home.workflowBody')}</p>
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
                  <p className="mt-6 text-sm font-semibold text-[#171814]">{t(item.label)}</p>
                  <p className="mt-2 text-sm leading-6 text-[#6c6f65]">{t(item.value)}</p>
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
