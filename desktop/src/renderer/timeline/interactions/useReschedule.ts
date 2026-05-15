import { useEffect, useRef, type RefObject } from 'react';
import { createReschedule, type RescheduleController, type RescheduleDeps } from './reschedule';
import type { ViewState, ViewportSize } from '../math/zoom';

export type { RescheduleController };

export function useReschedule(
  containerRef: RefObject<HTMLDivElement | null>,
  dragLabelRef: RefObject<HTMLDivElement | null>,
  viewRef: RefObject<ViewState>,
  sizeRef: RefObject<ViewportSize>,
  getEvents: RescheduleDeps['getEvents'],
  saveReschedule: RescheduleDeps['saveReschedule'],
): RescheduleController {
  const innerRef = useRef<RescheduleController>({
    destroy: () => {},
    isActive: () => false,
    wasActivated: () => false,
  });

  // Stable delegate — callers can hold this reference safely across renders.
  const stable = useRef<RescheduleController>({
    destroy: () => innerRef.current.destroy(),
    isActive: () => innerRef.current.isActive(),
    wasActivated: () => innerRef.current.wasActivated(),
  }).current;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reschedule = createReschedule(container, {
      getView: () => viewRef.current,
      getSize: () => sizeRef.current,
      getEvents,
      getDragLabel: () => dragLabelRef.current,
      saveReschedule,
    });
    innerRef.current = reschedule;

    return () => {
      reschedule.destroy();
      innerRef.current = { destroy: () => {}, isActive: () => false, wasActivated: () => false };
    };
    // All refs are stable for the component lifetime.
    // getEvents and saveReschedule must be provided as stable callbacks (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return stable;
}
