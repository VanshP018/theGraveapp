// Import the editor core + only the languages we ship, not the full `monaco-editor` barrel
// (which pulls in ~80 languages and several MB of JS we never use).
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco runs language services in web workers; Vite needs them wired up explicitly.
// Only JS/TS have a language service. The other languages use syntax highlighting only.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker();
  },
};

export { monaco };

export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
] as const;
