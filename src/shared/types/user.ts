/** 사용자 인증/승인 도메인 모델 (기획 31번) */

export type UserRole = 'ADMIN' | 'USER'
export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

export interface User {
  id: string
  email: string
  name: string
  profileImage?: string | null
  googleId: string
  role: UserRole
  status: UserStatus
  createdAt: string
  approvedAt?: string | null
  approvedBy?: string | null
  lastLoginAt?: string | null
}

/** 클라이언트에 노출되는 안전한 사용자 정보 (민감정보 없음) */
export interface PublicUser {
  id: string
  email: string
  name: string
  profileImage?: string | null
  role: UserRole
  status: UserStatus
  createdAt: string
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    profileImage: u.profileImage,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
  }
}
