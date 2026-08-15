'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// 服务端代码必须用绝对地址：容器内指向 NestJS，本地开发回退到 localhost:3000
const API_BASE_URL = process.env.INTERNAL_API_URL || 'http://localhost:3000';

export async function loginAction(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || '登录失败' };
    }

    const data = await response.json();

    // Set httpOnly cookie
    cookies().set('auth_token', data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Also set user info in a non-httpOnly cookie for client-side display
    cookies().set('user_info', JSON.stringify(data.user), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: '网络错误，请稍后重试' };
  }
}

export async function logoutAction() {
  cookies().delete('auth_token');
  cookies().delete('user_info');
  redirect('/login');
}
