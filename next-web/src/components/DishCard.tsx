'use client';

export interface Dish {
  id: number;
  name: string;
  categoryId: number;
  price: number | string;
  image?: string;
  description?: string;
  rating?: number;
  sales?: number;
  status?: number;
}

interface DishCardProps {
  dish: Dish;
  index?: number;
  onClick?: (dish: Dish) => void;
  onAdd?: (dish: Dish) => void | Promise<void>;
  addLabel?: string;
  showAddButton?: boolean;
}

/**
 * 首页菜品卡片:大图 + 名称 + 描述 + 价格 + 评分 + 加入购物车按钮
 *
 * 抽取理由:
 * - page.tsx 菜单区有完整版
 * - 凑单结果也可以用这个卡片(只要控制 onAdd 而非"加入购物车"文案)
 */
export function DishCard({
  dish,
  index = 0,
  onClick,
  onAdd,
  addLabel = '加入购物车',
  showAddButton = true,
}: DishCardProps) {
  const handleClick = () => onClick?.(dish);
  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到 onClick
    onAdd?.(dish);
  };

  return (
    <div
      onClick={handleClick}
      className="xcard overflow-hidden cursor-pointer hover:shadow-lg transition-shadow rise"
      style={{ animationDelay: `${Math.min(index * 60, 400)}ms` }}
    >
      <div
        className="grid place-items-center text-4xl rounded-t-lg"
        style={{ aspectRatio: '4 / 3', background: 'var(--bg-deep)' }}
      >
        {dish.image ? (
          <img src={dish.image} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          '🍽️'
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="serif text-lg font-semibold truncate">{dish.name}</h3>
          {dish.sales ? (
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>
              月销 {dish.sales}
            </span>
          ) : null}
        </div>
        {dish.description ? (
          <p className="text-sm mt-1 mb-3 truncate" style={{ color: 'var(--muted)' }}>
            {dish.description}
          </p>
        ) : null}
        <div className="flex items-center justify-between mt-2">
          <span className="mono text-lg font-semibold" style={{ color: 'var(--accent)' }}>
            ¥{Number(dish.price).toFixed(2)}
          </span>
          <span className="text-sm" style={{ color: 'var(--warn)' }}>
            ⭐ {dish.rating ?? '4.5'}
          </span>
        </div>
        {showAddButton && (
          <button
            onClick={handleAdd}
            className="pill pill-accent !h-9 !w-full !text-[13px] mt-3"
          >
            {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}