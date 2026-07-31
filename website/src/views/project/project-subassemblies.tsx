import { useId, useState, type FormEvent } from 'react'
import { Boxes, ChevronDown, Copy, LoaderCircle, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CADSubassemblyDefinitionRevision, InstantiateCADSubassemblyPayload } from 'src/types/project'

type ProjectSubassembliesProps = {
  definitions: CADSubassemblyDefinitionRevision[]
  isPending?: boolean
  onInstantiate?: (definitionID: string, payload: InstantiateCADSubassemblyPayload) => void | Promise<void>
}

const zeroTranslation = ['0', '0', '0'] as const

export function ProjectSubassemblies({
  definitions,
  isPending = false,
  onInstantiate,
}: ProjectSubassembliesProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  if (definitions.length === 0) {
    return null
  }

  return (
    <section className="mt-3 border-t border-border pt-2" data-testid="project-subassemblies">
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          render={
            <Button
              aria-label={t('project.subassemblies.toggle', { count: definitions.length })}
              className="w-full justify-between"
              size="sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <Boxes data-icon="inline-start" />
            <span className="truncate">{t('project.subassemblies.heading')}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
            <span className="font-mono text-[10px]">{definitions.length}</span>
            <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} data-icon="inline-end" />
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent className="grid gap-1 pt-1">
          {definitions.map((definition) => (
            <SavedCombinationRow
              definition={definition}
              isPending={isPending}
              key={`${definition.id}:${definition.revision}`}
              onInstantiate={onInstantiate}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

function SavedCombinationRow({
  definition,
  isPending,
  onInstantiate,
}: {
  definition: CADSubassemblyDefinitionRevision
  isPending: boolean
  onInstantiate?: (definitionID: string, payload: InstantiateCADSubassemblyPayload) => void | Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 truncate text-xs font-medium">
        {t('project.subassemblies.summary', {
          count: definition.members.length,
          name: definition.name,
        })}
      </p>
      <InsertCombinationPopover
        definition={definition}
        isPending={isPending}
        onInstantiate={onInstantiate}
      />
    </div>
  )
}

function InsertCombinationPopover({
  definition,
  isPending,
  onInstantiate,
}: {
  definition: CADSubassemblyDefinitionRevision
  isPending: boolean
  onInstantiate?: (definitionID: string, payload: InstantiateCADSubassemblyPayload) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const copyNameID = useId()
  const defaultCopyName = t('project.subassemblies.copyName', { name: definition.name })
  const [copyName, setCopyName] = useState(defaultCopyName)
  const [isOpen, setIsOpen] = useState(false)
  const [isPositionOpen, setIsPositionOpen] = useState(false)
  const [translation, setTranslation] = useState<readonly string[]>(zeroTranslation)
  const parsedTranslation = translation.map(Number)
  const hasValidTranslation = translation.length === 3 && translation.every((value) => value.trim() !== '' && Number.isFinite(Number(value)))
  const canInsert = Boolean(copyName.trim() && hasValidTranslation && onInstantiate && !isPending)

  const updateTranslation = (axis: number, value: string) => {
    setTranslation((current) => current.map((entry, index) => (index === axis ? value : entry)))
  }
  const resetDraft = () => {
    setCopyName(defaultCopyName)
    setIsPositionOpen(false)
    setTranslation(zeroTranslation)
  }
  const updateOpen = (nextOpen: boolean) => {
    setIsOpen(nextOpen)
    if (nextOpen) setCopyName(defaultCopyName)
    if (!nextOpen) resetDraft()
  }
  const insertCopy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canInsert) return
    try {
      await onInstantiate?.(definition.id, {
        name: copyName.trim(),
        parent_group_id: '',
        translation: parsedTranslation as [number, number, number],
      })
      updateOpen(false)
    } catch {
      // The command controller owns the localized error; keep this draft ready to retry.
    }
  }

  return (
    <Popover onOpenChange={updateOpen} open={isOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t('project.subassemblies.insertNamed', { name: definition.name })}
            disabled={!onInstantiate || isPending}
            size="sm"
            title={t('project.subassemblies.insertNamed', { name: definition.name })}
            type="button"
            variant="ghost"
          />
        }
      >
        <Copy data-icon="inline-start" />
        {t('project.subassemblies.insert')}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" side="right" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>{t('project.subassemblies.insertTitle', { name: definition.name })}</PopoverTitle>
          <PopoverDescription>{t('project.subassemblies.insertDescription')}</PopoverDescription>
        </PopoverHeader>

        <form className="flex flex-col gap-3" onSubmit={insertCopy}>
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor={copyNameID}>{t('project.subassemblies.copyNameLabel')}</FieldLabel>
              <Input
                id={copyNameID}
                onChange={(event) => setCopyName(event.target.value)}
                value={copyName}
              />
            </Field>
          </FieldGroup>

          <Collapsible onOpenChange={setIsPositionOpen} open={isPositionOpen}>
            <CollapsibleTrigger
              render={<Button className="w-full justify-between" size="sm" type="button" variant="ghost" />}
            >
              <span className="flex items-center gap-2">
                <MapPin data-icon="inline-start" />
                {t('project.subassemblies.positionOptional')}
              </span>
              <ChevronDown className={cn('transition-transform', isPositionOpen && 'rotate-180')} data-icon="inline-end" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <FieldGroup className="grid grid-cols-3 gap-2">
                {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                  <Field key={axis}>
                    <FieldLabel htmlFor={`${copyNameID}-${axis}`}>{axis}</FieldLabel>
                    <Input
                      aria-label={t('project.subassemblies.positionAxis', { axis })}
                      id={`${copyNameID}-${axis}`}
                      onChange={(event) => updateTranslation(index, event.target.value)}
                      step="any"
                      type="number"
                      value={translation[index]}
                    />
                  </Field>
                ))}
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>

          <Button disabled={!canInsert} type="submit">
            {isPending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {t('project.subassemblies.insert')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
