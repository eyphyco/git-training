// 新しい版が公開されたときのお知らせ。押すまで切り替えないので、レッスンの途中で画面が読み直されない。
import { applyUpdate, dismissUpdate, useUpdateAvailable } from '../pwa';

export function UpdateBanner() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div role="status" data-testid="update-banner" className="glass fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-2xl px-4 py-2.5 text-sm">
      <span>✨ 新しい版があります（進捗はそのまま引き継がれます）</span>
      <button type="button" className="btn-primary px-3 py-1" onClick={applyUpdate}>
        更新
      </button>
      <button type="button" className="glass-btn px-2 py-1" aria-label="あとで" onClick={dismissUpdate}>
        あとで
      </button>
    </div>
  );
}
