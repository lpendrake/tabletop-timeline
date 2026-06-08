# `src/shared/calendar/` — Calendar Engine

Pure, IO-free, framework-free TypeScript module shared by the main process and the renderer.
No React, no Electron, no file IO. Functions here must remain side-effect-free.

## Model

Calendars are described as data via `CalendarSpec` — months, weekdays, intercalary days, eras,
and a leap-rule reference are all plain objects. `createCalendar(spec)` turns a spec into a
`Calendar` instance that performs all date arithmetic.

## System calendars

Built-in specs live in `system/` (Golarion and Gregorian). Custom specs are passed at call-site.
`resolveCalendar(id, customSpecs)` is the single lookup entry-point.

## Consumer guidance

Always obtain a `Calendar` via `createCalendar(resolveCalendar(id, customSpecs))`.
Do not import from sub-files directly — use the barrel `index.ts`.
