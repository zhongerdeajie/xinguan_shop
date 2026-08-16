import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🍜</div>
        <h1 className="serif text-2xl font-semibold mb-2" style={{ color: 'var(--accent)' }}>
          页面走丢了
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          您找的页面不存在或已下架，不如回首页看看？
        </p>
        <Link href="/" className="pill pill-accent !h-12 !px-8 inline-block">
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}
