import { useState } from 'react'
import { ChevronDown, Link2, Unlink2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { CADAssemblyConstraintRecord, CADAssemblyOccurrence } from 'src/types/project'

type ProjectAssemblyConstraintsProps = {
  constraints: CADAssemblyConstraintRecord[]
  error?: string
  isPending?: boolean
  occurrences: CADAssemblyOccurrence[]
  onDelete?: (constraintId: string) => void
}

export function ProjectAssemblyConstraints({ constraints, error = '', isPending = false, occurrences, onDelete }: ProjectAssemblyConstraintsProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  if (constraints.length === 0) return null

  const occurrenceNames = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence.name]))

  return (
    <section className="mt-3" data-testid="assembly-constraints">
      <Separator className="mb-3" />
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          render={
            <Button
              aria-label={t('project.assemblyConstraints.summary', { count: constraints.length })}
              className="w-full justify-start"
              size="sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <Link2 data-icon="inline-start" />
          <span className="truncate">{t('project.assemblyConstraints.heading')}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {t('project.assemblyConstraints.count', { count: constraints.length })}
          </span>
          <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} data-icon="inline-end" />
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-2">
          <p className="text-xs leading-5 text-muted-foreground">{t('project.assemblyConstraints.description')}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {constraints.map((constraint) => {
              const driverName = occurrenceNames.get(constraint.first_occurrence_id)
              const followerName = occurrenceNames.get(constraint.second_occurrence_id)
              const relationship = driverName && followerName
                ? constraint.status === 'solved'
                  ? t('project.assemblyConstraints.relationship', { driver: driverName, follower: followerName })
                  : t('project.assemblyConstraints.unresolvedRelationship', { first: driverName, second: followerName })
                : constraint.name

              return (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1.5" key={constraint.id}>
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{relationship}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      <span>{constraint.name}</span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {constraint.status === 'solved'
                          ? t('project.assemblyConstraints.connected')
                          : t('project.assemblyConstraints.needsAttention')}
                      </span>
                    </p>
                  </div>
                  <Button
                    aria-label={t('project.assemblyConstraints.remove', { name: constraint.name })}
                    disabled={isPending || !onDelete}
                    onClick={() => onDelete?.(constraint.id)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Unlink2 />
                  </Button>
                </div>
              )
            })}
          </div>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
