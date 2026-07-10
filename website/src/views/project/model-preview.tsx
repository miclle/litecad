import type { ModelPreviewProps } from './use-model-preview-scene'
import { useModelPreviewScene } from './use-model-preview-scene'

export type { ModelPreviewSnapshotCapture } from './use-model-preview-scene'

export function ModelPreview(props: ModelPreviewProps) {
  const { containerRef, zoomHUD } = useModelPreviewScene(props)
  const previewAssetCount = props.previewAssets?.length ?? 0
  const variant = props.variant ?? 'workspace'

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
    </div>
  )
}
