'use server';

// CSRF 防御: 完全用 Authorization header 鉴权,不再 set/get cookie
// 此文件保留为空占位,旧的 loginAction/logoutAction 因没人调用已废弃
// 登录改用前端 fetch (/api/auth/login) + localStorage 存 token
