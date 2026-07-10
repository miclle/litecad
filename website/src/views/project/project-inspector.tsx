import { Box } from 'lucide-react'

import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { CADTranslation } from './cad-document-transforms'

export type TransformDraft = Record<keyof CADTranslation, string>
export type InspectorDetail = { label: string; value: string | number }

export type ProjectInspectorSelection = {
  deleteError: string
  details: InspectorDetail[]
  name: string
  nodeId: string
  stepExportError: string
  stepExportStatus: string
  transformDraft: TransformDraft
  transformError: string
}

type ProjectInspectorProps = {
  documentDetails: InspectorDetail[]
  modelCount: number
  onTransformChange: (nodeId: string, axis: keyof CADTranslation, value: string) => void
  selected?: ProjectInspectorSelection
  unitLabel: string
}

function PositionField({
  ariaLabel,
  axis,
  onChange,
  value,
}: {
  ariaLabel: string
  axis: keyof CADTranslation
  onChange: (value: string) => void
  value: string
}) {
  return (
    <Field className="relative gap-1">
      <FieldLabel className="font-mono text-[9px] uppercase text-[#64748b]">{axis}</FieldLabel>
      <Input
        aria-label={ariaLabel}
        className="h-7 rounded-md border-[#d6dbe3] bg-white px-1.5 font-mono text-[11px] tabular-nums text-[#0f172a] shadow-none focus-visible:border-[#94a3b8] focus-visible:ring-1 focus-visible:ring-[#cbd5e1]"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={value}
      />
    </Field>
  )
}

function DetailList({ details }: { details: InspectorDetail[] }) {
  return (
    <dl className="mt-2 grid gap-1.5 text-xs">
      {details.map((detail) => (
        <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] py-1.5 last:border-b-0" key={detail.label}>
          <dt className="text-[#64748b]">{detail.label}</dt>
          <dd className="truncate text-[#1f2937]">{detail.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ProjectInspector({
  documentDetails,
  modelCount,
  onTransformChange,
  selected,
  unitLabel,
}: ProjectInspectorProps) {
  return (
    <section className="mt-auto pt-5">
      <p className="font-mono text-[11px] uppercase text-[#64748b]">Document</p>
      {selected ? (
        <div className="mt-2 grid gap-2 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Box className="size-4 shrink-0 text-[#1d4ed8]" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0f172a]" title={selected.name}>
                {selected.name}
              </p>
            </div>
            <DetailList details={selected.details} />
          </div>

          <div className="border-t border-[#e2e8f0] pt-2.5">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className="text-xs font-medium text-[#334155]">Position</p>
              <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">{unitLabel}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 pb-2 pt-1.5">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <PositionField
                  ariaLabel={`${axis.toUpperCase()} position for ${selected.name}`}
                  axis={axis}
                  key={axis}
                  onChange={(value) => onTransformChange(selected.nodeId, axis, value)}
                  value={selected.transformDraft[axis]}
                />
              ))}
            </div>
            {selected.transformError ? <p className="mt-2 text-[11px] leading-4 text-[#8a2f24]">{selected.transformError}</p> : null}
          </div>

          {selected.stepExportError ? <p className="text-[11px] leading-4 text-[#8a2f24]">{selected.stepExportError}</p> : null}
          {selected.deleteError ? <p className="text-[11px] leading-4 text-[#8a2f24]">{selected.deleteError}</p> : null}
          {selected.stepExportStatus ? <p className="text-[11px] leading-4 text-[#3f6212]">{selected.stepExportStatus}</p> : null}
        </div>
      ) : (
        <>
          <DetailList details={documentDetails} />
          {modelCount > 0 ? <div className="pt-2 text-[11px] leading-4 text-[#64748b]">Select a model to inspect placement and features.</div> : null}
        </>
      )}
    </section>
  )
}
