/// <reference types="vite/client" />

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

// Slim Monaco entry points (core editor + selected languages) ship without their own typings.
declare module 'monaco-editor/esm/vs/editor/edcore.main' {
  export * from 'monaco-editor';
}
declare module 'monaco-editor/esm/vs/basic-languages/*';
declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
