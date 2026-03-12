import type { Reqi } from '@pksep/reqi';

export interface JitsiInterface {
  open: boolean;
  user: any | null;

  startCall(
    user: any,
    roomId: string,
    parentNode: HTMLElement,
    token?: string
  ): Promise<any>;
  leaveCall(): void;
  executeCommand(command: string, ...args: any[]): void;
  getCallToken(roomId: string, userId: string): Promise<string | null>;
}

export class Jitsi implements JitsiInterface {
  public open: boolean = false;
  public user: any | null = null;
  private api: any = null; // JitsiMeetExternalAPI instance
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).JitsiMeetExternalAPI) return resolve();

      const script = document.createElement('script');
      script.src = 'https://video.pksep.ru/libs/external_api.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Jitsi script'));
      document.body.appendChild(script);
    });
  }

  public async startCall(
    user: any,
    roomId: string,
    parentNode: HTMLElement,
    token?: string
  ) {
    this.user = user;
    this.open = true;

    await this.loadScript();

    if (this.api) this.api.dispose();

    const domain = 'video.pksep.ru';
    const options = {
      roomName: roomId,
      jwt: token,
      parentNode,
      userInfo: {
        displayName: user?.name || user?.initials || 'User',
        email: user?.email
      },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        prejoinConfig: {
          enabled: false
        },
        skipPrejoin: true,
        toolbarButtons: [],
        disableDeepLinking: true,
        requireDisplayName: false,
        enableWelcomePage: false,
        filmStripOnly: false,
        hiddenPremeetingButtons: [
          'videomute',
          'microphone',
          'select-background',
          'videomute',
          'microphone'
        ],
        readOnlyName: true,
        disableInviteFunctions: true,
        disableJoinLeaveSounds: true,
        doNotFlipLocalVideo: false,
        disableSelfView: false
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        HIDE_INVITE_MORE_HEADER: true,
        MOBILE_APP_PROMO: false,
        TOOLBAR_BUTTONS: [],
        SETTINGS_SECTIONS: [],
        FILM_STRIP_MAX_HEIGHT: 0,
        DISABLE_VIDEO_BACKGROUND: true,
        GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT: false,
        VIDEO_QUALITY_LABEL_DISABLED: true
      }
    };

    this.api = new (window as any).JitsiMeetExternalAPI(domain, options);
    return this.api;
  }

  public leaveCall(): void {
    if (this.api) {
      this.api.dispose();
      this.api = null;
    }
    this.user = null;
    this.open = false;
  }

  public executeCommand(command: string, ...args: any[]): void {
    if (this.api) {
      this.api.executeCommand(command, ...args);
    }
  }

  public async getCallToken(
    roomId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const response = (await this.reqi.get<{ token: string }>(
        `/calls/jitsi-token?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('[Jitsi] Failed to fetch call token:', error);
      return null;
    }
  }
}
