import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import type { Migration } from '../migration.js';
import { appendMigrationLog } from '../migration-log.js';
import { MATTER_OPTS } from '../../matter-opts.js';
import { createCalendar, golarionSpec } from '../../../shared/calendar/index.js';
import type { Session, State } from '../../../renderer/timeline/data/types.js';

const EVENTS_SUBDIR = 'timeline';
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+\.md$/;

const cal = createCalendar(golarionSpec);

function parseEpochSeconds(isoString: string, context: string): number {
  const parsed = cal.tryParse(isoString);
  if (!parsed) {
    throw new Error(`0002-add-epoch-seconds: cannot parse date "${isoString}" in ${context}`);
  }
  return cal.toEpochSeconds(parsed);
}

export const addEpochSecondsMigration: Migration = {
  name: 'Add epoch seconds to events and state',
  targetVersion: 2,
  run: (campaignPath, onProgress) => {
    const eventsDir = path.join(campaignPath, EVENTS_SUBDIR);
    const stateFile = path.join(campaignPath, EVENTS_SUBDIR, 'state.json');
    const sessionsFile = path.join(campaignPath, 'sessions.json');

    // Gather event files
    const eventFiles: string[] = fs.existsSync(eventsDir)
      ? fs.readdirSync(eventsDir).filter((f) => SAFE_FILENAME_RE.test(f))
      : [];

    // Read sessions up front to count total
    const sessions: Session[] = fs.existsSync(sessionsFile)
      ? (JSON.parse(fs.readFileSync(sessionsFile, 'utf-8')) as Session[])
      : [];

    // Total work = events + 1 (state) + sessions
    const total = eventFiles.length + 1 + sessions.length;
    let completed = 0;

    let eventChanges = 0;
    let stateChanged = false;
    let sessionChanges = 0;

    // Process event files
    for (const filename of eventFiles) {
      const filePath = path.join(eventsDir, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw, MATTER_OPTS);

      if (data.epochSeconds === undefined) {
        const dateStr = data.date !== undefined ? String(data.date) : undefined;
        if (!dateStr) {
          throw new Error(`0002-add-epoch-seconds: event file "${filename}" has no "date" field`);
        }

        const epochSeconds = parseEpochSeconds(dateStr, `event file "${filename}"`);
        const newFm = { ...data, epochSeconds };
        const newContent = matter.stringify(content, newFm, MATTER_OPTS);
        fs.writeFileSync(filePath, newContent, 'utf-8');

        appendMigrationLog(campaignPath, '0002-add-epoch-seconds', {
          addEpochSeconds: {
            file: path.join(EVENTS_SUBDIR, filename),
            date: dateStr,
            epochSeconds,
          },
        });

        eventChanges++;
      }

      completed++;
      onProgress(completed, total);
    }

    // Process state.json
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as State;
      const newState = { ...state };
      let modified = false;

      if (newState.in_game_now_seconds === undefined && newState.in_game_now) {
        newState.in_game_now_seconds = parseEpochSeconds(
          newState.in_game_now,
          'state.json in_game_now',
        );
        modified = true;
      }

      if (newState.campaign_start_seconds === undefined && newState.campaign_start) {
        newState.campaign_start_seconds = parseEpochSeconds(
          newState.campaign_start,
          'state.json campaign_start',
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(stateFile, JSON.stringify(newState, null, 2), 'utf-8');
        appendMigrationLog(campaignPath, '0002-add-epoch-seconds', {
          addEpochSecondsToState: {
            in_game_now_seconds: newState.in_game_now_seconds ?? 0,
            campaign_start_seconds: newState.campaign_start_seconds ?? 0,
          },
        });
        stateChanged = true;
      }
    }
    completed++;
    onProgress(completed, total);

    // Process sessions.json
    let sessionsModified = false;
    const newSessions: Session[] = sessions.map((session) => {
      const updated = { ...session };
      let changed = false;

      if (updated.inGameStartSeconds === undefined && updated.inGameStart) {
        updated.inGameStartSeconds = parseEpochSeconds(
          updated.inGameStart,
          `sessions.json session "${session.id}" inGameStart`,
        );
        changed = true;
      }

      if (updated.inGameEndSeconds === undefined && updated.inGameEnd) {
        updated.inGameEndSeconds = parseEpochSeconds(
          updated.inGameEnd,
          `sessions.json session "${session.id}" inGameEnd`,
        );
        changed = true;
      }

      if (changed) {
        sessionChanges++;
        sessionsModified = true;
      }
      return updated;
    });

    if (sessionsModified && fs.existsSync(sessionsFile)) {
      fs.writeFileSync(sessionsFile, JSON.stringify(newSessions, null, 2), 'utf-8');
      appendMigrationLog(campaignPath, '0002-add-epoch-seconds', {
        addEpochSecondsToSessions: { sessionsUpdated: sessionChanges },
      });
    }

    for (const _session of sessions) {
      void _session;
      completed++;
      onProgress(completed, total);
    }

    const hasChanges = eventChanges > 0 || stateChanged || sessionChanges > 0;
    if (!hasChanges) {
      return 'no changes';
    }

    const parts: string[] = [];
    if (eventChanges > 0) {
      parts.push(`${eventChanges} event${eventChanges === 1 ? '' : 's'}`);
    }
    if (stateChanged) parts.push('state');
    if (sessionChanges > 0) {
      parts.push(`${sessionChanges} session${sessionChanges === 1 ? '' : 's'}`);
    }

    return `added epochSeconds to ${parts.join(', ')}`;
  },
};
