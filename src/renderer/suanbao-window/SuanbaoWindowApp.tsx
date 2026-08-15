import type { SuanbaoBootstrap, SuanbaoPlacement, SuanbaoViewModel } from '@shared/types/suanbao'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { SuanbaoMascot } from '@/components/suanbao/SuanbaoMascot'
import { defaultSuanbaoWindowCopy, getSuanbaoWindowCopy } from './copy'

const DRAG_THRESHOLD_PX = 4
const DRAG_THROTTLE_MS = 50

interface DragState {
  pointerId: number
  startScreenX: number
  startScreenY: number
  placement: SuanbaoPlacement
  moved: boolean
  lastSentAt: number
}

function offlineViewModel(message = defaultSuanbaoWindowCopy.offline): SuanbaoViewModel {
  return {
    revision: 0,
    petState: 'idle',
    bubbleOpen: false,
    message,
    connection: 'offline',
    updatedAt: Date.now(),
  }
}

export function SuanbaoWindowApp() {
  const [bootstrap, setBootstrap] = useState<SuanbaoBootstrap | null>(null)
  const [viewModel, setViewModel] = useState<SuanbaoViewModel>(offlineViewModel())
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const placementRef = useRef<SuanbaoPlacement | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = window.suanbaoAPI.onViewModelChanged((next) => {
      if (!active) return
      setViewModel(next)
      setBubbleOpen(next.bubbleOpen)
    })

    window.suanbaoAPI
      .getBootstrap()
      .then((next) => {
        if (!active) return
        setBootstrap(next)
        setViewModel(next.viewModel)
        setBubbleOpen(next.viewModel.bubbleOpen)
        placementRef.current = next.placement
      })
      .catch(() => {
        if (active) setViewModel(offlineViewModel(defaultSuanbaoWindowCopy.hostUnavailable))
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const updatePlacement = (event: ReactPointerEvent, force = false) => {
    const drag = dragRef.current
    if (!drag || !placementRef.current) return
    const deltaX = event.screenX - drag.startScreenX
    const deltaY = event.screenY - drag.startScreenY
    if (Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) drag.moved = true
    if (!drag.moved) return

    const now = Date.now()
    if (!force && now - drag.lastSentAt < DRAG_THROTTLE_MS) return
    drag.lastSentAt = now
    const nextPlacement: SuanbaoPlacement = {
      ...drag.placement,
      anchor: 'free',
      x: drag.placement.x + deltaX,
      y: drag.placement.y + deltaY,
    }
    placementRef.current = nextPlacement
    void window.suanbaoAPI.updatePlacement(nextPlacement).then((clamped) => {
      placementRef.current = clamped
    })
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const placement = placementRef.current
    if (!placement || placement.locked) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      placement,
      moved: false,
      lastSentAt: 0,
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updatePlacement(event, true)
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.moved) return

    const nextOpen = !bubbleOpen
    setBubbleOpen(nextOpen)
    void window.suanbaoAPI.dispatchCommand({ type: nextOpen ? 'open-bubble' : 'close-bubble' }).catch(() => undefined)
  }

  const copy = getSuanbaoWindowCopy(bootstrap?.language ?? 'zh-Hans')
  return (
    <main
      className={`suanbao-window animation-${bootstrap?.animation ?? 'full'}`}
      onPointerEnter={() => void window.suanbaoAPI.setInteractiveRegion({ interactive: true })}
      onPointerLeave={() => {
        if (!bubbleOpen && !dragRef.current) void window.suanbaoAPI.setInteractiveRegion({ interactive: false })
      }}
    >
      {bubbleOpen && (
        <section className="suanbao-bubble" aria-live="polite">
          {viewModel.operation?.phase === 'awaiting-confirmation' ? (
            <>
              <strong>{viewModel.operation.title}</strong>
              <dl>
                {viewModel.operation.fields?.map((field) => (
                  <div key={`${field.label}-${field.value}`}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="suanbao-bubble-actions">
                <button
                  type="button"
                  onClick={() => {
                    const operationId = viewModel.operation?.operationId
                    if (operationId) void window.suanbaoAPI.cancelOperation(operationId)
                  }}
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const operationId = viewModel.operation?.operationId
                    if (operationId) void window.suanbaoAPI.confirmOperation(operationId)
                  }}
                >
                  {copy.confirm}
                </button>
              </div>
            </>
          ) : (
            <p>{viewModel.message || copy.greeting}</p>
          )}
          <div className="suanbao-bubble-actions">
            <button type="button" onClick={() => void window.suanbaoAPI.openMainWindow()}>
              {copy.openKod}
            </button>
            <button type="button" onClick={() => void window.suanbaoAPI.hide()}>
              {copy.hide}
            </button>
          </div>
        </section>
      )}

      <button
        type="button"
        className={`suanbao-pet state-${viewModel.petState}`}
        aria-label={`${copy.stateLabel}${viewModel.petState}`}
        onPointerDown={handlePointerDown}
        onPointerMove={updatePlacement}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current = null
        }}
      >
        <SuanbaoMascot state={viewModel.petState} />
      </button>

      <span className={`suanbao-status connection-${viewModel.connection}`}>
        {viewModel.connection === 'online' ? copy.online : copy.offlineMode}
      </span>
    </main>
  )
}
