'use client';

/**
 * 紧凑型菜品行:用于购物车、凑单结果、订单详情等"已有菜品 ID + 数量"的场景
 * 区别于 DishCard:不显示图片、不显示评分,只显示名 + 数量 + 价格
 */

interface CompactDishRowProps {
  name: string;
  number: number;
  price?: number | string;     // 单价
  amount?: number | string;    // 总价(优先于 price × number)
  rightSlot?: React.ReactNode; // 右侧 +/-/删除按钮
}

export function CompactDishRow({ name, number, price, amount, rightSlot }: CompactDishRowProps) {
  const displayAmount =
    amount !== undefined
      ? Number(amount).toFixed(2)
      : price !== undefined
        ? (Number(price) * number).toFixed(2)
        : '0.00';

  return (
    <div className="p-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{name}</div>
        <div className="text-sm" style={{ color: 'var(--muted)' }}>
          × {number}
        </div>
      </div>
      {rightSlot}
      <div className="mono font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
        ¥{displayAmount}
      </div>
    </div>
  );
}