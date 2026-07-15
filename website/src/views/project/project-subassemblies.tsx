import { useState } from 'react'
import { Boxes, LoaderCircle, PackagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type {
  CADAssemblyGroup,
  CADAssemblyOccurrence,
  CADSubassemblyDefinitionRevision,
  CaptureCADSubassemblyPayload,
  InstantiateCADSubassemblyPayload,
} from 'src/types/project'

type ProjectSubassembliesProps = {
  definitions: CADSubassemblyDefinitionRevision[]
  error?: string
  groups: CADAssemblyGroup[]
  isPending?: boolean
  occurrences: CADAssemblyOccurrence[]
  onCapture?: (payload: CaptureCADSubassemblyPayload) => void
  onInstantiate?: (definitionID: string, payload: InstantiateCADSubassemblyPayload) => void
}

const zeroTranslation = ['0', '0', '0'] as const

export function ProjectSubassemblies({
  definitions,
  error = '',
  groups,
  isPending = false,
  occurrences,
  onCapture,
  onInstantiate,
}: ProjectSubassembliesProps) {
  const { t } = useTranslation()
  const [captureGroupID, setCaptureGroupID] = useState('')
  const [definitionName, setDefinitionName] = useState('')
  const [definitionID, setDefinitionID] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [translation, setTranslation] = useState<readonly string[]>(zeroTranslation)

  const childGroupParentIDs = new Set(groups.map((group) => group.parent_group_id).filter(Boolean))
  const eligibleGroups = groups.filter(
    (group) =>
      !group.subassembly_definition_id &&
      !childGroupParentIDs.has(group.id) &&
      occurrences.some((occurrence) => occurrence.parent_group_id === group.id && !occurrence.subassembly_member_id),
  )
  const selectedCaptureGroupID = eligibleGroups.some((group) => group.id === captureGroupID) ? captureGroupID : (eligibleGroups[0]?.id ?? '')
  const selectedDefinitionID = definitions.some((definition) => definition.id === definitionID) ? definitionID : (definitions[0]?.id ?? '')
  const parsedTranslation = translation.map(Number)
  const hasValidTranslation = translation.length === 3 && translation.every((value) => value.trim() !== '' && Number.isFinite(Number(value)))
  const canCapture = Boolean(selectedCaptureGroupID && definitionName.trim() && onCapture && !isPending)
  const canInstantiate = Boolean(selectedDefinitionID && instanceName.trim() && hasValidTranslation && onInstantiate && !isPending)

  const updateTranslation = (axis: number, value: string) => {
    const next = [...translation]
    next[axis] = value
    setTranslation(next)
  }

  return (
    <section className="mt-3 border-t border-[#e2e8f0] pt-3" data-testid="project-subassemblies">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.subassemblies.heading')}</p>
        <span className="font-mono text-[10px] text-[#94a3b8]">{t('project.subassemblies.count', { count: definitions.length })}</span>
      </div>

      <div className="mt-2 grid gap-2 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-2">
        {eligibleGroups.length > 0 ? (
          <Select
            items={eligibleGroups.map((group) => ({ label: group.name, value: group.id }))}
            onValueChange={(value) => setCaptureGroupID(value ?? '')}
            value={selectedCaptureGroupID}
          >
            <SelectTrigger aria-label={t('project.subassemblies.sourceGroup')} className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eligibleGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs leading-5 text-[#64748b]">{t('project.subassemblies.noEligibleGroup')}</p>
        )}
        <Input
          aria-label={t('project.subassemblies.definitionName')}
          className="h-8 text-xs"
          onChange={(event) => setDefinitionName(event.target.value)}
          placeholder={t('project.subassemblies.definitionName')}
          value={definitionName}
        />
        <Button
          aria-label={t('project.subassemblies.capture')}
          disabled={!canCapture}
          onClick={() => onCapture?.({ group_id: selectedCaptureGroupID, name: definitionName.trim() })}
          size="sm"
          type="button"
          variant="outline"
        >
          {isPending ? <LoaderCircle className="animate-spin" /> : <Boxes />}
          {t('project.subassemblies.capture')}
        </Button>
      </div>

      {definitions.length > 0 ? (
        <div className="mt-2 grid gap-2 rounded-md border border-[#e2e8f0] bg-white p-2">
          <Select
            items={definitions.map((definition) => ({ label: definition.name, value: definition.id }))}
            onValueChange={(value) => setDefinitionID(value ?? '')}
            value={selectedDefinitionID}
          >
            <SelectTrigger aria-label={t('project.subassemblies.definition')} className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {definitions.map((definition) => (
                <SelectItem key={`${definition.id}:${definition.revision}`} value={definition.id}>
                  {definition.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t('project.subassemblies.instanceName')}
            className="h-8 text-xs"
            onChange={(event) => setInstanceName(event.target.value)}
            placeholder={t('project.subassemblies.instanceName')}
            value={instanceName}
          />
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase text-[#64748b]">{t('project.subassemblies.position')}</p>
            <div className="grid grid-cols-3 gap-1">
              {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                <Input
                  aria-label={t('project.subassemblies.positionAxis', { axis })}
                  className="h-8 px-2 text-xs"
                  key={axis}
                  onChange={(event) => updateTranslation(index, event.target.value)}
                  step="any"
                  type="number"
                  value={translation[index]}
                />
              ))}
            </div>
          </div>
          <Button
            aria-label={t('project.subassemblies.instantiate')}
            disabled={!canInstantiate}
            onClick={() => {
              if (!hasValidTranslation) return
              onInstantiate?.(selectedDefinitionID, {
                name: instanceName.trim(),
                parent_group_id: '',
                translation: parsedTranslation as [number, number, number],
              })
            }}
            size="sm"
            type="button"
          >
            {isPending ? <LoaderCircle className="animate-spin" /> : <PackagePlus />}
            {t('project.subassemblies.instantiate')}
          </Button>
        </div>
      ) : null}

      <div className="mt-2 grid gap-1.5">
        {definitions.map((definition) => (
          <div className="flex items-center gap-2 rounded-md border border-[#e2e8f0] px-2 py-1.5" key={`${definition.id}:${definition.revision}`}>
            <Boxes className="size-3.5 shrink-0 text-[#2563eb]" />
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#0f172a]">
              {t('project.subassemblies.summary', {
                count: definition.members.length,
                name: definition.name,
                revision: definition.revision,
              })}
            </p>
          </div>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </section>
  )
}
