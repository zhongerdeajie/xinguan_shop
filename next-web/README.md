# School System V3 - Next.js Frontend (管理端)

## 技术栈
- Next.js 14 + TypeScript
- TanStack Query + Zustand
- TailwindCSS + Ant Design

## 目录结构
```
next-web/
├── src/
│   ├── app/              # App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── courses/
│   │   ├── schedule/
│   │   └── ai/
│   ├── components/       # 共享组件
│   ├── lib/              # 工具函数
│   ├── styles/           # 样式
│   └── types/            # TypeScript 类型
├── public/               # 静态资源
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## 启动
```bash
npm install
npm run dev    # http://localhost:3001
```
