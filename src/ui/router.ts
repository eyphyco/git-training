// hash ルーティング（GitHub Pages でリポジトリ名に依存しないため）。
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'chapter'; id: string } | { name: 'lesson'; id: string } | { name: 'play'; state?: string } | { name: 'commands'; q?: string } | { name: 'compare'; id?: string } | { name: 'strategy'; id?: string } | { name: 'scenarios' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [, kind, id] = path.split('/');
  const params = new URLSearchParams(query);
  if (kind === 'play') return { name: 'play', state: params.get('s') ?? undefined };
  if (kind === 'commands') return { name: 'commands', q: id ? decodeURIComponent(id) : undefined };
  if (kind === 'compare') return { name: 'compare', id };
  if (kind === 'strategy') return { name: 'strategy', id };
  if (kind === 'scenarios') return { name: 'scenarios' };
  if (kind === 'chapter' && id) return { name: 'chapter', id };
  if (kind === 'lesson' && id) return { name: 'lesson', id };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = {
  home: () => '#/',
  chapter: (id: string) => `#/chapter/${id}`,
  lesson: (id: string) => `#/lesson/${id}`,
  play: (state?: string) => (state ? `#/play?s=${state}` : '#/play'),
  strategy: (id?: string) => (id ? `#/strategy/${id}` : '#/strategy'),
  scenarios: () => '#/scenarios',
  compare: (id?: string) => (id ? `#/compare/${id}` : '#/compare'),
  commands: (q?: string) => (q ? `#/commands/${encodeURIComponent(q)}` : '#/commands'),
};
