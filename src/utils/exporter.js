/**
 * 文件导出工具：JSON 备份、Markdown 导出、ZIP 打包、加密导出
 */
import JSZip from 'jszip'
import { dateKey } from './datetime'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export async function downloadBlob(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: filename, data: await blobToBase64(blob), directory: Directory.Cache
    })
    await Share.share({ title: filename, url: result.uri, dialogTitle: '保存或分享文件' })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  return downloadBlob(blob, filename)
}

export function downloadMarkdown(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  return downloadBlob(blob, filename)
}

/** 批量导出笔记为 zip */
export async function downloadNotesZip(notes) {
  const zip = new JSZip()
  const used = new Set()
  for (const note of notes) {
    let name = (note.title || '未命名').replace(/[\\/:*?"<>|]/g, '_')
    if (used.has(name)) name = `${name}_${note.note_id.slice(0, 6)}`
    used.add(name)
    const folder = note.folder && note.folder !== '临时笔记' ? zip.folder(note.folder) : zip
    folder.file(`${name}.md`, note.content || '')
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return downloadBlob(blob, `notes_backup_${dateKey(new Date())}.zip`)
}

/** 简单密码混淆加密（XOR + Base64，本地防窥探级别，非强加密） */
export function encryptText(text, password) {
  const data = new TextEncoder().encode(text)
  const key = new TextEncoder().encode(password)
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length]
  let bin = ''
  out.forEach(b => { bin += String.fromCharCode(b) })
  return `PWB_ENCRYPTED_V1:${btoa(bin)}`
}

export function decryptText(payload, password) {
  if (!payload.startsWith('PWB_ENCRYPTED_V1:')) return payload
  const bin = atob(payload.slice('PWB_ENCRYPTED_V1:'.length))
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  const key = new TextEncoder().encode(password)
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length]
  return new TextDecoder().decode(out)
}

/** SHA-256 哈希（用于解锁密码本地存储，不可逆） */
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
