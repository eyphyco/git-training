// アニメーション速度の設定（0 = 停止）。アクセシビリティ要件 §8。
import { useProgress } from '../store/progress';

export function useAnim() {
  const speed = useProgress((s) => s.settings.animationSpeed);
  const d = (sec: number) => (speed === 0 ? 0 : sec / speed);
  return { speed, d, move: { duration: d(0.5), ease: 'easeInOut' as const } };
}
