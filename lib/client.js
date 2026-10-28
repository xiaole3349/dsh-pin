/**
 * dsh-pin —— 设置里的一页「钉」
 *
 *     window.__ModuleLoader__.load({ id: 'dsh-pin', factory: (require) => ({ inject, apply }) })
 *
 * 三块：钉住的事、从记忆里挑候选、图书馆（用完就删、只留一句用途）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-pin',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect

    const API = '/dsh-pin'

    const S = {
      卡片: { border: '1px solid rgba(128,128,128,.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, background: 'rgba(128,128,128,.04)' },
      输入: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: 'transparent', color: 'inherit', font: 'inherit', resize: 'vertical' },
      按钮: { padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      主按钮: { padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(90,140,240,.6)', background: 'rgba(90,140,240,.15)', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      小字: { opacity: 0.62, fontSize: 12 },
      标签: { display: 'inline-block', padding: '1px 4px', borderRadius: 2, fontSize: 11, opacity: 0.6, marginRight: 4, border: '1px solid rgba(128,128,128,.25)' },
      标题: { fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
    }

    const 取 = async (路径, 体) => {
      const r = await fetch(API + 路径, 体 ? {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(体),
      } : { cache: 'no-store' })
      return r.json()
    }

    function 面板() {
      const [页, set页] = useState('钉')
      const [钉们, set钉们] = useState([])
      const [馆, set馆] = useState([])
      const [候选, set候选] = useState([])
      const [正文, set正文] = useState('')
      const [标签, set标签] = useState('')
      const [点名, set点名] = useState('')
      const [用途, set用途] = useState('')
      const [提示, set提示] = useState('')
      const [编辑中, set编辑中] = useState(null)
      const [忙, set忙] = useState(false)

      async function 全拉() {
        const [a, b] = await Promise.all([取('/list'), 取('/lib/list')])
        if (a.ok) set钉们(a.pins || [])
        if (b.ok) set馆(b.items || [])
      }
      async function 拉候选() {
        const j = await 取('/candidates')
        set候选(j.ok ? (j.candidates || []) : [])
        if (!j.ok) set提示(j.error || '读不到记忆')
      }
      useEffect(() => { 全拉() }, [])

      async function 做(路径, 体, 成功话) {
        set忙(true); set提示('')
        try {
          const j = await 取(路径, 体)
          if (!j.ok) { set提示(j.error || '没成功'); return }
          if (j.pins) set钉们(j.pins)
          if (j.items) set馆(j.items)
          set提示(成功话 || '好了')
        } catch (e) { set提示('出错：' + e.message) } finally { set忙(false) }
      }

      function 清空钉输入() { set正文(''); set标签(''); set编辑中(null) }

      // 钉
      const 钉区 = h('div', null,
        h('div', { style: { ...S.小字, marginBottom: 12 } },
          '钉住的内容每一轮都会带上，不是命令、是硬一点的事实。不靠算法打分，所以只钉真正值得的。'),
        h('div', { style: S.卡片 },
          h('div', { style: S.标题 }, 编辑中 ? '改这条钉' : '钉一件事'),
          h('textarea', { style: { ...S.输入, minHeight: 68 }, placeholder: '一句话说清：约定、关系、某件不能忘的事', value: 正文, onChange: (e) => set正文(e.target.value) }),
          h('input', { style: { ...S.输入, marginTop: 8 }, placeholder: '标签（逗号分隔，可空）', value: 标签, onChange: (e) => set标签(e.target.value) }),
          h('div', { style: { marginTop: 10, display: 'flex', gap: 8 } },
            h('button', {
              type: 'button', style: S.主按钮, disabled: 忙 || !正文.trim(),
              onClick: async () => {
                if (编辑中) { await 做('/update', { id: 编辑中, text: 正文, tags: 标签 }, '改好了'); 清空钉输入() }
                else { await 做('/add', { text: 正文, tags: 标签 }, '钉好了'); 清空钉输入() }
              },
            }, 编辑中 ? '保存修改' : '钉住'),
            编辑中 ? h('button', { type: 'button', style: S.按钮, onClick: 清空钉输入 }, '取消') : null,
            h('button', { type: 'button', style: S.按钮, onClick: 拉候选 }, '从记忆里挑'),
          ),
        ),
        !候选.length ? null : h('div', { style: S.卡片 },
          h('div', { style: S.标题 }, '记忆候选', h('span', { style: S.小字 }, '按激活分排的前 20 条')),
          候选.map((c, i) => h('div', { key: i, style: { padding: '6px 0', borderTop: i ? '1px solid rgba(128,128,128,.15)' : 'none' } },
            h('div', { style: { lineHeight: 1.6, fontSize: 13 } }, c.text),
            h('div', { style: { ...S.小字, marginTop: 4, display: 'flex', gap: 8 } },
              h('span', null, c.at || ''),
              h('button', {
                type: 'button', style: { ...S.按钮, padding: '2px 8px', fontSize: 12 },
                onClick: () => 做('/add', { text: c.text, tags: '记忆候选' }, '钉好了'),
              }, '钉住'),
            ),
          )),
        ),
        钉们.length === 0 ? h('div', { style: S.小字 }, '还没有钉。') : 钉们.map((p) => h('div', { key: p.id, style: S.卡片 },
          h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6 } }, p.text),
          h('div', { style: { ...S.小字, marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' } },
            (p.tags || []).map((t) => h('span', { key: t, style: S.标签 }, '#' + t)),
            h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
              h('button', { type: 'button', style: { ...S.按钮, padding: '2px 8px', fontSize: 12 }, onClick: () => { set编辑中(p.id); set正文(p.text); set标签((p.tags || []).join('、')) } }, '改'),
              h('button', { type: 'button', style: { ...S.按钮, padding: '2px 8px', fontSize: 12 }, onClick: () => { if (confirm('拆掉这条钉？')) 做('/delete', { id: p.id }, '拆掉了') } }, '拆'),
            ),
          ),
        )),
      )

      // 图书馆
      const 馆区 = h('div', null,
        h('div', { style: { ...S.小字, marginBottom: 12 } },
          '看完就用的东西（工具、插件、资料）不进记忆，只留一句「它能解决什么」。要用时按关键词查。'),
        h('div', { style: S.卡片 },
          h('div', { style: S.标题 }, '收进图书馆'),
          h('input', { style: S.输入, placeholder: '它叫什么（比如「token-stats 脚本」）', value: 点名, onChange: (e) => set点名(e.target.value) }),
          h('input', { style: { ...S.输入, marginTop: 8 }, placeholder: '它能解决什么（一句话）', value: 用途, onChange: (e) => set用途(e.target.value) }),
          h('div', { style: { marginTop: 10 } },
            h('button', {
              type: 'button', style: S.主按钮, disabled: 忙 || !点名.trim() || !用途.trim(),
              onClick: async () => { await 做('/lib/add', { name: 点名, use: 用途 }, '收好了'); set点名(''); set用途('') },
            }, '收好'),
          ),
        ),
        馆.length === 0 ? h('div', { style: S.小字 }, '图书馆是空的。') : 馆.map((x) => h('div', { key: x.id, style: S.卡片 },
          h('div', { style: { fontWeight: 600 } }, x.name),
          h('div', { style: { lineHeight: 1.6, marginTop: 4 } }, x.use),
          h('div', { style: { ...S.小字, marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' } },
            (x.tags || []).map((t) => h('span', { key: t, style: S.标签 }, '#' + t)),
            h('span', { style: { marginLeft: 'auto' } },
              h('button', { type: 'button', style: { ...S.按钮, padding: '2px 8px', fontSize: 12 }, onClick: () => { if (confirm('从图书馆删掉？')) 做('/lib/delete', { id: x.id }, '删掉了') } }, '删'),
            ),
          ),
        )),
      )

      return h('div', null,
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
          ['钉', '图书馆'].map((名) => h('button', {
            key: 名, type: 'button',
            style: 名 === 页 ? { ...S.按钮, borderColor: 'rgba(90,140,240,.6)', background: 'rgba(90,140,240,.15)' } : S.按钮,
            onClick: () => set页(名),
          }, 名)),
        ),
        提示 ? h('div', { style: { ...S.小字, marginBottom: 8 } }, 提示) : null,
        页 === '钉' ? 钉区 : 馆区,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'pin', order: 41, label: '钉' },
          () => h(面板),
        ))
      },
    }
  },
})
