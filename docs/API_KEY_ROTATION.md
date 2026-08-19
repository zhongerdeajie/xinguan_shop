# API Key 撤销与重发操作清单

> 本清单针对 `D:\school-system3\.env` 里仍存在的真实 API Key。
> 这些 Key 已经在本地明文存盘过，需要立即去两个 AI 服务商的控制台**撤销并重新生成**。

---

## ⚠️ 为什么要立刻做

`.env` 文件虽然被 `.gitignore` 忽略，但仍可能因为以下原因泄漏：
- 任何能访问这台机器的工具（AI agent、IDE 插件、文件备份、Linter）都能读到
- 误用 git 推送到公开仓库
- 误把整个目录拷贝分享出去
- 容器内任何一个进程都能读 `/app/.env`

**威胁**:别人拿到 Key 后可以用你的额度调 AI/Embedding API，账单算你头上。

---

## 🔧 步骤 1:撤销智谱 (ZHIPU) API Key

1. 浏览器打开 https://bigmodel.cn/usercenter/apikeys
2. 用你之前注册智谱时的手机号/邮箱登录
3. 找到 `ZHIPU_API_KEY=8e94322c85d24e1b8a9abc81b988c038.GPpGUiHZFgSdVwmT` 这条（或名字相近的）
4. 点 "删除" / "重置" / "禁用"
5. 点 "新建 Key"，得到一个**新的 Key**（形如 `xxxxxxxx.xxxxxx`）
6. 把新 Key 保存到本机密码管理器（1Password / Bitwarden / Windows 凭据管理器）

---

## 🔧 步骤 2:撤销 MiniMax API Key

1. 浏览器打开 https://platform.minimaxi.com/user-center/basic-information/interface-key
2. 登录 MiniMax 账号
3. 找到 `MINIMAX_API_KEY=sk-cp-VfnwU8eS1d9...` 这条
4. 点 "删除" / "失效" / "Rotate"
5. 生成新 Key，保存到密码管理器

---

## 🔧 步骤 3:替换本地 .env 的 Key 值

打开 `D:\school-system3\.env`，替换两行：

```diff
- ZHIPU_API_KEY=8e94322c85d24e1b8a9abc81b988c038.GPpGUiHZFgSdVwmT
+ ZHIPU_API_KEY=<你的新 ZHIPU Key>

- MINIMAX_API_KEY=sk-cp-VfnwU8eS1d9EbyvTVGAnmB64W7oQ9qSwm3A_gPT8at9x-2hw5BvSv5Pcu5vuAwcn6tvRiQnJC5pziwGXzuk8LLFVbWjq6xY8YgoUPpPJ6dN1JrJ8ZUqq-MY
+ MINIMAX_API_KEY=<你的新 MiniMax Key>
```

**不要用文本编辑器以外的工具**改这个文件（避免被某些"AI 辅助"工具同步上传）。

---

## 🔧 步骤 4:重启容器加载新 Key

```powershell
docker compose -f D:\school-system3\docker-compose.yml up -d --no-deps python-ai
```

---

## 🔧 步骤 5:验证 AI 服务能调通

```powershell
# 测试智谱
curl -X POST http://localhost:5000/api/v1/ai/chat -H "Content-Type: application/json" -d '{\"message\":\"你好\"}'

# 测试 MiniMax embedding（项目里通过 Qdrant 间接调用）
curl http://localhost:6333/collections
```

应该看到正常的 AI 回答，且不再有 401/403 错误。

---

## 📋 长期防护建议

1. **所有真实密钥都放到 1Password / Bitwarden**,不要散落在项目目录里
2. **本地 .env 用 `chmod 600` 锁权限**:`icacls "D:\school-system3\.env" /inheritance:r /grant:r "%USERNAME%:F"`
3. **生产环境用 Docker secrets 或 Vault**,不放在 .env 文件
4. **AI 服务开启消费限额**(智谱和 MiniMax 都支持),万一泄漏也只能用到你设的额度
5. **GitHub 加 Secret Scanning**,自动报警
6. 我已经创建了 `.env.example` 模板,以后改动 .env 后记得从 .env.example 同步注释

---

## ✅ 完成确认清单

- [ ] 智谱控制台已撤销旧 Key,生成新 Key
- [ ] MiniMax 控制台已撤销旧 Key,生成新 Key
- [ ] 新 Key 已保存到密码管理器
- [ ] .env 已用新 Key 替换
- [ ] python-ai 容器已重启
- [ ] AI 聊天接口调通,看到正常回答
- [ ] AI 服务消费限额已开启
- [ ] .env 文件权限已设 600