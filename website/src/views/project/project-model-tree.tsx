import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Box, Boxes, Check, ClipboardPaste, Copy, Eye, EyeOff, Folder, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CADAssemblyGroup, CaptureCADSubassemblyPayload, UpdateCADAssemblyGroupPayload, UpdateCADAssemblyOccurrencePayload } from 'src/types/project'
import type { ProjectModelTreeGroup } from './project-preview-assets'

type ProjectModelTreeProps = {
  assemblyGroups?: CADAssemblyGroup[]
  groups: ProjectModelTreeGroup[]
  headerAction?: ReactNode
  hiddenModelIds: ReadonlySet<string>
  isLoading: boolean
  isUploading: boolean
  isOccurrenceMutationPending?: boolean
  isSubassemblyMutationPending?: boolean
  onCaptureSubassembly?: (payload: CaptureCADSubassemblyPayload) => void
  onCreateAssemblyGroup?: (name: string, parentGroupId: string) => void
  onDeleteAssemblyGroup?: (groupId: string) => void
  onDeleteOccurrence?: (occurrenceId: string) => void
  onDuplicateOccurrence?: (occurrenceId: string) => void
  onMoveOccurrence?: (occurrenceId: string, targetIndex: number) => void
  onSelect: (modelId: string, nodeId: string, occurrenceId?: string) => void
  onToggleVisibility: (modelId: string) => void
  onUpdateAssemblyGroup?: (groupId: string, payload: UpdateCADAssemblyGroupPayload) => void
  onUpdateOccurrence?: (occurrenceId: string, payload: UpdateCADAssemblyOccurrencePayload) => void
  occurrenceError?: string
  previewAssetModelIds: ReadonlySet<string>
  selectedNodeId: string
  selectedOccurrenceId?: string
  uploadError: string
}

type AssemblyTreeEntry =
  | {
      type: 'assembly-group'
      assemblyGroup: CADAssemblyGroup
      depth: number
      isEmpty: boolean
    }
  | { type: 'model'; modelGroup: ProjectModelTreeGroup; depth: number }

type OptimisticOccurrenceMove = {
  baseOccurrenceIDs: string[]
  groups: ProjectModelTreeGroup[]
}

function buildAssemblyTreeEntries(assemblyGroups: CADAssemblyGroup[], modelGroups: ProjectModelTreeGroup[]): AssemblyTreeEntry[] {
  const childGroupsByParentID = new Map<string, CADAssemblyGroup[]>()
  const modelGroupsByParentID = new Map<string, ProjectModelTreeGroup[]>()
  for (const group of assemblyGroups) {
    const children = childGroupsByParentID.get(group.parent_group_id) ?? []
    children.push(group)
    childGroupsByParentID.set(group.parent_group_id, children)
  }
  for (const modelGroup of modelGroups) {
    const parentGroupID = modelGroup.parentGroupId ?? ''
    const children = modelGroupsByParentID.get(parentGroupID) ?? []
    children.push(modelGroup)
    modelGroupsByParentID.set(parentGroupID, children)
  }

  const entries: AssemblyTreeEntry[] = []
  const appendChildren = (parentGroupID: string, depth: number) => {
    for (const group of childGroupsByParentID.get(parentGroupID) ?? []) {
      const isEmpty = (childGroupsByParentID.get(group.id)?.length ?? 0) === 0 && (modelGroupsByParentID.get(group.id)?.length ?? 0) === 0
      entries.push({
        type: 'assembly-group',
        assemblyGroup: group,
        depth,
        isEmpty,
      })
      appendChildren(group.id, depth + 1)
    }
    for (const modelGroup of modelGroupsByParentID.get(parentGroupID) ?? []) {
      entries.push({ type: 'model', modelGroup, depth })
    }
  }
  appendChildren('', 0)
  return entries
}

function assemblyGroupOptions(assemblyGroups: CADAssemblyGroup[]) {
  const entries = buildAssemblyTreeEntries(assemblyGroups.filter((group) => !group.subassembly_definition_id), [])
  return entries.flatMap((entry) =>
    entry.type === 'assembly-group'
      ? [
          {
            value: entry.assemblyGroup.id,
            label: `${'> '.repeat(entry.depth)}${entry.assemblyGroup.name}`,
          },
        ]
      : [],
  )
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.matches('input, textarea, select')
}

const siblingCollisionDetection: CollisionDetection = (args) => {
  const parentGroupID = args.active.data.current?.parentGroupID ?? ''
  const siblingArgs = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) => (container.data.current?.parentGroupID ?? '') === parentGroupID,
    ),
  }
  const pointerCollisions = pointerWithin(siblingArgs)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(siblingArgs)
}

type SortableOccurrenceRenderProps = {
  attributes: DraggableAttributes
  isDragging: boolean
  isOver: boolean
  listeners: DraggableSyntheticListeners
  setActivatorNodeRef: (element: HTMLElement | null) => void
}

function SortableOccurrence({
  children,
  disabled,
  id,
  marginLeft,
  parentGroupID,
}: {
  children: (props: SortableOccurrenceRenderProps) => ReactNode
  disabled: boolean
  id: string
  marginLeft?: string
  parentGroupID: string
}) {
  const { attributes, isDragging, isOver, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    attributes: {
      role: 'option',
    },
    data: { parentGroupID },
    disabled,
    id,
  })
  const style: CSSProperties = {
    marginLeft,
    position: isDragging ? 'relative' : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <div className="grid gap-1 motion-reduce:!transition-none" ref={setNodeRef} style={style}>
      {children({ attributes, isDragging, isOver, listeners, setActivatorNodeRef })}
    </div>
  )
}

export function ProjectModelTree({
  assemblyGroups = [],
  groups,
  headerAction,
  hiddenModelIds,
  isLoading,
  isUploading,
  isOccurrenceMutationPending = false,
  isSubassemblyMutationPending = false,
  onCaptureSubassembly,
  onCreateAssemblyGroup,
  onDeleteAssemblyGroup,
  onDeleteOccurrence,
  onDuplicateOccurrence,
  onMoveOccurrence,
  onSelect,
  onToggleVisibility,
  onUpdateAssemblyGroup,
  onUpdateOccurrence,
  occurrenceError = '',
  previewAssetModelIds,
  selectedNodeId,
  selectedOccurrenceId = '',
  uploadError,
}: ProjectModelTreeProps) {
  const { t } = useTranslation()
  const [optimisticMove, setOptimisticMove] = useState<OptimisticOccurrenceMove | null>(null)
  const serverOrderStillAtOptimisticBase = Boolean(
    optimisticMove &&
    optimisticMove.baseOccurrenceIDs.length === groups.length &&
    optimisticMove.baseOccurrenceIDs.every((occurrenceID, index) => occurrenceID === groups[index]?.occurrenceId),
  )
  if (optimisticMove && !serverOrderStillAtOptimisticBase) {
    setOptimisticMove(null)
  }
  const displayedGroups = optimisticMove && serverOrderStillAtOptimisticBase ? optimisticMove.groups : groups
  const assembly = displayedGroups[0]
  const treeEntries = buildAssemblyTreeEntries(assemblyGroups, displayedGroups)
  const groupOptions = assemblyGroupOptions(assemblyGroups)
  const childGroupParentIDs = new Set(assemblyGroups.map((group) => group.parent_group_id).filter(Boolean))
  const ordinaryOccurrenceParentIDs = new Set(
    groups.filter((group) => !group.isSubassemblyMember && group.parentGroupId).map((group) => group.parentGroupId as string),
  )
  const [renamingOccurrenceID, setRenamingOccurrenceID] = useState('')
  const [occurrenceNameDraft, setOccurrenceNameDraft] = useState('')
  const copiedOccurrenceIDRef = useRef('')
  const [copiedOccurrenceID, setCopiedOccurrenceID] = useState('')
  const [activeOccurrenceID, setActiveOccurrenceID] = useState('')
  const [activeOccurrenceSize, setActiveOccurrenceSize] = useState<{ height: number; width: number } | null>(null)
  const [renamingGroupID, setRenamingGroupID] = useState('')
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const selectedOccurrence = groups.find((group) => group.occurrenceId === selectedOccurrenceId)
  const activeOccurrence = groups.find((group) => group.occurrenceId === activeOccurrenceID)
  const activePreviewID = activeOccurrence?.occurrenceId || activeOccurrence?.model.id || ''
  const isActiveOccurrenceHidden = activePreviewID ? hiddenModelIds.has(activePreviewID) : false
  const ActiveVisibilityIcon = isActiveOccurrenceHidden ? EyeOff : Eye
  const activeOccurrenceHasPreviewAsset = activePreviewID ? previewAssetModelIds.has(activePreviewID) : false
  const sortableOccurrenceIDs = treeEntries.flatMap((entry) => {
    if (entry.type !== 'model') return []
    const group = entry.modelGroup
    return group.occurrenceId && !group.isSubassemblyMember && typeof group.occurrenceIndex === 'number' ? [group.occurrenceId] : []
  })
  const canCopySelectedOccurrence = Boolean(selectedOccurrence?.occurrenceId && !selectedOccurrence.isSubassemblyMember)
  const canPasteCopiedOccurrence = Boolean(
    copiedOccurrenceID && groups.some((group) => group.occurrenceId === copiedOccurrenceID && !group.isSubassemblyMember),
  )
  const copyOccurrence = (occurrenceID: string) => {
    copiedOccurrenceIDRef.current = occurrenceID
    setCopiedOccurrenceID(occurrenceID)
  }
  const pasteOccurrence = () => {
    const occurrenceID = copiedOccurrenceIDRef.current
    if (!occurrenceID || isOccurrenceMutationPending) return
    if (!groups.some((group) => group.occurrenceId === occurrenceID && !group.isSubassemblyMember)) return
    onDuplicateOccurrence?.(occurrenceID)
  }
  const commitOccurrenceName = (occurrenceID: string) => {
    const name = occurrenceNameDraft.trim()
    if (name) {
      onUpdateOccurrence?.(occurrenceID, { name })
    }
    setRenamingOccurrenceID('')
  }
  const commitGroupName = (groupID: string) => {
    const name = groupNameDraft.trim()
    if (name) {
      onUpdateAssemblyGroup?.(groupID, { name })
    }
    setRenamingGroupID('')
  }
  const clearOccurrenceDrag = () => {
    setActiveOccurrenceID('')
    setActiveOccurrenceSize(null)
  }
  const startOccurrenceDrag = ({ active, activatorEvent }: DragStartEvent) => {
    const activatorRow =
      activatorEvent.target instanceof Element ? activatorEvent.target.closest<HTMLElement>('[data-occurrence-row]') : null
    const activatorRect = activatorRow?.getBoundingClientRect()
    const sourceRect = activatorRect && activatorRect.width > 0 && activatorRect.height > 0 ? activatorRect : active.rect.current.initial
    setActiveOccurrenceID(String(active.id))
    setActiveOccurrenceSize(sourceRect ? { height: sourceRect.height, width: sourceRect.width } : null)
  }
  const finishOccurrenceDrag = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      clearOccurrenceDrag()
      return
    }

    const source = groups.find((group) => group.occurrenceId === active.id)
    const target = groups.find((group) => group.occurrenceId === over.id)
    if (
      !source?.occurrenceId ||
      !target?.occurrenceId ||
      source.isSubassemblyMember ||
      target.isSubassemblyMember ||
      (source.parentGroupId ?? '') !== (target.parentGroupId ?? '') ||
      typeof target.occurrenceIndex !== 'number'
    ) {
      clearOccurrenceDrag()
      return
    }
    const sourceIndex = groups.findIndex((group) => group.occurrenceId === source.occurrenceId)
    const targetIndex = groups.findIndex((group) => group.occurrenceId === target.occurrenceId)
    if (sourceIndex < 0 || targetIndex < 0) {
      clearOccurrenceDrag()
      return
    }
    setOptimisticMove({
      baseOccurrenceIDs: groups.map((group) => group.occurrenceId),
      groups: arrayMove(groups, sourceIndex, targetIndex),
    })
    clearOccurrenceDrag()
    onMoveOccurrence?.(source.occurrenceId, target.occurrenceIndex)
  }

  useEffect(() => {
    const clearCopiedOccurrence = () => {
      copiedOccurrenceIDRef.current = ''
      setCopiedOccurrenceID('')
    }
    const handleOccurrenceClipboardShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === 'c' && (isEditableShortcutTarget(event.target) || window.getSelection()?.toString())) {
        clearCopiedOccurrence()
        return
      }
      if (isEditableShortcutTarget(event.target)) return

      if (key === 'c' && canCopySelectedOccurrence && selectedOccurrenceId) {
        event.preventDefault()
        copiedOccurrenceIDRef.current = selectedOccurrenceId
        setCopiedOccurrenceID(selectedOccurrenceId)
        return
      }
      if (key === 'v' && copiedOccurrenceIDRef.current && !isOccurrenceMutationPending) {
        const occurrenceID = copiedOccurrenceIDRef.current
        if (!groups.some((group) => group.occurrenceId === occurrenceID && !group.isSubassemblyMember)) return
        event.preventDefault()
        onDuplicateOccurrence?.(occurrenceID)
      }
    }

    window.addEventListener('keydown', handleOccurrenceClipboardShortcut)
    window.addEventListener('copy', clearCopiedOccurrence)
    return () => {
      window.removeEventListener('keydown', handleOccurrenceClipboardShortcut)
      window.removeEventListener('copy', clearCopiedOccurrence)
    }
  }, [canCopySelectedOccurrence, groups, isOccurrenceMutationPending, onDuplicateOccurrence, selectedOccurrenceId])

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.modelTree.heading')}</p>
        {headerAction}
      </div>

      <div aria-label={t('project.modelTree.aria')} className="mt-3 grid gap-2" role="listbox">
        {isLoading ? <div className="px-2 py-2 font-mono text-[11px] uppercase text-[#64748b]">{t('project.modelTree.loading')}</div> : null}
        {!isLoading && groups.length === 0 ? <div className="px-2 py-3 text-sm leading-6 text-[#64748b]">{t('project.modelTree.empty')}</div> : null}
        {assembly?.assemblyId ? (
          <div className="flex min-w-0 items-center gap-2 border-b border-[#e2e8f0] px-2 pb-2 text-sm text-[#0f172a]" data-testid="assembly-root">
            <Boxes className="size-4 shrink-0 text-[#334155]" />
            <span className="min-w-0 flex-1 truncate" title={assembly.assemblyName}>
              {assembly.assemblyName}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">{t('project.sidebar.modelCount', { count: groups.length })}</span>
            <Button
              aria-label={t('project.modelTree.createGroup')}
              disabled={isOccurrenceMutationPending}
              onClick={() =>
                onCreateAssemblyGroup?.(
                  t('project.modelTree.defaultGroupName', {
                    count: assemblyGroups.length + 1,
                  }),
                  '',
                )
              }
              size="icon-xs"
              title={t('project.modelTree.createGroup')}
              type="button"
              variant="ghost"
            >
              <FolderPlus />
            </Button>
          </div>
        ) : null}
        <DndContext
          accessibility={{
            announcements: {
              onDragCancel: ({ active }) =>
                t('project.modelTree.dragCancel', {
                  name: groups.find((group) => group.occurrenceId === active.id)?.displayName ?? String(active.id),
                }),
              onDragEnd: ({ active, over }) =>
                over
                  ? t('project.modelTree.dragEnd', {
                      name: groups.find((group) => group.occurrenceId === active.id)?.displayName ?? String(active.id),
                      target: groups.find((group) => group.occurrenceId === over.id)?.displayName ?? String(over.id),
                    })
                  : t('project.modelTree.dragCancel', {
                      name: groups.find((group) => group.occurrenceId === active.id)?.displayName ?? String(active.id),
                    }),
              onDragOver: ({ active, over }) =>
                over
                  ? t('project.modelTree.dragOver', {
                      name: groups.find((group) => group.occurrenceId === active.id)?.displayName ?? String(active.id),
                      target: groups.find((group) => group.occurrenceId === over.id)?.displayName ?? String(over.id),
                    })
                  : undefined,
              onDragStart: ({ active }) =>
                t('project.modelTree.dragStart', {
                  name: groups.find((group) => group.occurrenceId === active.id)?.displayName ?? String(active.id),
                }),
            },
            screenReaderInstructions: {
              draggable: t('project.modelTree.dragInstructions'),
            },
          }}
          collisionDetection={siblingCollisionDetection}
          modifiers={[restrictToVerticalAxis]}
          onDragCancel={clearOccurrenceDrag}
          onDragEnd={finishOccurrenceDrag}
          onDragStart={startOccurrenceDrag}
          sensors={sensors}
        >
          <SortableContext items={sortableOccurrenceIDs} strategy={verticalListSortingStrategy}>
            {treeEntries.map((entry) => {
          if (entry.type === 'assembly-group') {
            const group = entry.assemblyGroup
            const isSubassemblyInstance = Boolean(group.subassembly_definition_id)
            const canSaveForReuse =
              !isSubassemblyInstance &&
              !childGroupParentIDs.has(group.id) &&
              ordinaryOccurrenceParentIDs.has(group.id) &&
              Boolean(onCaptureSubassembly)
            return (
              <div
                className="group/assembly-row flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-[#334155] hover:bg-[#f1f5f9]"
                data-testid={`assembly-group-${group.id}`}
                key={group.id}
                style={{ marginLeft: `${entry.depth * 16}px` }}
              >
                {isSubassemblyInstance ? (
                  <Boxes className={group.suppressed ? 'size-4 shrink-0 text-[#94a3b8]' : 'size-4 shrink-0 text-[#2563eb]'} />
                ) : (
                  <Folder className={group.suppressed ? 'size-4 shrink-0 text-[#94a3b8]' : 'size-4 shrink-0 text-[#475569]'} />
                )}
                {renamingGroupID === group.id ? (
                  <>
                    <Input
                      aria-label={t('project.modelTree.groupName')}
                      autoFocus
                      className="h-7 min-w-0 flex-1 px-2 text-xs"
                      onChange={(event) => setGroupNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitGroupName(group.id)
                        if (event.key === 'Escape') setRenamingGroupID('')
                      }}
                      value={groupNameDraft}
                    />
                    <Button
                      aria-label={t('project.modelTree.saveGroupName')}
                      onClick={() => commitGroupName(group.id)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Check />
                    </Button>
                    <Button
                      aria-label={t('project.modelTree.cancelGroupName')}
                      onClick={() => setRenamingGroupID('')}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={group.suppressed ? 'min-w-0 flex-1 truncate text-[#94a3b8]' : 'min-w-0 flex-1 truncate'} title={group.name}>
                      {group.name}
                    </span>
                    {isSubassemblyInstance ? (
                      <span className="shrink-0 font-mono text-[9px] uppercase text-[#2563eb]">
                        {t('project.modelTree.reusableRevision', { revision: group.subassembly_definition_revision })}
                      </span>
                    ) : null}
                    {canSaveForReuse ? (
                      <SaveGroupForReusePopover
                        disabled={isSubassemblyMutationPending}
                        group={group}
                        onSave={onCaptureSubassembly}
                      />
                    ) : null}
                    <Button
                      aria-label={t('project.modelTree.createSubgroup', {
                        name: group.name,
                      })}
                      disabled={isSubassemblyInstance || isOccurrenceMutationPending}
                      onClick={() =>
                        onCreateAssemblyGroup?.(
                          t('project.modelTree.defaultSubgroupName', {
                            name: group.name,
                          }),
                          group.id,
                        )
                      }
                      size="icon-xs"
                      title={t('project.modelTree.createSubgroup', {
                        name: group.name,
                      })}
                      type="button"
                      variant="ghost"
                    >
                      <FolderPlus />
                    </Button>
                    <Button
                      aria-label={t('project.modelTree.renameGroup', {
                        name: group.name,
                      })}
                      disabled={isSubassemblyInstance || isOccurrenceMutationPending}
                      onClick={() => {
                        setGroupNameDraft(group.name)
                        setRenamingGroupID(group.id)
                      }}
                      size="icon-xs"
                      title={t('project.modelTree.renameGroup', {
                        name: group.name,
                      })}
                      type="button"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={t(group.suppressed ? 'project.modelTree.unsuppressGroup' : 'project.modelTree.suppressGroup', { name: group.name })}
                      aria-pressed={group.suppressed}
                      disabled={isOccurrenceMutationPending}
                      onClick={() =>
                        onUpdateAssemblyGroup?.(group.id, {
                          suppressed: !group.suppressed,
                        })
                      }
                      size="icon-xs"
                      title={t(group.suppressed ? 'project.modelTree.unsuppressGroup' : 'project.modelTree.suppressGroup', { name: group.name })}
                      type="button"
                      variant="ghost"
                    >
                      {group.suppressed ? <Eye /> : <EyeOff />}
                    </Button>
                    <Button
                      aria-label={t('project.modelTree.deleteGroup', {
                        name: group.name,
                      })}
                      disabled={isSubassemblyInstance || !entry.isEmpty || isOccurrenceMutationPending}
                      onClick={() => onDeleteAssemblyGroup?.(group.id)}
                      size="icon-xs"
                      title={
                        entry.isEmpty
                          ? t('project.modelTree.deleteGroup', {
                              name: group.name,
                            })
                          : isSubassemblyInstance
                            ? t('project.modelTree.reusableGroupLocked')
                            : t('project.modelTree.groupNotEmpty')
                      }
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            )
          }
          const group = entry.modelGroup
          const { model } = group
          const previewID = group.occurrenceId || model.id
          const isModelHidden = hiddenModelIds.has(previewID)
          const isSelectedOccurrence = !group.occurrenceId || selectedOccurrenceId === group.occurrenceId
          const isSelectedSourceNode = isSelectedOccurrence && selectedNodeId === group.sourceNodeId
          const hasPreviewAsset = previewAssetModelIds.has(previewID)
          const VisibilityIcon = isModelHidden ? EyeOff : Eye
          const canDeleteOccurrence = (group.modelOccurrenceCount ?? 1) > 1
          const isSubassemblyMember = Boolean(group.isSubassemblyMember)
          const canDragOccurrence = Boolean(
            group.occurrenceId && !isSubassemblyMember && !isOccurrenceMutationPending && onMoveOccurrence && typeof group.occurrenceIndex === 'number',
          )

          return (
            <SortableOccurrence
              disabled={!canDragOccurrence}
              id={group.occurrenceId || model.id}
              key={group.occurrenceId || model.id}
              marginLeft={assembly?.assemblyId ? `${entry.depth * 16 + 12}px` : undefined}
              parentGroupID={group.parentGroupId ?? ''}
            >
              {({ attributes, isDragging, isOver, listeners, setActivatorNodeRef }) => (
                <>
                  <OccurrenceContextMenu
                    canDelete={canDeleteOccurrence}
                    canPaste={canPasteCopiedOccurrence}
                    disabled={isOccurrenceMutationPending}
                    group={group}
                    onCopy={() => copyOccurrence(group.occurrenceId)}
                    onDelete={() => onDeleteOccurrence?.(group.occurrenceId)}
                    onOpen={() => onSelect(model.id, group.sourceNodeId, group.occurrenceId)}
                    onPaste={pasteOccurrence}
                    onRename={() => {
                      setOccurrenceNameDraft(group.occurrenceName || group.displayName)
                      setRenamingOccurrenceID(group.occurrenceId)
                    }}
                    onToggleSuppressed={() =>
                      onUpdateOccurrence?.(group.occurrenceId, {
                        suppressed: !group.suppressed,
                      })
                    }
                  >
                    <div
                      className={cn(
                        'group/model-row min-w-0 rounded-md px-2 py-1.5 text-sm transition',
                        isOver && !isDragging
                          ? 'bg-accent ring-2 ring-ring/40'
                          : isSelectedSourceNode
                            ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                            : isModelHidden
                              ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                              : 'text-[#1f2937] hover:bg-[#f1f5f9]',
                        isDragging && 'opacity-25',
                      )}
                      data-occurrence-row
                    >
                  <div className="flex min-w-0 items-center gap-2">
                    {hasPreviewAsset ? (
                      <Button
                        aria-label={t(isModelHidden ? 'project.modelTree.show' : 'project.modelTree.hide', { name: group.displayName })}
                        aria-pressed={!isModelHidden}
                        onClick={() => onToggleVisibility(previewID)}
                        size="icon-xs"
                        title={t(isModelHidden ? 'project.modelTree.showModel' : 'project.modelTree.hideModel')}
                        type="button"
                        variant="ghost"
                      >
                        <VisibilityIcon />
                      </Button>
                    ) : null}
                    {renamingOccurrenceID === group.occurrenceId ? (
                      <>
                        <Input
                          aria-label={t('project.modelTree.occurrenceName')}
                          autoFocus
                          className="h-7 min-w-0 flex-1 px-2 text-xs"
                          onBlur={() => commitOccurrenceName(group.occurrenceId)}
                          onChange={(event) => setOccurrenceNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              event.currentTarget.blur()
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              setRenamingOccurrenceID('')
                            }
                          }}
                          value={occurrenceNameDraft}
                        />
                      </>
                    ) : (
                      <button
                        {...attributes}
                        aria-selected={isSelectedSourceNode}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]',
                          canDragOccurrence && 'touch-manipulation cursor-grab active:cursor-grabbing',
                        )}
                        {...listeners}
                        onClick={() => onSelect(model.id, group.sourceNodeId, group.occurrenceId)}
                        ref={setActivatorNodeRef}
                        role="option"
                        title={group.displayName}
                        type="button"
                      >
                        <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                        {group.children.length > 0 ? (
                          <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">
                            {t('project.sidebar.modelCount', {
                              count: group.children.length,
                            })}
                          </span>
                        ) : null}
                      </button>
                    )}
                    <div
                      aria-label={model.parse_status === 'parsed' ? t('project.modelTree.previewReady') : t('project.modelTree.processing')}
                      className={`size-1.5 shrink-0 rounded-full ${model.parse_status === 'parsed' ? 'bg-[#475569]' : 'bg-[#c9a66b]'}`}
                    />
                  </div>
                </div>
              </OccurrenceContextMenu>
              {isSelectedOccurrence && group.occurrenceId && (isSubassemblyMember || assemblyGroups.length > 0) ? (
                <div className="mt-1 grid min-w-0 gap-1 border-t border-[#dbeafe] pt-1">
                  {isSubassemblyMember ? (
                    <p className="px-1 py-1 text-[11px] leading-4 text-[#64748b]">{t('project.modelTree.reusableMemberLocked')}</p>
                  ) : null}
                  {!isSubassemblyMember && assemblyGroups.length > 0 ? (
                    <Select
                      items={[
                        {
                          label: t('project.modelTree.assemblyRoot'),
                          value: '__assembly_root__',
        },
                        ...groupOptions,
                      ]}
                      onValueChange={(value) =>
                        onUpdateOccurrence?.(group.occurrenceId, {
                          parent_group_id: value === '__assembly_root__' || value === null ? '' : value,
                        })
                      }
                      value={group.parentGroupId || '__assembly_root__'}
                    >
                      <SelectTrigger aria-label={t('project.modelTree.assemblyGroup')} className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__assembly_root__">{t('project.modelTree.assemblyRoot')}</SelectItem>
                          {groupOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ) : null}
              {group.children.length > 0 ? (
                <div className="grid gap-1 pl-5">
                  {group.children.map((child) => {
                    const isSelectedChild = isSelectedOccurrence && selectedNodeId === child.id
                    return (
                      <button
                        aria-selected={isSelectedChild}
                        className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8] ${
                          isSelectedChild
                            ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                            : isModelHidden
                              ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                              : 'text-[#334155] hover:bg-[#f1f5f9]'
                        }`}
                        key={child.id}
                        onClick={() => onSelect(child.sourceModelId || model.id, child.id, group.occurrenceId)}
                        role="option"
                        title={child.name}
                        type="button"
                      >
                        <Box className={`size-3.5 shrink-0 ${isSelectedChild ? 'text-[#1d4ed8]' : isModelHidden ? 'text-[#94a3b8]' : 'text-[#64748b]'}`} />
                        <span className="min-w-0 flex-1 truncate">{child.name}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
                </>
              )}
            </SortableOccurrence>
          )
            })}
          </SortableContext>
          {createPortal(
            <DragOverlay>
              {activeOccurrence ? (
                <div
                  className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border border-[#60a5fa] bg-[#eff6ff] px-2 py-1.5 text-sm text-[#0f172a] shadow-lg"
                  style={{ height: activeOccurrenceSize?.height, width: activeOccurrenceSize?.width }}
                >
                  {activeOccurrenceHasPreviewAsset ? (
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-[min(var(--radius-md),10px)]">
                      <ActiveVisibilityIcon className="size-3" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{activeOccurrence.displayName}</span>
                  {activeOccurrence.children.length > 0 ? (
                    <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">
                      {t('project.sidebar.modelCount', {
                        count: activeOccurrence.children.length,
                      })}
                    </span>
                  ) : null}
                  <div
                    aria-label={
                      activeOccurrence.model.parse_status === 'parsed'
                        ? t('project.modelTree.previewReady')
                        : t('project.modelTree.processing')
                    }
                    className={`size-1.5 shrink-0 rounded-full ${activeOccurrence.model.parse_status === 'parsed' ? 'bg-[#475569]' : 'bg-[#c9a66b]'}`}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
        {isUploading ? (
          <div className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-3 font-mono text-[11px] uppercase text-[#475569]">
            {t('project.modelTree.importing')}
          </div>
        ) : null}
        {uploadError ? <p className="text-sm leading-6 text-[#8a2f24]">{uploadError}</p> : null}
        {occurrenceError ? <p className="text-sm leading-6 text-[#8a2f24]">{occurrenceError}</p> : null}
      </div>
    </section>
  )
}

function OccurrenceContextMenu({
  canDelete,
  canPaste,
  children,
  disabled,
  group,
  onCopy,
  onDelete,
  onOpen,
  onPaste,
  onRename,
  onToggleSuppressed,
}: {
  canDelete: boolean
  canPaste: boolean
  children: ReactNode
  disabled: boolean
  group: ProjectModelTreeGroup
  onCopy: () => void
  onDelete: () => void
  onOpen: () => void
  onPaste: () => void
  onRename: () => void
  onToggleSuppressed: () => void
}) {
  const { t } = useTranslation()
  if (!group.occurrenceId || group.isSubassemblyMember) return children

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) onOpen()
      }}
    >
      <ContextMenuTrigger className="min-w-0">{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onClick={onCopy}>
            <Copy />
            {t('project.modelTree.copyOccurrence')}
            <ContextMenuShortcut>Ctrl/Cmd+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={!canPaste || disabled} onClick={onPaste}>
            <ClipboardPaste />
            {t('project.modelTree.pasteOccurrence')}
            <ContextMenuShortcut>Ctrl/Cmd+V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={disabled} onClick={onRename}>
            <Pencil />
            {t('project.modelTree.renameOccurrence')}
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem disabled={disabled} onClick={onToggleSuppressed}>
            {group.suppressed ? <Eye /> : <EyeOff />}
            {t(group.suppressed ? 'project.modelTree.unsuppressOccurrence' : 'project.modelTree.suppressOccurrence')}
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            disabled={!canDelete || disabled}
            onClick={onDelete}
            title={canDelete ? t('project.modelTree.deleteOccurrence') : t('project.modelTree.keepLastOccurrence')}
            variant="destructive"
          >
            <Trash2 />
            {t('project.modelTree.deleteOccurrence')}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SaveGroupForReusePopover({
  disabled,
  group,
  onSave,
}: {
  disabled: boolean
  group: CADAssemblyGroup
  onSave?: (payload: CaptureCADSubassemblyPayload) => void
}) {
  const { t } = useTranslation()
  const nameID = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState(group.name)
  const updateOpen = (nextOpen: boolean) => {
    setIsOpen(nextOpen)
    if (nextOpen) setName(group.name)
  }
  const saveGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName || disabled || !onSave) return
    onSave({ group_id: group.id, name: normalizedName })
    updateOpen(false)
  }

  return (
    <Popover onOpenChange={updateOpen} open={isOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t('project.modelTree.saveGroupForReuse', { name: group.name })}
            className="opacity-0 group-hover/assembly-row:opacity-100 focus-visible:opacity-100"
            disabled={disabled}
            size="icon-xs"
            title={t('project.modelTree.saveGroupForReuse', { name: group.name })}
            type="button"
            variant="ghost"
          />
        }
      >
        <Boxes />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" side="right" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>{t('project.modelTree.saveGroupTitle')}</PopoverTitle>
          <PopoverDescription>{t('project.modelTree.saveGroupDescription')}</PopoverDescription>
        </PopoverHeader>
        <form className="flex flex-col gap-3" onSubmit={saveGroup}>
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor={nameID}>{t('project.modelTree.combinationName')}</FieldLabel>
              <Input id={nameID} onChange={(event) => setName(event.target.value)} value={name} />
            </Field>
          </FieldGroup>
          <Button disabled={!name.trim() || disabled} type="submit">
            <Boxes data-icon="inline-start" />
            {t('project.modelTree.saveCombination')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
