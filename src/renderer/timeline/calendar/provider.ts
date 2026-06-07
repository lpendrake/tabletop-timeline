import {
  createCalendar,
  golarionSpec,
  resolveCalendar,
  type Calendar,
  type CalendarSpec,
} from '../../../shared/calendar';

let activeCalendar: Calendar | null = null;

export const CalendarProvider = {
  init(calendar: Calendar): void {
    activeCalendar = calendar;
  },

  get(): Calendar {
    if (activeCalendar === null) {
      activeCalendar = createCalendar(golarionSpec);
    }
    return activeCalendar;
  },

  initFromId(id: string, customSpecs?: CalendarSpec[]): void {
    CalendarProvider.init(createCalendar(resolveCalendar(id, customSpecs)));
  },

  /** Reset to uninitialised state. For use in tests only. */
  _reset(): void {
    activeCalendar = null;
  },
};
