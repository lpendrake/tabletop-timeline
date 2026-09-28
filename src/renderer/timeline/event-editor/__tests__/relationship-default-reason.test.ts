import { describe, it, expect } from 'vitest';
import { emptyBuffer } from '../domain';
import { eventRelationshipDefaultReason } from '../relationship-default-reason';

describe('eventRelationshipDefaultReason', () => {
  it("is the event's current title and follows renames", () => {
    const buf = { ...emptyBuffer(), title: 'Original Title' };
    expect(eventRelationshipDefaultReason(buf)).toBe('Original Title');

    const renamed = { ...buf, title: 'Renamed Title' };
    expect(eventRelationshipDefaultReason(renamed)).toBe('Renamed Title');

    const withH1 = { ...buf, body: '# Body Heading Wins\n\nsome text' };
    expect(eventRelationshipDefaultReason(withH1)).toBe('Body Heading Wins');
  });

  it('falls back to Unspecified when there is no title at all', () => {
    expect(eventRelationshipDefaultReason(emptyBuffer())).toBe('Unspecified');
  });
});
