import { describe, expect, test } from 'bun:test';
import { parseGroupCallInviteUrl } from '../src/utils/groupCallInviteUrl';

const inviteQuery = 'callRoom=livekit-room&callInvite=signed-invite';

describe('group call invite URL', () => {
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
});
