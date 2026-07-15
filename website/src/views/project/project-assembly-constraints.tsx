import { useState } from 'react'
import { Link2, LoaderCircle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CADAssemblyConstraintRecord, CADAssemblyOccurrence, CreateCADAssemblyConstraintPayload } from 'src/types/project'

type ProjectAssemblyConstraintsProps = {
  constraints: CADAssemblyConstraintRecord[]
  error?: string
  isPending?: boolean
  occurrences: CADAssemblyOccurrence[]
  onCreate?: (payload: CreateCADAssemblyConstraintPayload) => void
  onDelete?: (constraintId: string) => void
}

const zeroVector = ['0', '0', '0'] as const

function parseVector(values: readonly string[]): [number, number, number] | null {
  const parsed = values.map((value) => Number(value))
  return parsed.length === 3 && parsed.every(Number.isFinite) ? [parsed[0], parsed[1], parsed[2]] : null
}

export function ProjectAssemblyConstraints({ constraints, error = '', isPending = false, occurrences, onCreate, onDelete }: ProjectAssemblyConstraintsProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(t('project.assemblyConstraints.defaultName', { count: constraints.length + 1 }))
  const [firstOccurrenceID, setFirstOccurrenceID] = useState(occurrences[0]?.id ?? '')
  const [secondOccurrenceID, setSecondOccurrenceID] = useState(occurrences[1]?.id ?? '')
  const [firstAnchor, setFirstAnchor] = useState<readonly string[]>(zeroVector)
  const [secondAnchor, setSecondAnchor] = useState<readonly string[]>(zeroVector)
  const [offset, setOffset] = useState<readonly string[]>(zeroVector)

  const selectedFirstOccurrenceID = occurrences.some((occurrence) => occurrence.id === firstOccurrenceID) ? firstOccurrenceID : (occurrences[0]?.id ?? '')
  const selectedSecondOccurrenceID = occurrences.some((occurrence) => occurrence.id === secondOccurrenceID && occurrence.id !== selectedFirstOccurrenceID)
    ? secondOccurrenceID
    : (occurrences.find((occurrence) => occurrence.id !== selectedFirstOccurrenceID)?.id ?? '')

  const parsedFirstAnchor = parseVector(firstAnchor)
  const parsedSecondAnchor = parseVector(secondAnchor)
  const parsedOffset = parseVector(offset)
  const canCreate =
    occurrences.length >= 2 &&
    name.trim() !== '' &&
    selectedFirstOccurrenceID !== '' &&
    selectedSecondOccurrenceID !== '' &&
    parsedFirstAnchor !== null &&
    parsedSecondAnchor !== null &&
    parsedOffset !== null &&
    !isPending && Boolean(onCreate)

  const updateVector = (values: readonly string[], axis: number, value: string, setter: (next: readonly string[]) => void) => {
    const next = [...values]
    next[axis] = value
    setter(next)
  }

  return (
    <section className="mt-3 border-t border-[#e2e8f0] pt-3" data-testid="assembly-constraints">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.assemblyConstraints.heading')}</p>
        <span className="font-mono text-[10px] text-[#94a3b8]">{t('project.assemblyConstraints.count', { count: constraints.length })}</span>
      </div>

      {occurrences.length >= 2 ? (
        <div className="mt-2 grid gap-2 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-2">
          <Input aria-label={t('project.assemblyConstraints.name')} className="h-8 text-xs" onChange={(event) => setName(event.target.value)} value={name} />
          <div className="grid grid-cols-2 gap-2">
            <Select onValueChange={(value) => setFirstOccurrenceID(value ?? '')} value={selectedFirstOccurrenceID}>
              <SelectTrigger aria-label={t('project.assemblyConstraints.driver')} className="w-full" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{occurrences.map((occurrence) => <SelectItem key={occurrence.id} value={occurrence.id}>{occurrence.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select onValueChange={(value) => setSecondOccurrenceID(value ?? '')} value={selectedSecondOccurrenceID}>
              <SelectTrigger aria-label={t('project.assemblyConstraints.driven')} className="w-full" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{occurrences.map((occurrence) => <SelectItem key={occurrence.id} value={occurrence.id}>{occurrence.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <VectorInputs labelKey="driverAnchor" onChange={(axis, value) => updateVector(firstAnchor, axis, value, setFirstAnchor)} values={firstAnchor} />
          <VectorInputs labelKey="drivenAnchor" onChange={(axis, value) => updateVector(secondAnchor, axis, value, setSecondAnchor)} values={secondAnchor} />
          <VectorInputs labelKey="offset" onChange={(axis, value) => updateVector(offset, axis, value, setOffset)} values={offset} />
          <Button
            aria-label={t('project.assemblyConstraints.create')}
            disabled={!canCreate}
            onClick={() => {
              if (!parsedFirstAnchor || !parsedSecondAnchor || !parsedOffset) return
              onCreate?.({
                name: name.trim(), kind: 'mate', first_occurrence_id: selectedFirstOccurrenceID, second_occurrence_id: selectedSecondOccurrenceID,
                first_anchor: parsedFirstAnchor, second_anchor: parsedSecondAnchor, offset: parsedOffset,
              })
            }}
            size="sm"
            type="button"
          >
            {isPending ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            {t('project.assemblyConstraints.create')}
          </Button>
        </div>
      ) : <p className="mt-2 text-xs leading-5 text-[#64748b]">{t('project.assemblyConstraints.needTwo')}</p>}

      <div className="mt-2 grid gap-1.5">
        {constraints.map((constraint) => (
          <div className="flex items-center gap-2 rounded-md border border-[#e2e8f0] px-2 py-1.5" key={constraint.id}>
            <Link2 className="size-3.5 shrink-0 text-[#2563eb]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[#0f172a]">{constraint.name}</p>
              <p className="font-mono text-[10px] text-[#64748b]">
                {constraint.status === 'solved'
                  ? t('project.assemblyConstraints.solved', { residual: constraint.residual ?? 0 })
                  : t('project.assemblyConstraints.unresolved')}
              </p>
            </div>
            <Button aria-label={t('project.assemblyConstraints.delete', { name: constraint.name })} disabled={isPending || !onDelete} onClick={() => onDelete?.(constraint.id)} size="icon-xs" type="button" variant="ghost"><Trash2 /></Button>
          </div>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </section>
  )
}

function VectorInputs({ labelKey, onChange, values }: { labelKey: 'driverAnchor' | 'drivenAnchor' | 'offset'; onChange: (axis: number, value: string) => void; values: readonly string[] }) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase text-[#64748b]">{t(`project.assemblyConstraints.${labelKey}`)}</p>
      <div className="grid grid-cols-3 gap-1">
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <Input
            aria-label={t(`project.assemblyConstraints.${labelKey}Axis`, { axis })}
            className="h-8 px-2 text-xs"
            key={axis}
            onChange={(event) => onChange(index, event.target.value)}
            step="any"
            type="number"
            value={values[index]}
          />
        ))}
      </div>
    </div>
  )
}
