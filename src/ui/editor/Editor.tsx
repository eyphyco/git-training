// 簡易エディタ（F-05）。保存（Ctrl+S / ボタン）したときだけワークツリーに反映し、コンフリクト箇所を色付けする。
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import type { RepoState } from '../../engine/model/types';
import { useProgress } from '../../store/progress';
import { languageOf, monaco } from './monaco';

type Props = { repo: RepoState; path: string | null; onSelect(path: string | null): void; onSave(path: string, content: string | null): void };

/** <<<<<<< 〜 >>>>>>> の各部分の行範囲 */
export function conflictRanges(text: string) {
  const out: { start: number; end: number; kind: 'ours' | 'theirs' | 'marker' }[] = [];
  let mode: 'ours' | 'theirs' | null = null;
  text.split('\n').forEach((line, i) => {
    const n = i + 1;
    if (line.startsWith('<<<<<<<')) {
      out.push({ start: n, end: n, kind: 'marker' });
      mode = 'ours';
    } else if (line.startsWith('=======') && mode) {
      out.push({ start: n, end: n, kind: 'marker' });
      mode = 'theirs';
    } else if (line.startsWith('>>>>>>>') && mode) {
      out.push({ start: n, end: n, kind: 'marker' });
      mode = null;
    } else if (mode) out.push({ start: n, end: n, kind: mode });
  });
  return out;
}

export default function Editor({ repo, path, onSelect, onSave }: Props) {
  const theme = useProgress((s) => s.settings.theme);
  const files = Object.keys(repo.workingTree).sort();
  const saved = path !== null ? repo.workingTree[path] : undefined;
  const [draft, setDraft] = useState(saved ?? '');
  const [newName, setNewName] = useState('');
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const dirty = path !== null && saved !== undefined && draft !== saved;

  useEffect(() => setDraft(saved ?? ''), [path, saved]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const cls = { ours: 'conflict-ours', theirs: 'conflict-theirs', marker: 'conflict-marker' };
    const ds = conflictRanges(draft).map((r) => ({ range: new monaco.Range(r.start, 1, r.end, 1), options: { isWholeLine: true, className: cls[r.kind] } }));
    decorations.current?.clear();
    decorations.current = ed.createDecorationsCollection(ds);
  }, [draft]);

  const save = () => path !== null && onSave(path, draft);
  const saveRef = useRef(save);
  saveRef.current = save;

  const create = () => {
    const name = newName.trim().replace(/^\.\//, '');
    if (!name) return;
    if (!(name in repo.workingTree)) onSave(name, '');
    onSelect(name);
    setNewName('');
  };

  return (
    <div className="flex h-full min-h-0">
      <style>{`.conflict-ours{background:rgba(34,197,94,.18)}.conflict-theirs{background:rgba(59,130,246,.18)}.conflict-marker{background:rgba(234,88,12,.3)}`}</style>
      <aside className="flex w-40 shrink-0 flex-col border-r border-slate-200 text-xs dark:border-slate-800">
        <ul className="flex-1 overflow-y-auto">
          {files.map((f) => (
            <li key={f}>
              <button type="button" onClick={() => onSelect(f)} className={`block w-full truncate px-2 py-1 text-left font-mono ${f === path ? 'bg-sky-100 font-bold dark:bg-sky-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {f}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-1 border-t border-slate-200 p-1 dark:border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新しいファイル名" className="min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-1 dark:border-slate-700" />
          <button type="submit" className="rounded bg-slate-700 px-1.5 text-white">＋</button>
        </form>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {path !== null && saved !== undefined ? (
          <>
            <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-xs dark:border-slate-800">
              <span className="font-mono font-bold">{path}</span>
              {dirty && <span className="text-amber-600">● 未保存</span>}
              <span className="ml-auto" />
              <button type="button" onClick={() => confirm(`${path} を削除しますか？（ワークツリーから消えます）`) && (onSave(path, null), onSelect(null))} className="rounded border border-rose-400 px-2 py-0.5 text-rose-600">
                削除
              </button>
              <button type="button" onClick={save} disabled={!dirty} className="rounded bg-sky-600 px-2 py-0.5 text-white disabled:opacity-40" data-testid="editor-save">
                保存（Ctrl+S）
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <MonacoEditor
                path={path}
                value={draft}
                language={languageOf(path)}
                theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                onChange={(v) => setDraft(v ?? '')}
                onMount={(ed) => {
                  editorRef.current = ed;
                  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
                  setDraft((d) => d);
                }}
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4 text-sm text-slate-500">左の一覧からファイルを選ぶか、新しいファイル名を入力して＋で作成します。保存するとワークツリーに反映されます。</div>
        )}
      </div>
    </div>
  );
}
