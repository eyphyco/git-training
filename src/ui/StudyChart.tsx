// 日別の学習時間グラフ（Recharts）。ホームの初期表示を軽くするため別チャンクで読み込む。
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function StudyChart({ data }: { data: { label: string; minutes: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="studyBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} interval={1} />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} unit="分" width={56} />
        <Tooltip
          cursor={{ fill: 'rgb(148 163 184 / 0.15)' }}
          contentStyle={{ background: 'rgb(255 255 255 / 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgb(255 255 255 / 0.6)', borderRadius: 12, color: '#1e293b' }}
          formatter={(v) => [`${v} 分`, '学習時間']}
        />
        <Bar dataKey="minutes" fill="url(#studyBar)" radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
