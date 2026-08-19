import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 注意：Edge 运行时会在【构建时】内联 process.env 变量，
// 所以 JWT_SECRET 必须通过 Dockerfile 的构建参数（ARG/ENV）传入。
const JWT_SECRET = process.env.JWT_SECRET || '';

// ============ JWT HS256 验签工具（Web Crypto，零第三方依赖） ============

interface JwtPayload {
  sub?: number;
  username?: string;
  type?: string;
  iat?: number;
  exp?: number;
}

/** base64url → 原始字符串（JWT 的 Header/Payload 是 base64url 编码的 JSON） */
function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

/** 字节数组 → base64url（把 Web Crypto 算出的签名转成 JWT 的格式） */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 常数时间比较：逐字符异或累积，防止"先比到不同就返回"的时序攻击 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 验证管理员 JWT。任何一步失败都返回 null（没有/伪造/过期/不是管理员）。
 * 验证 = ① 结构三 段 ② 用密钥重算签名并比对 ③ 读 payload 检查 type 和 exp
 */
async function verifyAdminToken(token: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    // ① 用 JWT_SECRET 对 "header.payload" 重新计算 HMAC-SHA256 签名
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = await crypto.subtle.sign('HMAC', key, data);

    // ② 比对：算出来的签名 vs token 自带的签名（防伪造/篡改）
    const expected = bytesToBase64Url(new Uint8Array(signature));
    if (!timingSafeEqualStr(expected, signatureB64)) return null;

    // ③ 读 payload：必须是管理员，且没过期
    const payload: JwtPayload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.type !== 'admin') return null;
    if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;

    return payload;
  } catch {
    return null; // 任何异常一律视为无效凭证
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // 静态图片文件直接放行（如 /dishes/dish1.jpg）
  if (/\.(jpg|jpeg|png|webp|gif|svg|ico)$/.test(pathname)) {
    return NextResponse.next();
  }

  // 服务端拦截：管理端页面路径检查
  // CSRF 防御策略：完全抛弃 cookie 鉴权,只用 Authorization header
  // 中间件不再读 cookie 验签——因为前端不再写 cookie
  // 真正的 JWT 验签交给 NestJS(每个 controller 都用 @UseGuards)
  // 中间件只做路径检查: admin 路径放行, NestJS 自己拦截未鉴权请求
  // 注: 浏览器访问 admin 页面时中间件不再强制重定向;如未鉴权访问页面,
  // 由客户端(API 调用 401)或服务端(NestJS 返回 401)拦截,前端跳转登录页
  void verifyAdminToken; // 保留函数备用(可能用于 RSC fetch)
  void JWT_SECRET;

  const response = NextResponse.next();

  // 只有 NEXT_PUBLIC_API_URL 是完整 http 地址时才加 CORS 头（相对路径 /api 属于同源，不需要 CORS）
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (request.nextUrl.pathname.startsWith('/api') && apiUrl && apiUrl.startsWith('http')) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Origin', apiUrl);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
    '/orders/:path*',
    '/dishes/:path*',
    '/categories/:path*',
    '/setmeals/:path*',
    '/employees/:path*',
    '/users/:path*',
    '/marketing/:path*',
  ],
};
