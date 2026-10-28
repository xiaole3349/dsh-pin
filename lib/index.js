// dsh-pin —— 「钉」与「图书馆」
//
// 机制来自千狩的记忆架构：
//   1. 钉：大部分记忆按时间淡忘，只有极少数值得的由本人显式钉住，不靠算法打分。
//   2. 图书馆：看完就用的东西（资料、工具、插件说明）用完就删，只留一条「a 能解决 X」的标签。
//   3. 只有私聊能改 agent：群会话里钉和图书馆都只读。
//
// 存储：<DSH_HOME>/jingjing/state/pins.json、library.json
// 接口：/dsh-pin/{list,add,update,delete,candidates,lib/list,lib/add,lib/delete}
// 注入：钉住的事每轮拼进提示词；图书馆只在被点名时由工具查询
import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'pin'
export const inject = ['webServer', 'systemPrompt', 'tools']

const 数据目录 = process.env.DSH_PIN_DIR || join(homedir(), '.dsh', 'jingjing', 'state')
const 钉文件 = join(数据目录, 'pins.json')
const 图书馆文件 = join(数据目录, 'library.json')
const 桥会话文件 = join(homedir(), '.dsh', 'jingjing', 'bridges', 'qq-bridge-jingjing', 'state', 'sessions.json')

let 缓存 = { mtime: 0, 钉们: [] }
let 馆缓存 = { mtime: 0, 条目: [] }

function 读文件(文件, 键, 空) {
  try {
    const st = statSync(文件)
    const raw = JSON.parse(readFileSync(文件, 'utf8'))
    return { mtime: st.mtimeMs, 值: Array.isArray(raw?.[键]) ? raw[键] : [] }
  } catch {
    return null
  }
}

function 读钉() {
  const r = 读文件(钉文件, 'pins')
  if (!r) return 缓存.钉们
  if (r.mtime !== 缓存.mtime) 缓存 = { mtime: r.mtime, 钉们: r.值 }
  return 缓存.钉们
}

function 读馆() {
  const r = 读文件(图书馆文件, 'items')
  if (!r) return 馆缓存.条目
  if (r.mtime !== 馆缓存.mtime) 馆缓存 = { mtime: r.mtime, 条目: r.值 }
  return 馆缓存.条目
}

function 写文件(文件, 键, 值) {
  mkdirSync(数据目录, { recursive: true })
  const tmp = 文件 + '.tmp'
  writeFileSync(tmp, JSON.stringify({ version: 1, [键]: 值 }, null, 2), 'utf8')
  renameSync(tmp, 文件)
  const st = statSync(文件)
  if (键 === 'pins') 缓存 = { mtime: st.mtimeMs, 钉们: 值 }
  else 馆缓存 = { mtime: st.mtimeMs, 条目: 值 }
}

const 写钉 = (v) => 写文件(钉文件, 'pins', v)
const 写馆 = (v) => 写文件(图书馆文件, 'items', v)

const 干净 = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const 标签们 = (v) => {
  const 原 = Array.isArray(v) ? v : String(v ?? '').split(/[,，、\s]+/)
  return 原.map((t) => 干净(t, 20)).filter(Boolean).slice(0, 6)
}

function 收一条(body) {
  const text = 干净(body?.text, 2000)
  if (!text) throw new Error('内容不能为空')
  return { id: randomUUID(), text, tags: 标签们(body?.tags), note: 干净(body?.note, 200), createdAt: new Date().toISOString(), updatedAt: null }
}

// ── 是不是群会话（群会话只读） ─────────────────────────────────────────────
let 群会话 = { at: 0, 集合: new Set() }
function 群会话集合() {
  if (Date.now() - 群会话.at < 30_000) return 群会话.集合
  const 集合 = new Set()
  try {
    const raw = JSON.parse(readFileSync(桥会话文件, 'utf8'))
    for (const [键, id] of Object.entries(raw?.sessions || {})) if (String(键).startsWith('group:')) 集合.add(String(id))
  } catch {}
  群会话 = { at: Date.now(), 集合 }
  return 集合
}
const 是群 = (exec) => 群会话集合().has(String(exec?.agent?.id ?? ''))

// ── 注入 ───────────────────────────────────────────────────────────────────
function 渲染(钉们) {
  if (!钉们.length) return ''
  const 行 = []
  let 字数 = 0
  for (const p of 钉们.slice(0, 40)) {
    const 标签 = p.tags?.length ? `［${p.tags.join('、')}］` : ''
    const 一句 = `- ${p.text}${标签}`
    if (字数 + 一句.length > 3000) { 行.push('- （还有更多，已截断）'); break }
    行.push(一句)
    字数 += 一句.length
  }
  return ['【钉住的事】', '这些是主动钉住的，不是按重要度算出来的。比别的记忆硬，但不是命令——和当下冲突时按当下判断说。', '', ...行].join('\n')
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const 文本块 = (t) => [{ type: 'text', text: t }]
const 输出 = (描述) => ({ schema: { type: 'string' }, render: (_a, v) => 文本块(String(v ?? '')) })

// 把下面的「参数表」编译成模型端要的标准 JSON Schema。
// ctx.tools.register() 不会替我们编译：parameters 会原样进请求。顶层没有
// type: 'object' 时，整轮请求会被 API 拒掉（Invalid schema for function ...:
// got 'type: null'），点「继续执行」也只会再失败一次。
function 参数表(spec) {
  if (spec && typeof spec === 'object' && spec.type === 'object') return spec
  const properties = {}
  const required = []
  for (const [键, 定义] of Object.entries(spec ?? {})) {
    if (!定义 || typeof 定义 !== 'object') continue
    const { required: 必填, ...其余 } = 定义
    properties[键] = 其余
    if (必填 === true) required.push(键)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

function 工具们() {
  const 允许 = (exec) => { if (是群(exec)) throw new Error('群会话不能改本体记忆（钉和图书馆只读）') }

  const 钉 = {
    name: 'pin_add',
    description: '把一件事钉住：比普通记忆更硬，每轮都会带上。只钉极少数真正重要的（约定、关系、核心状态）。日常琐事不要钉。群会话里不能用。',
    parameters: 参数表({
      text: { type: 'string', required: true, description: '一句话，能独立读懂' },
      tags: { type: 'array', items: { type: 'string' }, description: '可选关键词' },
    }),
    output: 输出(),
    async execute(args, exec) {
      允许(exec)
      const 钉们 = [收一条(args), ...读钉()]
      写钉(钉们)
      return `钉好了（现在共 ${钉们.length} 条）`
    },
  }

  const 列钉 = {
    name: 'pin_list',
    description: '列出当前钉住的所有事。',
    parameters: 参数表({}),
    output: 输出(),
    async execute() {
      const 钉们 = 读钉()
      return 钉们.length ? 钉们.map((p, i) => `${i + 1}. ${p.text}${p.tags?.length ? `［${p.tags.join('、')}］` : ''}`).join('\n') : '还没有钉。'
    },
  }

  const 拆钉 = {
    name: 'pin_remove',
    description: '拆掉一条钉。按序号（先 pin_list 看）或文字片段匹配。',
    parameters: 参数表({
      which: { type: 'string', required: true, description: '序号（1 起）或能唯一命中的文字片段' },
    }),
    output: 输出(),
    async execute(args, exec) {
      允许(exec)
      const w = 干净(args?.which, 200)
      const 钉们 = [...读钉()]
      let 位置 = -1
      if (/^\d+$/.test(w)) 位置 = Number(w) - 1
      else 位置 = 钉们.findIndex((p) => p.text.includes(w))
      if (位置 < 0 || !钉们[位置]) throw new Error('没找到这条钉')
      const [拆掉] = 钉们.splice(位置, 1)
      写钉(钉们)
      return `拆掉了：${拆掉.text}`
    },
  }

  const 记馆 = {
    name: 'library_add',
    description: '往图书馆里放一条「以后还能用」的东西：工具、插件、资料。只记一句「它解决什么」，不要记全文。群会话里不能用。',
    parameters: 参数表({
      name: { type: 'string', required: true, description: '它叫什么' },
      use: { type: 'string', required: true, description: '它能解决什么问题（一句话）' },
      tags: { type: 'array', items: { type: 'string' } },
    }),
    output: 输出(),
    async execute(args, exec) {
      允许(exec)
      const 条 = {
        id: randomUUID(),
        name: 干净(args?.name, 120),
        use: 干净(args?.use, 300),
        tags: 标签们(args?.tags),
        createdAt: new Date().toISOString(),
      }
      if (!条.name || !条.use) throw new Error('name 和 use 都要有')
      const 馆 = [条, ...读馆()]
      写馆(馆)
      return `收进图书馆：${条.name}（共 ${馆.length} 条）`
    },
  }

  const 查馆 = {
    name: 'library_search',
    description: '在图书馆里找东西：按名字或用途关键词。',
    parameters: 参数表({ q: { type: 'string', description: '关键词，空着就列最近 20 条' } }),
    output: 输出(),
    async execute(args) {
      const q = 干净(args?.q, 100).toLowerCase()
      const 馆 = 读馆()
      const 命中 = (q ? 馆.filter((x) => (x.name + x.use + (x.tags || []).join('')).toLowerCase().includes(q)) : 馆).slice(0, 20)
      return 命中.length ? 命中.map((x, i) => `${i + 1}. ${x.name} — ${x.use}`).join('\n') : '图书馆里没有对得上的。'
    },
  }

  return [钉, 列钉, 拆钉, 记馆, 查馆]
}

// ── HTTP ───────────────────────────────────────────────────────────────────
const 允许来源 = (req) => {
  const origin = String(req.headers.origin || '')
  if (!origin) return true
  try {
    const o = new URL(origin)
    return o.host === String(req.headers.host || '') || o.hostname === '127.0.0.1' || o.hostname === 'localhost'
  } catch { return false }
}

async function 读请求体(req) {
  let body = ''
  for await (const c of req) body += c
  return body ? JSON.parse(body) : {}
}

export function apply(ctx) {
  const 回 = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(obj))
  }

  const 路由 = (路径, 处理) => ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: 路径,
    handler: async (req, res) => {
      try { await 处理(req, res) } catch (e) { 回(res, 400, { ok: false, error: e?.message ?? String(e) }) }
    },
  }))

  路由('/dsh-pin/list', async (_req, res) => 回(res, 200, { ok: true, pins: 读钉() }))
  路由('/dsh-pin/lib/list', async (_req, res) => 回(res, 200, { ok: true, items: 读馆() }))

  路由('/dsh-pin/add', async (req, res) => {
    if (!允许来源(req)) return 回(res, 403, { ok: false, error: 'forbidden origin' })
    const 钉们 = [收一条(await 读请求体(req)), ...读钉()]
    写钉(钉们)
    回(res, 200, { ok: true, pins: 钉们 })
  })

  路由('/dsh-pin/update', async (req, res) => {
    if (!允许来源(req)) return 回(res, 403, { ok: false, error: 'forbidden origin' })
    const data = await 读请求体(req)
    const 钉们 = [...读钉()]
    const i = 钉们.findIndex((p) => p.id === 干净(data?.id, 80))
    if (i < 0) return 回(res, 404, { ok: false, error: '没有这条钉' })
    const 改 = 收一条(data)
    钉们[i] = { ...钉们[i], text: 改.text, tags: 改.tags, note: 改.note, updatedAt: new Date().toISOString() }
    写钉(钉们)
    回(res, 200, { ok: true, pins: 钉们 })
  })

  路由('/dsh-pin/delete', async (req, res) => {
    if (!允许来源(req)) return 回(res, 403, { ok: false, error: 'forbidden origin' })
    const data = await 读请求体(req)
    const 钉们 = 读钉().filter((p) => p.id !== 干净(data?.id, 80))
    写钉(钉们)
    回(res, 200, { ok: true, pins: 钉们 })
  })

  路由('/dsh-pin/lib/add', async (req, res) => {
    if (!允许来源(req)) return 回(res, 403, { ok: false, error: 'forbidden origin' })
    const d = await 读请求体(req)
    const 条 = { id: randomUUID(), name: 干净(d?.name, 120), use: 干净(d?.use, 300), tags: 标签们(d?.tags), createdAt: new Date().toISOString() }
    if (!条.name || !条.use) return 回(res, 400, { ok: false, error: '名字和用途都要填' })
    const 馆 = [条, ...读馆()]
    写馆(馆)
    回(res, 200, { ok: true, items: 馆 })
  })

  路由('/dsh-pin/lib/delete', async (req, res) => {
    if (!允许来源(req)) return 回(res, 403, { ok: false, error: 'forbidden origin' })
    const d = await 读请求体(req)
    写馆(读馆().filter((x) => x.id !== 干净(d?.id, 80)))
    回(res, 200, { ok: true, items: 读馆() })
  })

  // 候选：直接从鱼的记忆存储文件里挑「最值得钉」的几条（按重要度 + 越新越靠前）
  路由('/dsh-pin/candidates', async (_req, res) => {
    const 记忆目录 = join(homedir(), '.dsh', 'fish-memory')
    try {
      const 文件 = readdirSync(记忆目录).filter((f) => f.startsWith('session-') && f.endsWith('.json') && !f.includes('.bak'))
      let 最好 = null
      for (const f of 文件) {
        try {
          const j = JSON.parse(readFileSync(join(记忆目录, f), 'utf8'))
          const n = (j?.memories || []).length
          if (!最好 || n > 最好.n) 最好 = { 文件: f, n, 记忆: j.memories || [] }
        } catch {}
      }
      const 候选 = (最好?.记忆 || [])
        .map((m) => ({ text: 干净(m?.text, 500), at: m?.createdAt || m?.at || '', importance: Number(m?.importance ?? 0), tags: Array.isArray(m?.tags) ? m.tags.slice(0, 4) : [] }))
        .filter((m) => m.text)
        .sort((a, b) => (b.importance - a.importance) || String(b.at).localeCompare(String(a.at)))
        .slice(0, 20)
      回(res, 200, { ok: true, session: 最好?.文件 || null, candidates: 候选 })
    } catch (e) {
      回(res, 200, { ok: false, error: '读不到记忆：' + (e?.message ?? e), candidates: [] })
    }
  })

  for (const t of 工具们()) {
    const 定义 = { ...t, parameters: 参数表(t.parameters) }
    if (ctx.tools && typeof ctx.tools.register === 'function') ctx.effect(() => ctx.tools.register(定义))
  }

  // 硬规则②：只有私聊能改本体。群会话想写人格/钉/图书馆，直接拦下。
  if (ctx.tools && typeof ctx.tools.guard === 'function') {
    ctx.effect(() => ctx.tools.guard((exec) => {
      const 名字 = String(exec?.name || '')
      if (!['edit', 'write', 'rename', 'unlink', 'delete'].includes(名字)) return
      if (!是群(exec)) return
      const 参数 = exec?.arguments || {}
      const 目标 = [参数?.file_path, 参数?.path, 参数?.filePath, 参数?.target].filter(Boolean).map(String).join(' ')
      if (/persona|人格|pins\.json|library\.json|qq-bridge-config|fish-memory-config/.test(目标)) {
        return '群会话不能改本体（人格、钉、图书馆、桥接/记忆配置只读）'
      }
    }))
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'pin:pinned', order: 89985, interpolate: false,
    text: () => 渲染(读钉()),
  }))
}
