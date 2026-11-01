// hash ルーティング（GitHub Pages でリポジトリ名に依存しないため）。
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'chapter'; id: string } | { name: 'lesson'; id: string };

export function parseHash(hash: string): Route {
  const [, kind, id] = hash.replace(/^#/, '').split('/');
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
};
