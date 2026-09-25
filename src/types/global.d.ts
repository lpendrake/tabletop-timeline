export {};

import type {
  CreateEventResult,
  EventFrontmatter,
  EventListItem,
  EventWithMtime,
  Session,
  State,
  TagsRegistry,
  ConflictResult,
} from '../renderer/timeline/data/types';
export type { EntityIndexEntry, EntityIndexDelta } from '../shared/entity-index-entry';
import type { CalendarSpec } from '../shared/calendar';
import type { Ledger, ParsedDirective, TrackLibrary } from '../shared/relationships';
import type { InvalidDirectiveEntry, LedgersAs } from '../main/relationships-store';
import type { AddOptionResult } from '../main/settings/relationship-tracks';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  folderName: string;
  path: string;
}

declare global {
  interface Window {
    fsApi: {
      getRootDir: () => Promise<string | null>;
      setRootDir: (path: string) => Promise<void>;
      scanCampaigns: (rootDir: string) => Promise<Campaign[]>;
      createCampaign: (
        rootDir: string,
        name: string,
        description: string,
      ) => Promise<{ success: boolean; path?: string; error?: string }>;
      openCampaign: (
        path: string,
      ) => Promise<
        | { success: true; entityIndex: EntityIndexEntry[]; messages: string[] }
        | { success: false; error: string }
      >;
      closeCampaign: () => Promise<void>;

      // File System
      mkdir: (path: string) => Promise<boolean>;
      readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
      read: (path: string) => Promise<string | null>;
      write: (path: string, content: string) => Promise<boolean>;
      writeNew: (
        path: string,
        content: string,
      ) => Promise<{ ok: true } | { ok: false; reason: 'exists' | 'error'; message?: string }>;
      writeBuffer: (path: string, buffer: Uint8Array) => Promise<boolean>;
      delete: (path: string) => Promise<boolean>;
      trash: (path: string) => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      showItemInFolder: (path: string) => Promise<boolean>;
      rename: (oldPath: string, newPath: string) => Promise<boolean>;

      // Notes
      buildIndex: (campaignPath: string) => Promise<EntityIndexEntry[]>;
      ensureDirs: (notesDir: string) => Promise<boolean>;
      getEntityIndex: () => Promise<EntityIndexEntry[]>;
      updateEntityLabelOverride: (
        id: string,
        target: 'tagLabel' | 'linkLabel',
        value: string | null,
      ) => Promise<boolean>;

      // Watcher
      onFileChange: (callback: (data: { event: string; path: string }) => void) => () => void;
      onEntityDelta: (callback: (delta: EntityIndexDelta) => void) => () => void;

      // Dialog
      selectDirectory: () => Promise<string | null>;
      selectFile: () => Promise<string | null>;

      // Timeline
      timelineListEvents: (campaignPath: string) => Promise<EventListItem[]>;
      timelineGetEvent: (campaignPath: string, filename: string) => Promise<EventWithMtime>;
      timelineCreateEvent: (
        campaignPath: string,
        filename: string,
        frontmatter: EventFrontmatter,
        body: string,
      ) => Promise<CreateEventResult>;
      timelineUpdateEvent: (
        campaignPath: string,
        filename: string,
        frontmatter: EventFrontmatter,
        body: string,
        ifUnmodifiedSince: string,
        desiredFilename?: string,
      ) => Promise<EventWithMtime | ConflictResult>;
      timelineDeleteEvent: (
        campaignPath: string,
        filename: string,
        ifUnmodifiedSince: string,
      ) => Promise<{ ok: true } | ConflictResult>;
      timelineGetSessions: (campaignPath: string) => Promise<Session[]>;
      timelinePutSessions: (campaignPath: string, sessions: Session[]) => Promise<{ ok: true }>;
      timelineGetState: (campaignPath: string) => Promise<State>;
      timelinePutState: (campaignPath: string, state: State) => Promise<{ ok: true }>;
      timelineGetTags: (campaignPath: string) => Promise<TagsRegistry>;

      // Templates
      templateRead: (campaignPath: string, name: string) => Promise<string | null>;

      // App
      getAppVersion: () => Promise<string>;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (
        callback: (info: { version: string; releaseNotes: string }) => void,
      ) => () => void;
      onUpdateDownloaded: (callback: () => void) => () => void;

      // Campaign Loading
      onLoadProgress: (
        callback: (data: { percentage: number; taskName: string }) => void,
      ) => () => void;
      onLoadComplete: (callback: () => void) => () => void;
      onLoadError: (callback: (data: { message: string }) => void) => () => void;

      // Theme Settings
      getWorkspaceDefaultTheme: (rootDir: string) => Promise<string | null>;
      setWorkspaceDefaultTheme: (rootDir: string, themeId: string) => Promise<void>;
      getCampaignTheme: (campaignPath: string) => Promise<string | null>;
      setCampaignTheme: (campaignPath: string, themeId: string | null) => Promise<void>;
      getCampaignThemeOverrides: (campaignPaths: string[]) => Promise<Record<string, string>>;

      // Default View Settings
      getCampaignDefaultView: (campaignPath: string) => Promise<string | null>;
      setCampaignDefaultView: (campaignPath: string, view: string | null) => Promise<void>;

      // Calendar Settings
      getCampaignCalendarId: () => Promise<string | null>;
      setCampaignCalendarId: (calendarId: string | null) => Promise<void>;
      listCustomCalendars: (rootDir: string) => Promise<CalendarSpec[]>;
      saveCustomCalendar: (rootDir: string, spec: CalendarSpec) => Promise<void>;
      deleteCustomCalendar: (rootDir: string, id: string) => Promise<void>;
      listSystemCalendars: () => Promise<CalendarSpec[]>;

      // Relationships
      getRelationshipLedgers: (entityId: string, as: LedgersAs) => Promise<Ledger[]>;
      getAllRelationshipLedgers: () => Promise<Ledger[]>;
      getRelationshipTracks: () => Promise<TrackLibrary>;
      addRelationshipOption: (
        trackId: string,
        input: { label: string; mutual: boolean },
      ) => Promise<AddOptionResult>;
      getInvalidRelationshipDirectives: () => Promise<InvalidDirectiveEntry[]>;
      getRelationshipDirectives: (
        paths: string[],
      ) => Promise<Array<{ path: string; title?: string; directives: ParsedDirective[] }>>;
      getDefaultReputationHolder: () => Promise<string | null>;
      setDefaultReputationHolder: (id: string | null) => Promise<void>;
      onRelationshipsChanged: (callback: (data: { paths: string[] }) => void) => () => void;
    };
  }
}
