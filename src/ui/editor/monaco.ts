// Monaco をバンドルに同梱する（@monaco-editor/react の既定は CDN 読み込みで、外部通信なしの方針に反するため）。
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/css/register';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export { monaco };

export function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return { md: 'markdown', js: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', html: 'html', css: 'css' }[ext ?? ''] ?? 'plaintext';
}
