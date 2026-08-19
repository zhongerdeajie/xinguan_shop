import Link from 'next/link';

interface EmptyStateProps {
  icon?: string;
  text: string;
  href?: string;
  ctaLabel?: string;
  className?: string;
}

/**
 * 通用空状态:图标 + 提示文案 + 可选 CTA 按钮
 * 用于购物车空/订单空/浏览记录空/优惠券空等所有"无数据"场景
 */
export function EmptyState({ icon = '📭', text, href, ctaLabel, className = '' }: EmptyStateProps) {
  return (
    <div className={`text-center py-12 bg-white rounded-xl shadow-sm ${className}`}>
      <div className="text-gray-300 text-4xl mb-3">{icon}</div>
      <p className="text-gray-400 mb-4">{text}</p>
      {href && ctaLabel && (
        <Link href={href} className="text-orange-500 text-sm font-medium">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}