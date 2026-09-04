import { describe, expect, it } from 'vitest';
import { findMentionCandidates, isBotMention } from '../src/mentions';

describe('#findMentionCandidates', () => {
  it('finds a simple mention', () => {
    expect(findMentionCandidates('cc @jordan for review')).toEqual(['@jordan']);
  });

  it('finds a hyphenated username', () => {
    expect(findMentionCandidates('thanks @some-user')).toEqual(['@some-user']);
  });

  it('finds a bot mention with its [bot] suffix', () => {
    expect(findMentionCandidates('rerun please @github-actions[bot]')).toEqual([
      '@github-actions[bot]',
    ]);
  });

  it('finds multiple mentions', () => {
    expect(findMentionCandidates('@jordan and @alex-dev, take a look')).toEqual([
      '@jordan',
      '@alex-dev',
    ]);
  });

  it('stops a username at an underscore, since GitHub usernames cannot contain one', () => {
    expect(findMentionCandidates('@alex_dev')).toEqual(['@alex']);
  });

  it('does not match an email address as a mention', () => {
    expect(findMentionCandidates('contact user@example.com')).toEqual([]);
  });

  it('rejects a leading hyphen', () => {
    expect(findMentionCandidates('weird @-user here')).toEqual([]);
  });

  it('rejects a trailing hyphen', () => {
    expect(findMentionCandidates('weird @user- here')).toEqual([]);
  });

  it('rejects consecutive hyphens', () => {
    expect(findMentionCandidates('weird @foo--bar here')).toEqual([]);
  });

  it('rejects a username over 39 characters', () => {
    const tooLong = 'a'.repeat(40);
    expect(findMentionCandidates(`@${tooLong}`)).toEqual([]);
  });

  it('accepts a username at exactly 39 characters', () => {
    const maxLength = 'a'.repeat(39);
    expect(findMentionCandidates(`@${maxLength}`)).toEqual([`@${maxLength}`]);
  });

  it('does not treat an npm scoped package name as a mention', () => {
    expect(findMentionCandidates('bump @vercel/ncc from 0.38.4 to 0.45.0')).toEqual([]);
    expect(
      findMentionCandidates('chore(deps-dev): bump @types/node from 22.20.1 to 26.4.0'),
    ).toEqual([]);
  });

  it('does not treat a GitHub team mention (@org/team) as a user mention', () => {
    expect(findMentionCandidates('cc @some-org/some-team for visibility')).toEqual([]);
  });

  it('still finds a real mention elsewhere in text containing a scoped package name', () => {
    expect(findMentionCandidates('@jordan can you update @vercel/ncc?')).toEqual(['@jordan']);
  });

  it('returns an empty array when there are no mentions', () => {
    expect(findMentionCandidates('no mentions here')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(findMentionCandidates('')).toEqual([]);
  });
});

describe('#isBotMention', () => {
  it('returns true for a [bot]-suffixed mention', () => {
    expect(isBotMention('@dependabot[bot]')).toBe(true);
  });

  it('returns false for a regular mention', () => {
    expect(isBotMention('@jordan')).toBe(false);
  });
});
