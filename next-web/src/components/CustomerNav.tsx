'use client';

import Link from 'next/link';

interface CustomerNavProps {
  title?: string;
  brand?: string;
  rightSlot?: React.ReactNode; // 右侧区域:返回链接、登录链接等
  showBrand?: boolean; // 是否显示左侧"🍜 星选 AI 购物管家"
  sticky?: boolean; // 默认 true 跟随滚动
}

/**
 * 顾客端统一顶部导航
 * 替换原本散落在 5 个页面里的 frosted <header> 块
 *
 * 之所以抽这个组件:
 * - 5 个页面(page/cart/assistant/account/account-login)的 frosted header JSX 几乎一模一样
 * - 改 Logo/字体/链接一次要在 5 个文件改
 * - 加购物车角标也只改一个文件
 */
export function CustomerNav({
  title,
  brand = '星选 AI 购物管家',
  rightSlot,
  showBrand = true,
  sticky = true,
}: CustomerNavProps) {
  return (
    <header className={`frosted ${sticky ? 'sticky top-0' : ''} z-40`}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 min-h-16 py-3 flex flex-wrap items-center justify-between gap-2">
        {showBrand ? (
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-base md:text-xl font-semibold" style={{ color: 'var(--accent)' }}>
              {title || brand}
            </span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>
              {title}
            </span>
          </Link>
        )}
        {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
      </div>
    </header>
  );
}

/** 常用的右侧"返回菜单"链接 slot */
export function NavBackLink({ label = '← 返回菜单', href = '/' }: { label?: string; href?: string }) {
  return (
    <Link href={href} className="text-sm" style={{ color: 'var(--muted)' }}>
      {label}
    </Link>
  );
}