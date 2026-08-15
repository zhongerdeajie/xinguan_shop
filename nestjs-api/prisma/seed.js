/**
 * 种子数据脚本：为全新数据库灌入管理员账号和基础数据
 * 运行方式：
 *   1) docker compose 启动 nestjs-api 时自动执行（见 Dockerfile）
 *   2) 手动执行：在 nestjs-api 目录下 `node prisma/seed.js`
 * 脚本是幂等的：重复执行不会产生重复数据。
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seedAdmin() {
  // 从环境变量读密码；未设置时直接报错，避免用弱密码启动
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD 未设置，请在 .env 中配置');
  }
  const password = await bcrypt.hash(adminPassword, 10);
  await prisma.employee.upsert({
    where: { username: 'admin' },
    update: { password, status: 1, updateTime: new Date() },
    create: {
      name: '系统管理员',
      username: 'admin',
      password,
      phone: '13800138000',
      status: 1,
      createTime: new Date(),
      updateTime: new Date(),
    },
  });
  console.log('✅ 管理员账号: admin / 123456');
}

async function seedCategories() {
  const categories = [
    { name: '凉菜', sort: 1 },
    { name: '热菜', sort: 2 },
    { name: '主食', sort: 3 },
    { name: '饮品', sort: 4 },
  ];
  const result = {};
  for (const c of categories) {
    let cat = await prisma.category.findFirst({ where: { name: c.name } });
    if (!cat) {
      cat = await prisma.category.create({
        data: {
          type: 1,
          name: c.name,
          sort: c.sort,
          status: 1,
          createTime: new Date(),
          updateTime: new Date(),
        },
      });
    }
    result[c.name] = cat.id;
  }
  console.log('✅ 分类: 凉菜 / 热菜 / 主食 / 饮品');
  return result;
}

async function seedDishes(categoryIds) {
  const dishes = [
    { name: '拍黄瓜', category: '凉菜', price: 12, description: '清爽开胃', rating: 4.6, sales: 128 },
    { name: '口水鸡', category: '凉菜', price: 28, description: '麻辣鲜香', rating: 4.7, sales: 96 },
    { name: '辣椒炒肉', category: '热菜', price: 32, description: '经典湘菜', rating: 4.8, sales: 230 },
    { name: '农家小炒肉', category: '热菜', price: 35, description: '下饭神器', rating: 4.9, sales: 310 },
    { name: '米饭', category: '主食', price: 2, description: '东北大米', rating: 4.5, sales: 500 },
    { name: '酸梅汤', category: '饮品', price: 8, description: '冰镇解腻', rating: 4.4, sales: 150 },
  ];
  for (const d of dishes) {
    const existing = await prisma.dish.findFirst({
      where: { name: d.name, categoryId: categoryIds[d.category] },
    });
    const data = {
      categoryId: categoryIds[d.category],
      price: d.price,
      description: d.description,
      rating: d.rating,
      sales: d.sales,
      status: 1,
      updateTime: new Date(),
    };
    if (existing) {
      await prisma.dish.update({ where: { id: existing.id }, data });
    } else {
      await prisma.dish.create({
        data: {
          name: d.name,
          ...data,
          createTime: new Date(),
        },
      });
    }
  }
  console.log('✅ 菜品: 6 道示例菜品');
}

async function main() {
  await seedAdmin();
  const categoryIds = await seedCategories();
  await seedDishes(categoryIds);
  console.log('🎉 种子数据完成');
}

main()
  .catch((e) => {
    console.error('❌ 种子数据执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
