import type { ModelPreviewProps } from './use-model-preview-scene'
import { formatModelPreviewMeasurementValue, useModelPreviewScene } from './use-model-preview-scene'
import { cn } from '@/lib/utils'

export type { ModelPreviewSnapshotCapture } from './use-model-preview-scene'

export function ModelPreview(props: ModelPreviewProps) {
  const { containerRef, measurement, zoomHUD } = useModelPreviewScene(props)
  const previewAssetCount = props.previewAssets?.length ?? 0
  const variant = props.variant ?? 'workspace'
  const unitLabel = props.unitLabel ?? 'unit'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[#f8fafc]"
      data-model-preview
      data-preview-asset-count={previewAssetCount}
    >
      {variant === 'workspace' ? (
        <div
          aria-hidden={!zoomHUD.visible}
          className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-[#d6dbe3] bg-white/92 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase text-[#475569] shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur transition duration-300 motion-reduce:transition-none ${
            zoomHUD.visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          }`}
        >
          View {zoomHUD.percent}%
        </div>
      ) : null}
      {variant === 'workspace' && measurement ? (
        <div
          aria-label="Measurement summary"
          className={cn(
            'pointer-events-none absolute right-4 top-4 z-20 w-[min(280px,calc(100vw-32px))] rounded-md border border-[#cbd5e1] bg-white/92 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur',
            props.measurementOverlayClassName,
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] font-semibold uppercase text-[#64748b]">Measurement</p>
            <span className="font-mono text-[10px] uppercase text-[#94a3b8]">
              {measurement.modelCount} {measurement.modelCount === 1 ? 'model' : 'models'}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5" key={axis}>
                <dt className="font-mono uppercase text-[#64748b]">{axis}</dt>
                <dd className="mt-1 truncate font-mono text-[#0f172a]">
                  {formatModelPreviewMeasurementValue(measurement.size[axis])}
                  <span className="ml-1 text-[#94a3b8]">{unitLabel}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
