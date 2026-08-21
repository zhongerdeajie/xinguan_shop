'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_GROUPS = [
  {
    label: '总览',
    items: [
      { href: '/dashboard', label: '仪表盘', icon: '📊' },
      { href: '/stock-audit', label: '库存审计', icon: '📦' },
    ],
  },
  {
    label: '业务管理',
    items: [
      { href: '/orders', label: '订单管理', icon: '📋' },
      { href: '/dishes', label: '菜品管理', icon: '🍽️' },
      { href: '/categories', label: '分类管理', icon: '🗂️' },
      { href: '/setmeals', label: '套餐管理', icon: '🍱' },
    ],
  },
  {
    label: '人员',
    items: [
      { href: '/employees', label: '员工管理', icon: '👥' },
      { href: '/users', label: '用户管理', icon: '👤' },
    ],
  },
  {
    label: '营销',
    items: [{ href: '/marketing', label: '营销中心', icon: '📣' }],
  },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // 不再清除 cookie（之前从未写入），清理 localStorage 即可
    router.push('/login');
  };

  return (
    <>
      {/* 移动端顶部导航 */}
      <header className="md:hidden sticky top-0 z-40" style={{ background: 'var(--side)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <span className="serif text-base font-semibold" style={{ color: '#F1ECE2' }}>
            🍜 星选管家
          </span>
          <button onClick={handleLogout} className="text-xs" style={{ color: 'var(--side-ink)' }}>
            退出
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
                style={{
                  background: active ? 'var(--gold)' : 'rgba(255,255,255,0.08)',
                  color: active ? '#fff' : 'var(--side-ink)',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* 桌面侧边栏 */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-40 w-60 flex-col gap-5 hidden md:flex"
        style={{
          background: 'linear-gradient(180deg,#0B1212 0%,#0E1717 100%)',
          color: 'var(--side-ink)',
          borderRight: '1px solid #0a0f0f',
          padding: '22px 16px 22px 18px',
        }}
      >
      {/* 品牌 */}
      <Link href="/dashboard" className="flex items-center gap-3 px-2">
        <span className="text-2xl">🍜</span>
        <div>
          <div className="serif text-lg font-semibold leading-tight" style={{ color: '#F1ECE2' }}>
            星选管家
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--side-ink)' }}>
            Admin Console
          </div>
        </div>
      </Link>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto space-y-4 side-scroll">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div
              className="text-[10px] uppercase tracking-[0.16em] px-2 pb-1.5"
              style={{ color: 'rgba(216,210,198,0.45)' }}
            >
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] transition-colors"
                    style={{
                      background: active ? 'rgba(199,122,43,0.16)' : 'transparent',
                      color: active ? '#F1ECE2' : 'var(--side-ink)',
                      borderLeft: active ? '2px solid var(--gold)' : '2px solid transparent',
                    }}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 底部用户 */}
      <div className="flex items-center gap-3 px-2 pt-4 border-t" style={{ borderColor: 'rgba(216,210,198,0.12)' }}>
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-sm font-semibold"
          style={{ background: 'var(--gold)', color: '#fff' }}
        >
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate" style={{ color: '#F1ECE2' }}>
            系统管理员
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(216,210,198,0.5)' }}>
            Admin
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm opacity-70 hover:opacity-100"
          title="退出登录"
        >
          ⎋
        </button>
      </div>
      </aside>
    </>
  );
}
