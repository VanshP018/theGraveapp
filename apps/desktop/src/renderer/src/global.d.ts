interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
}

interface Window {
  tgi: {
    platform: string;
    screen: {
      status(): Promise<string>;
      sources(): Promise<ScreenSource[]>;
      select(id: string | null): Promise<void>;
      openSettings(): Promise<void>;
    };
  };
}
