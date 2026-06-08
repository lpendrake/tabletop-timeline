import { ipcMain } from 'electron';
import { getCampaignPath } from './campaign-state.js';
import { getCampaignCalendar, setCampaignCalendar } from './settings/calendar-settings.js';
import {
  listCustomCalendars,
  saveCustomCalendar,
  deleteCustomCalendar,
} from './settings/custom-calendars.js';
import { SYSTEM_CALENDARS } from '../shared/calendar/index.js';
import type { CalendarSpec } from '../shared/calendar/index.js';

export function registerCalendarIpcHandlers(): void {
  ipcMain.handle('calendar:getCampaignId', () => {
    const campaignPath = getCampaignPath();
    if (!campaignPath) return null;
    return getCampaignCalendar(campaignPath);
  });

  ipcMain.handle('calendar:setCampaignId', (_event, calendarId: string | null) => {
    const campaignPath = getCampaignPath();
    if (!campaignPath) return;
    setCampaignCalendar(campaignPath, calendarId);
  });

  ipcMain.handle('calendar:listCustom', (_event, rootDir: string) => listCustomCalendars(rootDir));

  ipcMain.handle('calendar:saveCustom', (_event, rootDir: string, spec: CalendarSpec) =>
    saveCustomCalendar(rootDir, spec),
  );

  ipcMain.handle('calendar:deleteCustom', (_event, rootDir: string, id: string) =>
    deleteCustomCalendar(rootDir, id),
  );

  ipcMain.handle('calendar:listSystem', () => SYSTEM_CALENDARS);
}
