import type {
  CreateEventResult,
  EventFrontmatter,
  EventListItem,
  EventWithMtime,
  Session,
  State,
  TagsRegistry,
  ConflictResult,
} from './types';

export class ConflictError extends Error {
  constructor() {
    super('Conflict: file was modified since last read');
    this.name = 'ConflictError';
  }
}

export class FilenameConflictError extends Error {
  readonly takenFilename: string;
  constructor(filename: string) {
    super(
      `Filename "${filename}" is already in use — the date + first H1 combination must be unique.`,
    );
    this.name = 'FilenameConflictError';
    this.takenFilename = filename;
  }
}

function assertNotConflict<T>(result: T | ConflictResult): asserts result is T {
  if (result !== null && typeof result === 'object' && 'conflict' in result) {
    throw new ConflictError();
  }
}

export const timelinePort = {
  async listEvents(campaignPath: string): Promise<EventListItem[]> {
    return window.fsApi.timelineListEvents(campaignPath);
  },

  async getEvent(campaignPath: string, filename: string): Promise<EventWithMtime> {
    return window.fsApi.timelineGetEvent(campaignPath, filename);
  },

  async createEvent(
    campaignPath: string,
    filename: string,
    frontmatter: EventFrontmatter,
    body: string,
  ): Promise<CreateEventResult> {
    return window.fsApi.timelineCreateEvent(campaignPath, filename, frontmatter, body);
  },

  async updateEvent(
    campaignPath: string,
    filename: string,
    frontmatter: EventFrontmatter,
    body: string,
    ifUnmodifiedSince: string,
    desiredFilename?: string,
  ): Promise<EventWithMtime> {
    const result = await window.fsApi.timelineUpdateEvent(
      campaignPath,
      filename,
      frontmatter,
      body,
      ifUnmodifiedSince,
      desiredFilename,
    );
    if (result !== null && typeof result === 'object' && 'conflict' in result) {
      if (result.reason === 'filename-taken') {
        throw new FilenameConflictError(result.filename);
      }
      throw new ConflictError();
    }
    return result as EventWithMtime;
  },

  async deleteEvent(
    campaignPath: string,
    filename: string,
    ifUnmodifiedSince: string,
  ): Promise<void> {
    const result = await window.fsApi.timelineDeleteEvent(
      campaignPath,
      filename,
      ifUnmodifiedSince,
    );
    assertNotConflict(result);
  },

  async getSessions(campaignPath: string): Promise<Session[]> {
    return window.fsApi.timelineGetSessions(campaignPath);
  },

  async putSessions(campaignPath: string, sessions: Session[]): Promise<void> {
    await window.fsApi.timelinePutSessions(campaignPath, sessions);
  },

  async getState(campaignPath: string): Promise<State> {
    return window.fsApi.timelineGetState(campaignPath);
  },

  async putState(campaignPath: string, state: State): Promise<void> {
    await window.fsApi.timelinePutState(campaignPath, state);
  },

  async getTags(campaignPath: string): Promise<TagsRegistry> {
    return window.fsApi.timelineGetTags(campaignPath);
  },

  async readTemplate(campaignPath: string, name: string): Promise<string | null> {
    return window.fsApi.templateRead(campaignPath, name);
  },
};
