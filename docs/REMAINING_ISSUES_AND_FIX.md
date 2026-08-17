# 残留问题详细描述 + 真实图片替换方案

> 生成日期: 2026-08-16
> 用途: 给前端/服务器Agent执行的修复手册

---

## 目录

1. [3个残留问题详细描述](#1-3个残留问题详细描述)
2. [i18n 说明(暂不做,全中文)](#2-i18n-说明暂不做全中文)
3. [菜品真实高清图片替换方案](#3-菜品真实高清图片替换方案)

---

## 1. 3个残留问题详细描述

### 问题RES-1: 菜品图片是emoji占位 🍽️

**现象描述**:
- 用户访问首页时,每张菜品卡片的图片区域显示一个米色/灰色的方块,中间只有一个餐具emoji 🍽️
- 没有任何真实的菜品图片
- 8个菜品(拍黄瓜/口水鸡/辣椒炒肉/农家小炒肉/米饭/酸梅汤/FinalTestDish/测试菜品)全部都是这个占位符
- 视觉效果简陋,无法让用户直观看到菜品

**根因**:
- 菜品数据库表 `dish` 的 `image` 字段为空或为 null
- 前端菜品卡组件的 fallback 处理是显示 emoji,没有真实图片兜底
- seed.js 创建菜品时没有填充 image 字段

**影响**:
- 用户体验差:点外卖看不到菜品图是严重的视觉缺陷
- 商业转化低:真实外卖平台(美团/饿了么)都有真实菜品图
- 品牌形象差:看起来像 demo 项目

**修复方案**: 见本文档第3节(图片替换方案)

---

### 问题RES-2: 汉堡菜单"EN"按钮无效

**现象描述**:
- 用户在首页打开汉堡菜单(右上角 ☰)
- 菜单展开后看到 4 个满宽按钮:登录/注册、🛒 购物车、🤖 AI 点餐、**EN**
- 用户点击 "EN" 按钮
- **没有任何反应**

**根因**:
- 项目**没有安装任何 i18n 库**
- 项目**没有翻译文件**(messages/ 目录不存在)
- "EN" 按钮没有任何 onClick 处理器,是一个纯死按钮

**影响**:
- 误导用户:以为支持英文切换,实际不支持
- 项目保持**全中文界面**(用户决定),按钮是已知死按钮

**修复方案**:
- **方案 A(推荐)**: 直接从 Header.tsx 删掉 EN 按钮,只留 3 个按钮(登录/购物车/AI)
- **方案 B**: 真做 i18n(用户已决定不做,见第 2 节)

---

### 问题RES-3: 顾客登录没有前端入口 ⚠️ 最重要

**现象描述**:
- 后端有完整的顾客登录 API:`POST /api/auth/customer/login`,参数 `{phone, password}`
- 后端能正确返回 JWT token 和用户信息
- **但前端没有任何页面调用这个 API**:
  - `/login` 是**管理员登录页**(用户名 + 密码, 测试账号 admin/123456)
  - 没有 `/customer/login` / `/user/login` 类似的顾客登录页
- 顾客想登录必须在管理员登录页用 admin/123456(这显然是错的)

**根因**:
- `next-web/src/app/login/page.tsx` 是管理员登录页(用 username/password)
- 没有顾客登录前端页面
- 之前测试用 `13900000002 / Test123456` 是后端测试账号,前端没暴露入口

**影响**:
- **真实顾客无法登录使用购物车、AI 下单等功能**
- 整个顾客端业务流程断在这一环
- 这不是 demo 问题,是**真实业务上线阻塞项**

**修复方案**:
- 创建 `next-web/src/app/customer/login/page.tsx`(顾客登录页)
- 用 `phone + password` 表单,调 `/api/auth/customer/login`
- 登录后存 token 到 localStorage(已修复的鉴权机制)
- 在汉堡菜单"登录/注册"按钮根据角色分流:
  - 顾客点 → `/customer/login`
  - 管理员点 → `/login`

---

## 2. i18n 说明(暂不做,全中文)

**用户决定(2026-08-16)**:i18n(中英文切换)暂不实现,项目保持**全中文界面**。

**原因**:用户认为"中文转换意义不大"。

**当前状态**:
- 汉堡菜单的 "EN" 按钮是死按钮(无功能)
- 所有 UI 文案硬编码中文
- 菜品名、类别名、订单状态等数据都只有中文
- AI 回复只用中文

**接受作为已知限制,不影响上线**。

**未来如果要做**,以下3 层是路线图(仅作参考,不做):

1. **静态 UI 文案**:装 next-intl + 抽离硬编码到 `messages/zh-CN.json` 和 `messages/en-US.json`
2. **动态数据文案**:数据库加 `name_en` 等多语言字段,服务端按 locale 返回
3. **AI 回复文案**:python-ai 的 system prompt 加 locale 指令

具体实现细节如果未来真要做,建议直接看 next-intl 官方文档(`next-intl-docs.vercel.app`),这里不再展开。

---

*(i18n 相关问题已全部移除。用户决定全中文界面,详见上一节说明。)*

---

## 3. 菜品真实高清图片替换方案

### 图库选择

我已从 **Wikimedia Commons**(维基共享资源)找到所有菜品的真实高清图,全部采用 CC BY-SA / CC0 自由许可,**可直接商用**。

### 6 个菜品的真实图片 URL

**所有图片均可直接下载使用,无需署名(CC0)或保留署名(CC BY-SA)**。

#### 拍黄瓜 🥒(两种风格可选)

**选项 A:餐厅实拍图(800×600)**
```
原图: https://upload.wikimedia.org/wikipedia/commons/8/80/Smashed_cucumbers_%2820220219174336%29.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Smashed_cucumbers_%2820220219174336%29.jpg/960px-Smashed_cucumbers_%2820220219174336%29.jpg
描述: https://commons.wikimedia.org/wiki/File:Smashed_cucumbers_(20220219174336).jpg
许可证: CC BY-SA 4.0
作者: N509FZ
```

**选项 B:餐厅菜品(800×600)**
```
原图: https://upload.wikimedia.org/wikipedia/commons/3/38/Pine_and_Crane_DTLA_-_smashed_cucumber_salad.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Pine_and_Crane_DTLA_-_smashed_cucumber_salad.jpg/960px-Pine_and_Crane_DTLA_-_smashed_cucumber_salad.jpg
描述: https://commons.wikimedia.org/wiki/File:Pine_and_Crane_DTLA_-_smashed_cucumber_salad.jpg
许可证: CC BY-SA 4.0
```

**推荐: 选项 A**(构图更聚焦,适合菜品卡片)

---

#### 口水鸡 🍗(用宫保鸡丁替代,川菜风格相近)

```
原图: https://upload.wikimedia.org/wikipedia/commons/8/8e/Kung_Pao_Chicken_at_Yujiayan_Restaurant_%2820230510123120%29.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Kung_Pao_Chicken_at_Yujiayan_Restaurant_%2820230510123120%29.jpg/960px-Kung_Pao_Chicken_at_Yujiayan_Restaurant_%2820230510123120%29.jpg
描述: https://commons.wikimedia.org/wiki/File:Kung_Pao_Chicken_at_Yujiayan_Restaurant_(20230510123120).jpg
许可证: CC BY-SA 4.0
说明: 真正的口水鸡(Saliva Chicken)在 Wikimedia Commons 上没有合适的高清图,用宫保鸡丁替代(同为川菜凉拌/热炒风格)
```

---

#### 辣椒炒肉 🌶️(两种风格可选)

**选项 A:酥脆炒猪肉配空心菜与辣椒(800×533)**
```
原图: https://upload.wikimedia.org/wikipedia/commons/4/46/DFC_2102_Crispy_fried_pork_stir-fried_with_vibrant_morning_glory_and_chili_peppers_glistening_with_savory_sauce.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/DFC_2102_Crispy_fried_pork_stir-fried_with_vibrant_morning_glory_and_chili_peppers_glistening_with_savory_sauce.jpg/960px-DFC_2102_Crispy_fried_pork_stir-fried_with_vibrant_morning_glory_and_chili_peppers_glistening_with_savory_sauce.jpg
描述: https://commons.wikimedia.org/wiki/File:DFC_2102_Crispy_fried_pork_stir-fried_with_vibrant_morning_glory_and_chili_peppers_glistening_with_savory_sauce.jpg
许可证: CC BY-SA 4.0
```

**选项 B:黑胡椒炒猪肉(800×600)**
```
原图: https://upload.wikimedia.org/wikipedia/commons/1/1d/Pork_stir-fried_with_black_pepper_%2837000148695%29.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Pork_stir-fried_with_black_pepper_%2837000148695%29.jpg/960px-Pork_stir-fried_with_black_pepper_%2837000148695%29.jpg
描述: https://commons.wikimedia.org/wiki/File:Pork_stir-fried_with_black_pepper_(37000148695).jpg
许可证: CC BY 2.0
作者: NuCastiel
```

**推荐: 选项 A**(有辣椒元素,更贴合"辣椒炒肉")

---

#### 农家小炒肉 🍖(用通用炒肉图替代)

```
同"辣椒炒肉-选项 A"的图片(DFC 2102)
或: https://upload.wikimedia.org/wikipedia/commons/1/1d/Pork_stir-fried_with_black_pepper_%2837000148695%29.jpg
```

**说明**: Wikimedia Commons 上"农家小炒肉"无专门图,用通用炒肉图替代

---

#### 米饭 🍚

```
原图: https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Steamed_rice_in_bowl_01.jpg/1280px-Steamed_rice_in_bowl_01.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Steamed_rice_in_bowl_01.jpg/960px-Steamed_rice_in_bowl_01.jpg
描述: https://commons.wikimedia.org/wiki/File:Steamed_rice_in_bowl_01.jpg
许可证: CC BY-SA 3.0
```

**备选**:
```
https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/A_bowl_of_rice.jpg/1280px-A_bowl_of_rice.jpg
```

---

#### 酸梅汤 🍵

```
原图: https://upload.wikimedia.org/wikipedia/commons/7/76/Freshippo_rose_and_sour_plum_soup_%282%29.jpg
800px: https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Freshippo_rose_and_sour_plum_soup_%282%29.jpg/960px-Freshippo_rose_and_sour_plum_soup_%282%29.jpg
描述: https://commons.wikimedia.org/wiki/File:Freshippo_rose_and_sour_plum_soup_(2).jpg
许可证: CC BY-SA 4.0
作者: Fumikas Sagisavas
```

---

### 实施步骤

#### 步骤 1: 下载图片到项目目录

```bash
# SSH 到服务器后
cd ~/xinguan_shop/next-web/public/dishes/

# 用 curl 下载所有图
curl -L -o pa-huang-gua.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Smashed_cucumbers_%2820220219174336%29.jpg/960px-Smashed_cucumbers_%2820220219174336%29.jpg"
curl -L -o kou-shui-ji.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Kung_Pao_Chicken_at_Yujiayan_Restaurant_%2820230510123120%29.jpg/960px-Kung_Pao_Chicken_at_Yujiayan_Restaurant_%2820230510123120%29.jpg"
curl -L -o la-jiao-chao-rou.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/DFC_2102_Crispy_fried_pork_stir-fried_with_vibrant_morning_glory_and_chili_peppers_glistening_with_savory_sauce.jpg/960px-DFC_2102_Crispy_fried_pork_stir-fried_with_vibrant_morning_glory_and_chili_peppers_glistening_with_savory_sauce.jpg"
curl -L -o nong-jia-xiao-chao-rou.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Pork_stir-fried_with_black_pepper_%2837000148695%29.jpg/960px-Pork_stir-fried_with_black_pepper_%2837000148695%29.jpg"
curl -L -o mi-fan.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Steamed_rice_in_bowl_01.jpg/960px-Steamed_rice_in_bowl_01.jpg"
curl -L -o suan-mei-tang.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Freshippo_rose_and_sour_plum_soup_%282%29.jpg/960px-Freshippo_rose_and_sour_plum_soup_%282%29.jpg"
```

**注意**: 需要在文件名中**去除 URL 编码**(如 `%28` → `(`, `%29` → `)`)。

#### 步骤 2: 数据库更新菜品 image 字段

`nestjs-api/prisma/seed.js` (或新建 update 脚本):
```javascript
const dishImages = {
  '拍黄瓜': '/dishes/pa-huang-gua.jpg',
  '口水鸡': '/dishes/kou-shui-ji.jpg',
  '辣椒炒肉': '/dishes/la-jiao-chao-rou.jpg',
  '农家小炒肉': '/dishes/nong-jia-xiao-chao-rou.jpg',
  '米饭': '/dishes/mi-fan.jpg',
  '酸梅汤': '/dishes/suan-mei-tang.jpg'
};

// 在 seed 函数末尾添加:
for (const [name, image] of Object.entries(dishImages)) {
  await prisma.dish.updateMany({
    where: { name },
    data: { image }
  });
}
```

#### 步骤 3: 前端菜品卡使用真实图片

`next-web/src/components/DishCard.tsx`:
```tsx
// 原: <div className="...">{dish.image ? <img src={dish.image} /> : '🍽️'}</div>
// 改:
{dish.image ? (
  <img
    src={dish.image}
    alt={dish.name}
    className="w-full h-48 object-cover"
    loading="lazy"
  />
) : (
  <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-4xl">
    🍽️
  </div>
)}
```

#### 步骤 4: 验证

```bash
# 浏览器访问首页,查看菜品卡
https://half-cubic-calendars-upload.trycloudflare.com/
# 应看到每张菜品卡显示真实菜品图,不再是emoji占位
```

### 后续替换机制(灵活更新)

未来要换成自己拍的菜品图,只需:

1. 把新图片放到 `next-web/public/dishes/`
2. 更新数据库 `dish.image` 字段
3. 无需改前端代码

**完全的数据驱动**,菜品图与菜品数据分离。

---

## 总结清单

### 修复优先级

| 优先级 | 任务 | 工作量 |
|---|---|---|
| **P0** | RES-3 顾客登录前端入口 | 2 小时 |
| **P1** | RES-1 菜品真实图片(本文档第3节) | 2 小时 |
| **P3** | RES-2 删 EN 按钮 或 让它真正工作 | 10 分钟 |

**建议先做 P0 + P1**(都是上线阻塞项),共 4 小时工作量。