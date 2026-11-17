import { describe, expect, test } from 'bun:test';
import {
  buildGroupCallInviteAuthorizationUrl,
  buildPublicGroupCallInviteUrl,
  buildDesktopGroupCallInviteUrl,
  parseDesktopGroupCallInviteUrl,
  parseGroupCallInviteUrl
} from '../src/utils/groupCallInviteUrl';

const inviteQuery = 'callRoom=livekit-room&callInvite=signed-invite';

describe('group call invite URL', () => {
  test('shares a production URL regardless of the native webview origin', () => {
    const publicUrl = buildPublicGroupCallInviteUrl({
      roomId: 'room & 1',
      inviteToken: 'signed+token/=',
      organization: 'https://org.pksep.ru'
    });
    expect(new URL(publicUrl).origin).toBe('https://chat.pksep.ru');
    const desktopUrl = buildDesktopGroupCallInviteUrl(publicUrl);
    expect(desktopUrl).toStartWith('sepchat://invite?');
    expect(parseDesktopGroupCallInviteUrl(desktopUrl!)).toBe(publicUrl);
    expect(new URL(publicUrl).searchParams.get('callInvite')).toBe(
      'signed+token/='
    );
  });

  test('does not interpret unrelated protocols and call actions as invitations', () => {
    for (const url of [
      `https://chat.pksep.ru/?${inviteQuery}`,
      `sepchat://call?${inviteQuery}`,
      `sepchat://invite/other?${inviteQuery}`,
      `sepchat://user@invite?${inviteQuery}`,
      `sepchat://invite:123?${inviteQuery}`,
      'sepchat://invite?callRoom=only-room',
      'javascript:alert(1)'
    ])
      expect(parseDesktopGroupCallInviteUrl(url)).toBeNull();
  });

  test('accepts an invite from the current web origin', () => {
    expect(
      parseGroupCallInviteUrl(`https://chat.pksep.ru/?${inviteQuery}`, {
        currentOrigin: 'https://chat.pksep.ru'
      })
    ).toEqual({
      inviteToken: 'signed-invite',
      organization: null,
      roomId: 'livekit-room'
    });
  });

  test('accepts the production web link inside the native client', () => {
    expect(
      parseGroupCallInviteUrl(`https://chat.pksep.ru/?${inviteQuery}`, {
        allowTrustedNativeOrigin: true,
        currentOrigin: 'https://localhost'
      })
    ).toMatchObject({
      inviteToken: 'signed-invite',
      roomId: 'livekit-room'
    });
  });

  test('accepts the trusted production link for an explicit in-chat click', () => {
    expect(
      parseGroupCallInviteUrl(`https://chat.pksep.ru/?${inviteQuery}`, {
        allowTrustedOrigin: true,
        currentOrigin: 'http://localhost:5173'
      })
    ).toEqual({
      inviteToken: 'signed-invite',
      organization: null,
      roomId: 'livekit-room'
    });
  });

  test('keeps external origins blocked in a regular web client', () => {
    expect(
      parseGroupCallInviteUrl(`https://chat.pksep.ru/?${inviteQuery}`, {
        allowTrustedNativeOrigin: false,
        currentOrigin: 'https://localhost'
      })
    ).toBeNull();
  });

  test('does not trust hosts that only resemble the production domain', () => {
    expect(
      parseGroupCallInviteUrl(
        `https://chat.pksep.ru.example.com/?${inviteQuery}`,
        {
          allowTrustedNativeOrigin: true,
          currentOrigin: 'https://localhost'
        }
      )
    ).toBeNull();
  });

  test('keeps a valid invite while redirecting an expired session to authorization', () => {
    expect(
      buildGroupCallInviteAuthorizationUrl(
        `https://chat.pksep.ru/dialogs/topic-id?${inviteQuery}&organization=${encodeURIComponent('http://localhost:5001')}&token=expired`
      )
    ).toBe(
      `https://chat.pksep.ru/?callRoom=livekit-room&callInvite=signed-invite&organization=${encodeURIComponent('http://localhost:5001')}`
    );
  });

  test('does not keep unrelated query parameters on an authorization redirect', () => {
    expect(
      buildGroupCallInviteAuthorizationUrl(
        'https://chat.pksep.ru/dialogs/topic-id?token=expired&next=external'
      )
    ).toBe('https://chat.pksep.ru/');
  });
});
