declare namespace WechatMinigame {
  interface ShareOption {
    title?: string;
    imageUrl?: string;
    query?: string;
  }

  interface Wx {
    showShareMenu?(opts: { withShareTicket?: boolean; menus?: string[] }): void;
    shareAppMessage?(opts: ShareOption): void;
    shareTimeline?(opts: ShareOption): void;
    onShareAppMessage?(callback: (res?: { from?: string }) => ShareOption): void;
    onShareTimeline?(callback: () => ShareOption): void;
    loadSubpackage?(opts: {
      name: string;
      success?: () => void;
      fail?: (err: unknown) => void;
    }): void;
  }

  interface InnerAudioContext {
    src: string;
    loop: boolean;
    volume: number;
    playbackRate: number;
    play(): void;
    pause(): void;
    stop(): void;
    seek(position: number): void;
    destroy(): void;
    onCanplay(cb: () => void): void;
    onPlay(cb: () => void): void;
    onError(cb: (err: unknown) => void): void;
  }
}
