export interface EventFrontmatter {
  title: string;
  date: string;
  epochSeconds?: number;
  tags?: string[];
  color?: string;
  status?: 'happened' | 'planned';
  id?: string;
  tagLabelOverride?: string;
  linkLabelOverride?: string;
}

export interface Event extends EventFrontmatter {
  filename: string;
  body: string;
  mtime: string;
}

export interface EventListItem extends EventFrontmatter {
  filename: string;
  mtime: string;
}

export interface State {
  in_game_now: string;
  campaign_start: string;
  in_game_now_seconds?: number;
  campaign_start_seconds?: number;
}

export interface TagInfo {
  color: string;
  description: string;
}

export type TagsRegistry = Record<string, TagInfo>;

export interface Session {
  id: string;
  inGameStart: string;
  inGameEnd: string;
  inGameStartSeconds?: number;
  inGameEndSeconds?: number;
  realStart: string;
  realEnd: string;
  color: string;
  real_date?: string;
  in_game_start?: string;
  notes?: string;
}

export type ConflictResult =
  | { conflict: true; reason?: undefined } // mtime conflict (existing behaviour)
  | { conflict: true; reason: 'filename-taken'; filename: string }; // desired filename already exists

export interface EventWithMtime {
  event: Event;
  lastModified: string;
}

export type CreateEventResult =
  | { ok: true; event: EventWithMtime }
  | { ok: false; reason: 'duplicate' };
