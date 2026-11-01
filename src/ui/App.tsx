import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { chapterOf, SCENARIO_UNLOCK, scenarios } from '../lesson/content';
import { isChapterUnlocked, useProgress } from '../store/progress';
import { ChapterPage } from './ChapterPage';
import { CommandsPage } from './CommandsPage';
import { ComparePage } from './ComparePage';
import { ScenariosPage } from './ScenariosPage';
import { StrategyPage } from './StrategyPage';
import { FreePlayPage } from './FreePlayPage';
import { Home } from './Home';
import { LessonPage } from './LessonPage';
import { href, useRoute } from './router';

export function App() {
  const route = useRoute();
  const progress = useProgress();
  const { loaded, load, settings } = progress;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  if (!loaded) return null;

  let page: React.ReactNode;
  if (route.name === 'chapter') page = <ChapterPage id={route.id} />;
  else if (route.name === 'play') page = <FreePlayPage state={route.state} />;
  else if (route.name === 'commands') page = <CommandsPage q={route.q} />;
  else if (route.name === 'compare') page = <ComparePage id={route.id} />;
  else if (route.name === 'strategy') page = <StrategyPage id={route.id} />;
  else if (route.name === 'scenarios') page = <ScenariosPage />;
  else if (route.name === 'lesson') {
    const ch = chapterOf(route.id);
    const scenarioLocked = scenarios.some((s) => s.id === route.id) && progress.lessons[SCENARIO_UNLOCK]?.status !== 'done';
    page = scenarioLocked ? (
      <div className="p-8">
        🔒 実戦シナリオは第5章の章末チャレンジをクリアすると解放されます。<a className="text-sky-600 underline" href={href.home()}>ホームへ</a>
      </div>
    ) : ch && !isChapterUnlocked(progress, ch.id) ? (
        <div className="p-8">
          🔒 第{ch.number}章はまだ解放されていません。<a className="text-sky-600 underline" href={href.home()}>ホームへ</a>
        </div>
      ) : (
        <LessonPage id={route.id} />
      );
  } else page = <Home />;

  return <MotionConfig reducedMotion={settings.animationSpeed === 0 ? 'always' : 'never'}>{page}</MotionConfig>;
}
