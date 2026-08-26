import { nanoid } from 'nanoid'

/** 生成全局唯一 ID（URL 安全，21 位） */
export function uuid() {
  return nanoid()
}
