// 鱼神弹窗 · client 半：卷轴画卷弹窗 + 设置页。独立插件，不依赖鱼神双子星。
// 用法：window.__yshenImportantPopup({ theme:'blue'|'red', items:[...], autoExpand:false, badge, title, body })
window.__ModuleLoader__.load({
  id: 'dsh-yushen-popup',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    // 白话层：给人看的字，先过这里（技术词→人话）。和 lib/humanize.js 同一套规则。
    const PLAIN_WORDS = {
      incident: '出了问题', incidents: '出的问题', job: '任务', jobs: '任务',
      ask: '有人找你', asks: '有人找你', restart: '重启', backup: '备份', sync: '同步',
      approval: '要你点头的事', ok: '没问题', failed: '没成功', error: '出了个错',
      warning: '要注意', timeout: '等太久了，没等到结果', offline: '掉线了',
      connected: '连上了', pending: '还没处理', done: '做完了', running: '正在跑',
      host: '后台', client: '界面', payload: '内容', endpoint: '接口',
    }
    const plain = (t) => {
      if (typeof t !== 'string') return t
      let out = t
      Object.keys(PLAIN_WORDS).forEach((k) => {
        out = out.replace(new RegExp('(^|[^A-Za-z0-9_])' + k + '([^A-Za-z0-9_]|$)', 'gi'), (m, a, b) => a + PLAIN_WORDS[k] + b)
      })
      return out
    }

    const POPUP_THEMES = {
      blue: {
        crown: [21.81, 0.28, 56.59],
        frame: [21.81, 27.65, 56.59],
        wingL: [0.40, 5.90, 26.30],
        wingR: [0.40, 5.70, 26.20],
        bottom: [28.40, 71.0, 43.28],
        content: { left: 24.5, right: 24.5, top: 30, bottom: 42 },
        colors: {
          text: '#eaf7ff', title: '#f2fbff', body: 'rgba(225,245,255,.9)',
          badge: '#bfe9ff', badgeBg: 'rgba(10,40,70,.38)', border: 'rgba(150,220,255,.55)',
          btnText: '#dff3ff', btnBg: 'rgba(10,40,70,.5)', btnBorder: 'rgba(140,210,255,.45)',
          accentBg: 'linear-gradient(180deg,#7fd4ff,#3d9fe0)', accentBorder: '#bfe9ff', accentText: '#05202f',
        },
      },
      red: {
        crown: [22.2, 0, 55.4],
        frame: [22.2, 24.0, 55.4],
        wingL: [1.0, 7.4, 26.6],
        wingR: [1.0, 7.8, 27.0],
        bottom: [30.7, 72.0, 38.7],
        content: { left: 24.5, right: 24.5, top: 28, bottom: 37 },
        colors: {
          text: '#fff5f2', title: '#fff1ec', body: 'rgba(255,235,228,.9)',
          badge: '#ffd9cf', badgeBg: 'rgba(60,12,18,.38)', border: 'rgba(255,190,175,.55)',
          btnText: '#ffe3da', btnBg: 'rgba(60,12,18,.5)', btnBorder: 'rgba(255,190,175,.45)',
          accentBg: 'linear-gradient(180deg,#ff9d8a,#d94b3d)', accentBorder: '#ffd0c4', accentText: '#2a0806',
        },
      },
    }

    // 同类提醒去重：badge|title → { at, n }（十分钟内只弹一次，其余计次）
    const recentAlerts = new Map()

    function mountImportantPopup(opts = {}) {
      if (typeof document === 'undefined') return Promise.resolve(false)
      // 合并全局队列：同时来多条时，一个弹窗显示「未读 N 条」列表
      const pending2 = (typeof window !== 'undefined' && Array.isArray(window.__ysPopupPending)) ? window.__ysPopupPending.splice(0) : []
      const merged = (Array.isArray(opts.items) && opts.items.length) ? opts.items.slice() : [opts]
      for (const p2 of pending2) merged.push(p2)
      const items = merged
      const theme = (opts.theme === 'red' || (items[0] && items[0].theme === 'red')) ? 'red' : 'blue'
      // 2026-11-11 老板：「多个提醒会有多个弹窗，是好是坏」——不好：
      // 同一件事（同 badge+标题）十分钟内重复来，只弹一次，次数记下来写在正文里；
      // 间隔超过十分钟的，算新的一次，照常弹。避免「别的会话刚跑了一轮」每 5 分钟糊一脸。
      const dedupeMs = Number(opts.dedupeMs) > 0 ? Number(opts.dedupeMs) : 10 * 60 * 1000
      const dk = String((items[0] && items[0].badge) || '') + '|' + String((items[0] && items[0].title) || '')
      const nowMs = Date.now()
      const seen = recentAlerts.get(dk) || { at: 0, n: 0 }
      if (seen.at && nowMs - seen.at < dedupeMs) {
        seen.n += 1
        seen.at = nowMs
        recentAlerts.set(dk, seen)
        try { yspPushHistory(items[0] || opts) } catch { /* 忽略 */ }
        return Promise.resolve(false)
      }
      recentAlerts.set(dk, { at: nowMs, n: 0 })
      if (seen.n > 0 && items[0]) {
        // 说明"刚才还来过 N 次"，一条顶 N 条
        items[0] = Object.assign({}, items[0], {
          body: String(items[0].body || '') + '\n（刚才 10 分钟里又来了 ' + seen.n + ' 次）',
        })
      }
      // 已有弹窗在显示 → 入队，等它关掉再弹（避免同时叠好几个）
      if (typeof window !== 'undefined' && window.__ysPopupShowing) {
        window.__ysPopupPending = window.__ysPopupPending || []
        window.__ysPopupPending.push(opts)
        return Promise.resolve(false)
      }
      if (typeof window !== 'undefined') window.__ysPopupShowing = true
      // 2026-11-12 老板：「弹窗悬浮有两个」——「关闭」收起来的那幅会留在屏上，
      // 下一轮再弹就变成两幅叠着。同一时间只允许一幅：开新弹窗前，把旧的（收起来的）拆掉。
      try {
        const olds = document.querySelectorAll('[data-ys-popup]')
        for (const el of olds) { try { el.remove() } catch { /* 单个拆不掉不影响别的 */ } }
      } catch { /* 老浏览器没有 querySelectorAll 就算了 */ }
      const T = POPUP_THEMES[theme]
      const multi = items.length > 1
      const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return new Promise((resolve) => {
        // 字体/配色配置先读（后面 playClick / LIGHT 都要用，不能等 content 创建时才算）
        let _font = {}
        try { _font = JSON.parse(localStorage.getItem('yspopup.font') || '{}') || {} } catch { _font = {} }
        const _fs = _font.fontSize === 'small' ? '0.9' : (_font.fontSize === 'large' ? '1.12' : '1')
        const FS = (n) => (Number(n) * parseFloat(_fs || '1')).toFixed(2) + 'cqw'
        let _view = {}
        try { _view = JSON.parse(localStorage.getItem('yspopup.view') || '{}') || {} } catch { _view = {} }
        // 「关闭后保留悬浮窗」：读本地设置
        let _stay = false
        try { _stay = localStorage.getItem('yspopup.stay') === '1' } catch { _stay = false }
        // 2026-11-12：点空白处到底干嘛，以前是写死的（常驻就收、否则关），面板上那三个单选其实没生效。
        // 现在从 localStorage 读用户选的那个，弹窗创建时就用。
        let _blank = 'fold'
        try { _blank = localStorage.getItem('yspopup.blankAction') || 'fold' } catch { _blank = 'fold' }
        const _strokeW = Number(_font.strokeWidth) || 0
        const _stroke = _strokeW > 0 ? (_strokeW + 'px ' + (_font.strokeColor || '#ffffff')) : '0 transparent'
        const wrap = document.createElement('div')
        wrap.setAttribute('data-ys-popup', '1')
        wrap.id = 'ys-popup-wrap'
        // 2026-11-11 老板：「按键无效，而且没有关闭」——先别猜，留证据。
        // 每次点按钮/点外面/按 Esc 都往 host 记一行；下次再出问题，看日志就知道是"事件没到"还是"到了没生效"。
        const yspDiag = function (why, extra) {
          try {
            fetch('/yushen-popup/diag', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ why: why, extra: extra || null, title: String((items[0] && items[0].title) || '') }),
            }).catch(function () { /* 诊断写不上不影响弹窗 */ })
          } catch { /* 忽略 */ }
        }
        // 音效（点击水声）：本地素材，失败静默
        const playClick = () => {
          try {
            if (_font && _font.sound === false) return
            const a = new Audio('/yushen-popup/assets/sounds/click-water.wav')
            a.volume = 0.35
            a.play().catch(function () { /* 自动播放被拦就静默 */ })
          } catch { /* 忽略 */ }
        }
        // 深浅色：light 时把文字/遮罩换成浅底
        const LIGHT = _font && _font.scheme === 'light'
        // 彻底禁掉浏览器原生拖拽（否则拖画卷会拖出"宝石"/触发上传层）
        const noDragStyle = document.createElement('style')
        noDragStyle.textContent = '[data-ys-popup],[data-ys-popup] *{-webkit-user-drag:none!important;user-drag:none!important;user-select:none!important}'
          + '[data-ys-popup] button{transition:filter .18s ease, transform .12s ease, box-shadow .18s ease}'
          + '[data-ys-popup] button:hover{filter:brightness(1.12)}'
          + '[data-ys-popup] button:active{transform:translateY(1px);filter:brightness(.96)}'
        document.head.appendChild(noDragStyle)
        Object.assign(wrap.style, {
          position: 'fixed', inset: '0', zIndex: '2147483600', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '3vw',
          background: LIGHT ? 'rgba(230,238,246,.82)' : 'rgba(3,10,14,.74)', opacity: '0', transition: 'opacity .28s ease',
        })
        const stage = document.createElement('div')
        Object.assign(stage.style, {
          position: 'relative', width: 'min(84vw, calc(84vh * 1.3352))',
          aspectRatio: '2366 / 1772', containerType: 'inline-size', opacity: '0',
        })
        const mk = (part, box, initial) => {
          const im = document.createElement('img')
          im.src = '/yushen-popup/assets/' + theme + '/' + part + '.png'
          im.alt = ''
          im.draggable = false
          im.addEventListener('dragstart', (e) => e.preventDefault())
          Object.assign(im.style, { position: 'absolute', pointerEvents: 'none', userSelect: 'none', width: box.w + '%', top: box.y + '%' })
          if (box.right != null) im.style.right = box.right + '%'
          else im.style.left = box.x + '%'
          if (initial) Object.assign(im.style, initial)
          stage.appendChild(im)
          return im
        }
        const hidden = { opacity: '0' }
        const closedWing = { transform: 'translateX(85%)', transition: 'transform .9s cubic-bezier(.2,.8,.2,1)' }
        const crown = mk('crown', { x: T.crown[0], y: T.crown[1], w: T.crown[2] }, hidden)
        const wingL = mk('left', { x: T.wingL[0], y: T.wingL[1], w: T.wingL[2] }, closedWing)
        const wingR = mk('right', { right: T.wingR[0], y: T.wingR[1], w: T.wingR[2] }, { transform: 'translateX(-85%)', transition: 'transform .9s cubic-bezier(.2,.8,.2,1)' })
        const frame = mk('frame', { x: T.frame[0], y: T.frame[1], w: T.frame[2] }, hidden)
        const bottom = mk('bottom', { x: T.bottom[0], y: T.bottom[1], w: T.bottom[2] }, hidden)
        // 2026-11-09：部件各自缩放——内框（画框/文字）朝内长，外饰（翼/顶/底）朝反方向缩。
        // origin 钉在贴边那条边上，所以接缝不动。
        frame.style.transformOrigin = 'center center'
        wingL.style.transformOrigin = 'right center'
        wingR.style.transformOrigin = 'left center'
        crown.style.transformOrigin = 'center bottom'
        bottom.style.transformOrigin = 'center top'

        // 内容容器：列表视图 / 详情视图
        const content = document.createElement('div')
        Object.assign(content.style, {
          position: 'absolute', left: '27%', right: '27%',
          top: '26%', bottom: '42%',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'safe center',
          gap: '1.4cqw', padding: '0 2.4cqw 5cqw', boxSizing: 'border-box', overflowY: 'auto', minHeight: 0,
          color: _font.textColor || (LIGHT ? '#1b2a38' : T.colors.text),
          fontFamily: _font.fontFamily || 'inherit',
          fontSize: FS(1.6),
          WebkitTextStroke: _stroke,
          fontWeight: _font.fontWeight || '',
          textShadow: '0 2px 12px rgba(0,20,40,.7)',
          overflowY: 'auto', scrollbarWidth: 'thin', opacity: '0', transition: 'opacity .6s ease .85s',
          pointerEvents: 'none',
        })
        content.style.transformOrigin = 'center center'
        stage.appendChild(content)
        // 框外操作区：按钮放在画框下方（常驻、统一风格）
        const btnRow = document.createElement('div')
        Object.assign(btnRow.style, {
          position: 'absolute', left: '8%', right: '8%', top: '62%',
          display: 'flex', gap: '2cqw', justifyContent: 'center', alignItems: 'center',
          opacity: '0', transition: 'opacity .5s ease .9s', pointerEvents: 'none', zIndex: '3',
        })
        stage.appendChild(btnRow)

        // 2026-11-12 老板：「内容框图片不能向下拉伸、不能往下扩展」。
        // 内容装不下时，把画框**纵向拉长一点**（最多 25%），底饰和按钮跟着下移，内容区跟着变高；
        // 再多就还走滚动。拉伸用 object-fit: fill，所以画框会稍微变形——先这么办，看着不对再换九宫格切图。
        let grown = false
        const growToFit = () => {
          try {
            if (grown || window.__yspNoGrow === true) return
            const sh = stage.clientHeight || (stage.getBoundingClientRect() || {}).height || 0
            if (!sh) return
            const need = content.scrollHeight
            const have = content.clientHeight
            if (need <= have + 2) return
            const fr = frame.getBoundingClientRect()
            if (!fr || !fr.height) return
            const k = Math.min(0.25, Math.max(0, (need - have) / Math.max(1, have)) * 0.85)
            if (k <= 0.02) return
            const extra = fr.height * k
            frame.style.height = ((fr.height + extra) / sh * 100).toFixed(2) + '%'
            frame.style.objectFit = 'fill'
            const shift = extra / sh * 100
            ;[bottom, btnRow].forEach((el2) => {
              const t0 = parseFloat(String(el2.style.top || '0')) || 0
              el2.style.top = (t0 + shift).toFixed(2) + '%'
            })
            const b0 = parseFloat(String(content.style.bottom || '42')) || 42
            content.style.bottom = Math.max(6, b0 - shift).toFixed(2) + '%'
            grown = true
            try { yspDiag('grow', { k: Math.round(k * 100) }) } catch { /* 忽略 */ }
          } catch { /* 拉伸失败就保持滚动 */ }
        }

        const mkBadge = (text) => {
          const b = document.createElement('div')
          b.textContent = text || '提醒'
          Object.assign(b.style, {
            fontSize: FS(1.9), letterSpacing: '.28em', padding: '.4cqw 1.6cqw',
            border: '1px solid ' + T.colors.border, borderRadius: '999px',
            color: T.colors.badge, background: T.colors.badgeBg, alignSelf: 'center',
          })
          return b
        }
        const showDetail = (idx) => {
          const it = items[idx] || {}
          content.innerHTML = ''
          content.appendChild(mkBadge(it.badge || '提醒'))
          const h = document.createElement('h2')
          h.textContent = it.title || ''
          Object.assign(h.style, { margin: '0', fontSize: FS(3.9), fontWeight: '600', letterSpacing: '.05em', color: (_font.titleColor || _font.textColor) || (LIGHT ? '#12202c' : T.colors.title), width: '100%', wordBreak: 'break-word', textAlign: 'center', WebkitTextStroke: _stroke, fontWeight: _font.fontWeight || '' })
          content.appendChild(h)
          const p = document.createElement('p')
          p.textContent = it.body || ''
          Object.assign(p.style, { margin: '0', textDecoration: 'none', fontSize: FS(1.8), lineHeight: '1.75', color: _font.textColor || (LIGHT ? '#2a3a48' : T.colors.body), WebkitTextStroke: _stroke, fontWeight: _font.fontWeight || '', whiteSpace: 'pre-wrap', width: '100%', wordBreak: 'break-word', textAlign: 'center' })
          content.appendChild(p)
          // 两个按钮：同一风格、同色系，不分主次，放框外下方
          const _bs = (_font && _font.buttonStyle) || 'crystal'
          const _accent = (_font && _font.accentColor) || ''
          const btnBase = {
            font: 'inherit', fontSize: FS(2.3), padding: '1cqw 2.6cqw', borderRadius: '1.2cqw', cursor: 'pointer',
            fontWeight: '600', color: T.colors.btnText,
          }
          if (_bs === 'glass') {
            btnBase.border = '1px solid ' + T.colors.btnBorder
            btnBase.background = 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.06) 45%, rgba(0,0,0,.16))'
            btnBase.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.5), 0 2px 8px rgba(0,0,0,.3)'
            btnBase.backdropFilter = 'blur(2px)'
          } else if (_bs === 'gold') {
            btnBase.border = '1px solid rgba(240,200,130,.85)'
            btnBase.background = 'linear-gradient(180deg, rgba(60,40,20,.85), rgba(30,18,10,.9))'
            btnBase.color = '#ffe8c0'
            btnBase.boxShadow = 'inset 0 0 0 1px rgba(255,220,160,.35), 0 3px 12px rgba(0,0,0,.4)'
          } else {
            btnBase.border = '1px solid ' + T.colors.accentBorder
            btnBase.background = T.colors.accentBg
            btnBase.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.65), inset 0 -2px 0 rgba(0,0,0,.18), 0 4px 14px rgba(90,180,255,.35)'
            btnBase.textShadow = '0 1px 2px rgba(0,0,0,.2)'
          }
          // 强调色优先（后台「字体美化 → 强调」选的色）
          if (_accent) {
            btnBase.background = _accent
            btnBase.border = '1px solid ' + _accent
            btnBase.color = '#0a1620'
            btnBase.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.55), 0 4px 14px ' + _accent + '66'
          }
          btnRow.innerHTML = ''
          if (multi) {
            const back = document.createElement('button')
            back.textContent = '返回列表'
            Object.assign(back.style, btnBase)
            back.addEventListener('click', (e) => { e.stopPropagation(); showList() })
            btnRow.appendChild(back)
          }
          // 2026-11-11 老板：「好和知道了好像是一回事吧」——对，纯通知的两个键都是"关"。
          // 规矩改成：**不给 cancelText 就只出一个键**（知道了 / 好），一个键就是"看完关掉"，不进常驻；
          // 真有第二个选择（比如「稍后」）才出两个键。
          const single = !it.cancelText
          if (!single) {
            // 2026-11-12 老板：「按键应该是稍后改成关闭……关闭之后没有内容了就应该变回画框」
            // 次按钮默认是「关掉就消失」；传 cancelAction:'fold' 就是**收成画框**（内容收起、外框留在角落）。
            const cancelAct = it.cancelAction === 'fold' ? 'fold' : 'cancel'
            const cancel = document.createElement('button')
            cancel.textContent = it.cancelText
            cancel.setAttribute('data-ys-act', cancelAct)
            Object.assign(cancel.style, btnBase)
            cancel.style.filter = 'brightness(.92)'
            cancel.addEventListener('click', (e) => {
              e.stopPropagation()
              try { yspDiag(cancelAct === 'fold' ? 'click-fold' : 'click-cancel') } catch { /* 忽略 */ }
              playClick()
              if (cancelAct === 'fold') toFrame()
              else finish(false)
            })
            btnRow.appendChild(cancel)
          }
          const ok = document.createElement('button')
          ok.textContent = it.confirmText || (single ? '知道了' : '好')
          ok.setAttribute('data-ys-act', single ? 'close' : 'ok')
          // 主按钮同一套风格，只是略亮一点、字重更实（不偏离主题）
          Object.assign(ok.style, btnBase)
          ok.style.filter = 'brightness(1.12)'
          ok.style.fontWeight = '700'
          ok.style.boxShadow = String(btnBase.boxShadow || '') + ', 0 0 1.6cqw rgba(255,255,255,.25)'
          ok.addEventListener('click', (e) => { e.stopPropagation(); try { yspDiag(single ? 'click-close' : 'click-ok') } catch { /* 忽略 */ }; playClick(); finish(!single) })
          btnRow.appendChild(ok)
        }
        const showList = () => {
          content.innerHTML = ''
          content.appendChild(mkBadge('未读 ' + items.length + ' 条'))
          items.forEach((it, i) => {
            const row = document.createElement('div')
            Object.assign(row.style, {
              display: 'flex', flexDirection: 'column', gap: '.3cqw', width: '100%',
              padding: '.8cqw 1.2cqw', borderRadius: '1cqw', cursor: 'pointer',
              background: 'rgba(255,255,255,.06)', border: '1px solid ' + T.colors.border,
              textAlign: 'left',
            })
            row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,.13)' })
            row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,.06)' })
            const t = document.createElement('div')
            t.textContent = it.title || '提醒'
            Object.assign(t.style, { fontSize: FS(1.7), fontWeight: '600', color: T.colors.title })
            const d = document.createElement('div')
            d.textContent = (it.body || '').slice(0, 40)
            Object.assign(d.style, { fontSize: FS(1.2), color: T.colors.body, opacity: '.8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
            row.appendChild(t)
            row.appendChild(d)
            row.addEventListener('click', (e) => { e.stopPropagation(); showDetail(i) })
            content.appendChild(row)
          })
          // 列表模式的按钮放到框外按钮行（和详情一致）
          const _bs0 = (_font && _font.buttonStyle) || 'crystal'
          const listBtn = {
            font: 'inherit', fontSize: FS(2.3), padding: '1cqw 2.6cqw', borderRadius: '1.2cqw', cursor: 'pointer',
            fontWeight: '600', color: T.colors.btnText,
            border: '1px solid ' + T.colors.accentBorder,
            background: T.colors.accentBg,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.65), inset 0 -2px 0 rgba(0,0,0,.18), 0 4px 14px rgba(90,180,255,.35)',
          }
          if (_accent) {
            listBtn.background = _accent
            listBtn.border = '1px solid ' + _accent
            listBtn.color = '#0a1620'
          }
          btnRow.innerHTML = ''
          // 返回：回到主界面（所有子页面都有）
          const backBtn = document.createElement('button')
          backBtn.textContent = '返回'
          backBtn.setAttribute('data-ys-act', 'close')
          Object.assign(backBtn.style, listBtn)
          backBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(false) })
          btnRow.appendChild(backBtn)
          // 未读中心额外给「全部已读」
          if (!opts.closeOnly) {
            const readAll = document.createElement('button')
            readAll.textContent = '全部已读'
            readAll.setAttribute('data-ys-act', 'close')
            Object.assign(readAll.style, listBtn)
            readAll.addEventListener('click', (e) => { e.stopPropagation(); finish(false) })
            btnRow.appendChild(readAll)
          }
        }
        if (!multi) showDetail(0)

        // 轴心（收拢态）
        const axis = document.createElement('img')
        axis.src = '/yushen-popup/assets/' + theme + '/center.png'
        axis.alt = ''
        Object.assign(axis.style, {
          position: 'absolute', left: '50%', top: '50%', width: '11%',
          transform: 'translate(-50%,-50%)', cursor: 'pointer', opacity: '0',
          filter: 'drop-shadow(0 0 .8cqw rgba(255,220,200,.45))',
          transition: 'opacity .5s ease .3s, transform .2s ease',
        })
        axis.draggable = false
        axis.addEventListener('dragstart', (e) => e.preventDefault())
        axis.addEventListener('mouseenter', () => { axis.style.transform = 'translate(-50%,-50%) scale(1.05)' })
        axis.addEventListener('mouseleave', () => { axis.style.transform = 'translate(-50%,-50%)' })
        axis.addEventListener('click', (e) => { e.stopPropagation(); reveal() })
        stage.appendChild(axis)
        // 稍后热区
        const dropHit = document.createElement('div')
        Object.assign(dropHit.style, { position: 'absolute', left: '8%', right: '8%', bottom: '0', height: '28%', cursor: 'pointer' })
        dropHit.title = '稍后'
        const dropTip = document.createElement('div')
        dropTip.textContent = '稍后'
        Object.assign(dropTip.style, {
          position: 'absolute', left: '50%', bottom: '1%', transform: 'translateX(-50%)',
          fontSize: FS(1.4), letterSpacing: '.2em', color: T.colors.badge, opacity: '0',
          transition: 'opacity .2s ease', pointerEvents: 'none',
          textShadow: '0 2px 12px rgba(20,8,4,.9)',
        })
        dropHit.appendChild(dropTip)
        const dropGlow = document.createElement('div')
        Object.assign(dropGlow.style, {
          position: 'absolute', left: '50%', top: '50%', width: '52%', height: '92%',
          transform: 'translate(-50%,-50%)', borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(255,170,150,.28), rgba(255,170,150,0))',
          opacity: '0', transition: 'opacity .25s ease', pointerEvents: 'none',
        })
        dropHit.appendChild(dropGlow)
        dropHit.addEventListener('mouseenter', () => { dropTip.style.opacity = '1'; dropGlow.style.opacity = '1' })
        dropHit.addEventListener('mouseleave', () => { dropTip.style.opacity = '0'; dropGlow.style.opacity = '0' })
        dropHit.addEventListener('click', (e) => { e.stopPropagation(); suspend() })
        stage.appendChild(dropHit)
        // 中间数字
        const countEl = document.createElement('div')
        countEl.textContent = String(items.length)
        Object.assign(countEl.style, {
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          fontSize: FS(9), fontWeight: '700', color: '#fff',
          textShadow: '0 0 2cqw rgba(255,90,70,.85)', opacity: '0',
          transition: 'opacity .3s ease .15s', pointerEvents: 'none', zIndex: '5',
        })
        stage.appendChild(countEl)

        wrap.appendChild(stage)
        document.body.appendChild(wrap)

        let done = false
        let opened = false
        let suspended = false
        // 2026-11-11 老板：「按键无效，而且没有关闭」。原来的 finish 里任何一句抛错（比如 onWheel 还没就绪、
        // 或者宿主那边删了节点），done 已经置 true，后面再点就全部空转，弹窗永远关不掉。
        // 现在：每一步单独 try，最后无论如何都从 DOM 里摘掉；并且关掉后一定复位 __ysPopupShowing，
        // 免得一条弹窗把后面所有弹窗都吃掉。
        const cleanup = (keepFloating, result) => {
          try { document.removeEventListener('keydown', onKey, true) } catch { /* 忽略 */ }
          try { document.removeEventListener('keydown', onEnter, true) } catch { /* 忽略 */ }
          try { document.removeEventListener('pointerdown', repairPointer, true) } catch { /* 忽略 */ }
          try { document.removeEventListener('click', onClickCapture, true) } catch { /* 忽略 */ }
          try { window.removeEventListener('wheel', onWheel, { passive: false }) } catch { /* 忽略 */ }
          try { if (typeof window !== 'undefined') window.__ysPopupShowing = false } catch { /* 忽略 */ }
          if (keepFloating) {
            try { suspend() } catch { try { wrap.remove() } catch { /* 忽略 */ } }
            try { resolve(result) } catch { /* 忽略 */ }
            return
          }
          try { wrap.style.opacity = '0' } catch { /* 忽略 */ }
          try { wrap.style.pointerEvents = 'none' } catch { /* 忽略 */ }
          setTimeout(() => {
            try { wrap.remove() } catch { /* 已移除 */ }
            try { noDragStyle.remove() } catch { /* 已移除 */ }
          }, 260)
          try { resolve(result) } catch { /* 忽略 */ }
          try {
            const q = (typeof window !== 'undefined' && Array.isArray(window.__ysPopupPending)) ? window.__ysPopupPending : []
            if (q.length && typeof window.__yshenImportantPopup === 'function') {
              setTimeout(function () { window.__yshenImportantPopup(q.shift()) }, 260)
            }
          } catch { /* 忽略 */ }
        }
        // 2026-11-12 老板：「关闭之后没有内容了就应该变回画框」——收起内容，外框留在角落（小画卷）。
        // 做法：suspend() 把整幅缩到角落；done 置 true 防止重复；resolve(false) 让调用方继续；
        // 再把 __ysPopupShowing 放开，免得一条"收起来的"弹窗把后面的弹窗全吞了。
        // 点那张小画卷会走 resume()，那里会把 done 复位，所以还能再点开。
        const toFrame = () => {
          if (done) return
          done = true
          try { yspDiag('to-frame') } catch { /* 忽略 */ }
          try { yspPushHistory(items[0] || opts) } catch { /* 忽略 */ }
          try { suspend() } catch { try { wrap.remove() } catch { /* 忽略 */ } }
          try { resolve(false) } catch { /* 忽略 */ }
          try { if (typeof window !== 'undefined') window.__ysPopupShowing = false } catch { /* 忽略 */ }
        }
        const finish = (result) => {
          if (done) return
          done = true
          try { yspDiag('finish', { result: !!result, stay: !!_stay }) } catch { /* 忽略 */ }
          try { yspPushHistory(items[0] || opts) } catch { /* 忽略 */ }
          try { cleanup(!!(_stay && result), result) } catch {
            try { wrap.remove() } catch { /* 忽略 */ }
            try { if (typeof window !== 'undefined') window.__ysPopupShowing = false } catch { /* 忽略 */ }
          }
        }
        // 2026-11-11：按钮"点了没反应"的兜底。不靠按钮自己的监听器——在 document 上用捕获阶段拦一次：
        // 只要这一下点在弹窗里的按钮上，就直接按 data-ys-act 收尾。按钮自己的监听器要是没触发/抛错，这里照样关。
        const onClickCapture = (e) => {
          try {
            if (done) return
            const t = e && e.target
            if (!t) return
            if (!(typeof wrap.contains === 'function' && wrap.contains(t))) return
            let el = t
            while (el && el !== wrap) {
              if (el.tagName && String(el.tagName).toLowerCase() === 'button') break
              el = el.parentNode
            }
            if (!el || el === wrap) return
            const act = (el.getAttribute && el.getAttribute('data-ys-act')) || ''
            yspDiag('capture-click', { act: act, label: String(el.textContent || '').slice(0, 16) })
            if (act === 'ok') { playClick(); finish(true) }
            else if (act === 'fold') { playClick(); toFrame() }
            else if (act === 'cancel' || act === 'close') { playClick(); finish(false) }
          } catch { /* 忽略 */ }
        }
        document.addEventListener('click', onClickCapture, true)
        const onKey = (e) => { if (e.key === 'Escape') { try { yspDiag('esc') } catch { /* 忽略 */ } finish(false) } }
        document.addEventListener('keydown', onKey, true)
        // 2026-11-11：如果 wrap 曾经被设成 pointer-events:none（收拢/让位那条路留下的），
        // 弹窗看着好好的、点哪儿都没反应——所有子元素都点不到。这里在任意一次按下时自检并修回来。
        const repairPointer = () => {
          try {
            if (done || suspended) return
            if (String(wrap.style.pointerEvents || '') === 'none') {
              wrap.style.pointerEvents = 'auto'
              diag('repair-pointer')
            }
          } catch { /* 忽略 */ }
        }
        document.addEventListener('pointerdown', repairPointer, true)
        const onEnter = (e) => {
          if (e.key === 'Enter' && !e.isComposing) {
            const el = document.activeElement
            const tag = el && el.tagName ? el.tagName.toLowerCase() : ''
            if (tag === 'input' || tag === 'textarea' || (el && el.isContentEditable)) return
            e.preventDefault()
            finish(true)
          }
        }
        document.addEventListener('keydown', onEnter, true)
        // 点弹窗外面的暗色区域：按面板上选的「点空白处」来做（fold 收成画卷 / close 直接关 / none 不动）
        wrap.addEventListener('click', (e) => {
          if (e.target !== wrap) return
          try { yspDiag('backdrop', { blank: _blank, stay: !!_stay }) } catch { /* 忽略 */ }
          if (_blank === 'none') return
          if (_blank === 'close') { finish(false); return }
          try { suspend() } catch { finish(false) }
        })

        const reveal = () => {
          if (opened) return
          opened = true
          wrap.style.pointerEvents = 'auto'
          wingL.style.transform = 'none'
          wingR.style.transform = 'none'
          applyPartScale()
          crown.style.transition = 'opacity .8s ease .35s'
          crown.style.opacity = '1'
          frame.style.transition = 'opacity .8s ease .35s'
          frame.style.opacity = '1'
          bottom.style.transition = 'opacity .7s ease .55s'
          bottom.style.opacity = '1'
          content.style.opacity = '1'
          content.style.pointerEvents = 'auto'
          btnRow.style.opacity = '1'
          btnRow.style.pointerEvents = 'auto'
          wingHit.style.pointerEvents = 'auto'
          wingHitR.style.pointerEvents = 'auto'
          crownHit.style.pointerEvents = 'auto'
          axis.style.opacity = '0'
          axis.style.pointerEvents = 'none'
          // 2026-11-12 修：展开时把"未读数"那个大数字收掉。
          // 以前只在 suspend() 里设成 1、resume() 里设回 0；走别的路径（直接 reveal）就会留一个
          // 大数字压在正文上——看起来就像"字上压了一根横杠"。
          try { countEl.style.opacity = '0' } catch { /* 忽略 */ }
          setTimeout(growToFit, 90)
        }
        // 重新卷起：把两翼收回、主体藏起来（点缩小的画卷时先做这个，再展开）
        const rollUp = () => {
          opened = false
          wingL.style.transform = 'translateX(85%)'
          wingR.style.transform = 'translateX(-85%)'
          crown.style.transition = 'opacity .3s ease'
          crown.style.opacity = '0'
          frame.style.transition = 'opacity .3s ease'
          frame.style.opacity = '0'
          bottom.style.transition = 'opacity .3s ease'
          bottom.style.opacity = '0'
          content.style.transition = 'opacity .2s ease'
          content.style.opacity = '0'
          btnRow.style.opacity = '0'
          btnRow.style.pointerEvents = 'none'
          axis.style.opacity = '1'
          axis.style.pointerEvents = 'auto'
          wingHit.style.pointerEvents = 'none'
          wingHitR.style.pointerEvents = 'none'
          crownHit.style.pointerEvents = 'none'
        }
        const POS_KEY = 'yspopup.pos'
        let _memPos = null
        const clampPos = (p) => ({
          x: Math.max(40, Math.min((window.innerWidth || 1200) - 40, Number(p.x) || 0)),
          y: Math.max(40, Math.min((window.innerHeight || 800) - 40, Number(p.y) || 0)),
        })
        const readPos = () => {
          try {
            const raw = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
            if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') return clampPos(raw)
          } catch { /* 读不到走内存 */ }
          return _memPos
        }
        const savePos = (pos) => {
          _memPos = pos
          try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* 存储被拒就用内存 */ }
        }
        let lastPos = readPos()  // 上次拖到的位置（持久化，重启也记得）
        let zoom = 1         // 展开态滚轮缩放
        // 整体缩放之外，部件各自再缩/放：内框放大（k>0），外饰缩小；两端钳住，别撑破。
        const applyPartScale = () => {
          const k = zoom - 1
          const inside = 1 + k * 0.45
          const outside = Math.max(0.55, 1 - k * 0.35)
          const ins = 'scale(' + inside.toFixed(3) + ')'
          const out = 'scale(' + outside.toFixed(3) + ')'
          frame.style.transform = ins
          content.style.transform = ins
          wingL.style.transform = out
          wingR.style.transform = out
          crown.style.transform = out
          bottom.style.transform = out
        }
        const zoomStage = () => {
          stage.style.transform = 'scale(' + zoom.toFixed(3) + ')'
          applyPartScale()
        }
        const suspend = () => {
          if (suspended) return
          suspended = true
          const r = stage.getBoundingClientRect()
          const pad = Math.max(70, r.width * 0.07)
          let target
          if (lastPos) {
            target = clampPos(lastPos)
          } else {
            // 2026-11-12 老板：「又默认去了右下角」——没拖过位置时，**就地收起来**（缩在原处），
            // 不要跳到屏幕右下角；拖过就还用你拖到的那个位置。
            target = clampPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
            lastPos = target
            savePos(target)
          }
          // 和小黑板避让：画卷要落的位置如果压在黑板上，往左挪开（两者独立存在，但别叠死）
          try {
            const memoEl = document.getElementById('ysp-memo')
            if (memoEl && memoEl.style.display !== 'none') {
              const mr = memoEl.getBoundingClientRect()
              const hit = target.x + pad > mr.left && target.x - pad < mr.right && target.y + pad > mr.top && target.y - pad < mr.bottom
              if (hit) target = clampPos({ x: mr.left - pad, y: target.y })
            }
          } catch { /* 忽略 */ }
          const dx = target.x - (r.left + r.width / 2)
          const dy = target.y - (r.top + r.height / 2)
          stage.style.transformOrigin = '50% 50%'
          stage.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)'
          stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.12)'
          stage.style.cursor = 'pointer'
          stage.style.pointerEvents = 'auto'
          wrap.style.background = 'transparent'
          wrap.style.pointerEvents = 'none'
          countEl.style.opacity = '1'
        }
        const resume = () => {
          suspended = false
          done = false // 从小画卷点开 = 重新开始，按钮要能再点
          try { if (typeof window !== 'undefined') window.__ysPopupShowing = true } catch { /* 忽略 */ }
          countEl.style.opacity = '0'
          wrap.style.background = 'rgba(3,10,14,.74)'
          wrap.style.pointerEvents = 'auto'
          stage.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'
          stage.style.transform = zoom === 1 ? 'none' : 'scale(' + zoom.toFixed(3) + ')'
          // 先卷起（收回两翼、藏起主体）
          rollUp()
          // 「缩放后再打开」= 还是画卷 → 停在收拢（要再点轴心才展开）；否则直接揭幕
          if (_view.reopenView !== 'rolled') setTimeout(() => { reveal() }, reduced ? 0 : 620)
          setTimeout(() => { stage.style.cursor = 'default' }, 1200)
        }
        // 拖动：悬浮态按住画卷可拖，松手不触发点击
        let dragging = false
        let dragMoved = false
        let dragStart = null
        let dragBase = { x: 0, y: 0 }
        stage.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation() }, true)
        stage.addEventListener('dragover', (e) => e.preventDefault(), true)
        stage.addEventListener('drop', (e) => e.preventDefault(), true)
        stage.addEventListener('pointerdown', (e) => {
          if (!suspended) return
          dragging = true
          dragMoved = false
          dragStart = { x: e.clientX, y: e.clientY }
          const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(stage.style.transform || '')
          dragBase = m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 }
          stage.style.transition = 'none'
          try { stage.setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
        })
        stage.addEventListener('pointermove', (e) => {
          if (!dragging || !suspended) return
          const dx = e.clientX - dragStart.x
          const dy = e.clientY - dragStart.y
          if (Math.abs(dx) + Math.abs(dy) > 6) dragMoved = true
          stage.style.transform = 'translate(' + (dragBase.x + dx) + 'px,' + (dragBase.y + dy) + 'px) scale(.12)'
        })
        const endDrag = () => {
          if (!dragging) return
          dragging = false
          stage.style.transition = 'transform .2s ease'
          try {
            const rr = stage.getBoundingClientRect()
            lastPos = clampPos({ x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 })
            savePos(lastPos)
          } catch { /* 忽略 */ }
        }
        // 左翼装饰：展开态点一下 → 未读/最近列表
        const wingHit = document.createElement('div')
        Object.assign(wingHit.style, {
          position: 'absolute', left: '0', top: '7%', width: '17%', height: '82%',
          cursor: 'pointer', pointerEvents: 'none', zIndex: '2',
        })
        wingHit.title = '未读 / 最近'
        const wingTipL = document.createElement('div')
        wingTipL.textContent = '未读'
        Object.assign(wingTipL.style, {
          position: 'absolute', left: '50%', top: '46%', transform: 'translateX(-50%)',
          fontSize: '1.4cqw', letterSpacing: '.2em', color: T.colors.badge, opacity: '0',
          transition: 'opacity .2s ease', pointerEvents: 'none',
          textShadow: '0 2px 12px rgba(0,0,0,.9)',
        })
        wingHit.appendChild(wingTipL)
        wingHit.addEventListener('mouseenter', () => { wingL.style.filter = 'brightness(1.28)'; wingTipL.style.opacity = '1' })
        wingHit.addEventListener('mouseleave', () => { wingL.style.filter = ''; wingTipL.style.opacity = '0' })
        wingHit.addEventListener('click', (e) => {
          e.stopPropagation()
          try {
            const hist2 = yspReadHistory()
            const pend = (Array.isArray(window.__ysPopupPending) ? window.__ysPopupPending.splice(0) : [])
            const all = hist2.concat(pend).slice(0, 12)
            if (!all.length) return
            finish(false)
            setTimeout(function () {
              if (typeof window.__yshenImportantPopup === 'function') {
                window.__yshenImportantPopup({ autoExpand: true, items: all.map(function (x) { return { badge: x.badge, title: x.title, body: x.body } }) })
              }
            }, 300)
          } catch { /* 忽略 */ }
        })
        stage.appendChild(wingHit)

        // 右翼装饰：点一下 → 用量明细（今日/周/月/来源/会话）
        const wingHitR = document.createElement('div')
        Object.assign(wingHitR.style, {
          position: 'absolute', right: '0', top: '7%', width: '17%', height: '82%',
          cursor: 'pointer', pointerEvents: 'none', zIndex: '2',
        })
        wingHitR.title = '用量明细'
        const wingTipR = document.createElement('div')
        wingTipR.textContent = '用量'
        Object.assign(wingTipR.style, {
          position: 'absolute', left: '50%', top: '46%', transform: 'translateX(-50%)',
          fontSize: '1.4cqw', letterSpacing: '.2em', color: T.colors.badge, opacity: '0',
          transition: 'opacity .2s ease', pointerEvents: 'none',
          textShadow: '0 2px 12px rgba(0,0,0,.9)',
        })
        wingHitR.appendChild(wingTipR)
        wingHitR.addEventListener('mouseenter', () => { wingR.style.filter = 'brightness(1.28)'; wingTipR.style.opacity = '1' })
        wingHitR.addEventListener('mouseleave', () => { wingR.style.filter = ''; wingTipR.style.opacity = '0' })
        wingHitR.addEventListener('click', (e) => {
          e.stopPropagation()
          const fmtTok = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n))
          fetch('/yushen-popup/usage', { credentials: 'same-origin' })
            .then(function (r) { return r.json() })
            .then(function (d) {
              if (!d || !d.ok) return
              const rows = []
              rows.push({ badge: '今日', title: '¥' + Number(d.today.cost || 0).toFixed(2), body: '约 ' + fmtTok(d.today.tokens) + ' token · 余额 ¥' + Number(d.balance || 0).toFixed(2) })
              rows.push({ badge: '本周', title: '约 ' + fmtTok(d.week.tokens) + ' token', body: '¥' + Number(d.week.cost || 0).toFixed(2) })
              rows.push({ badge: '本月', title: '约 ' + fmtTok(d.month.tokens) + ' token', body: '¥' + Number(d.month.cost || 0).toFixed(2) })
              ;(d.sources || []).slice(0, 6).forEach(function (x) {
                rows.push({ badge: '来源', title: x.name + '：' + fmtTok(x.tokens) + ' token', body: '约 ¥' + Number(x.cost || 0).toFixed(2) })
              })
              ;(d.sessions || []).slice(0, 8).forEach(function (x) {
                rows.push({ badge: '会话', title: String(x.sid).replace(/^session-/, '').slice(0, 8) + '：' + fmtTok(x.tokens) + ' token', body: (x.source || '') + ' · 约 ¥' + Number(x.cost || 0).toFixed(2) })
              })
              ;(d.daily || []).slice(0, 7).forEach(function (x) {
                rows.push({ badge: x.day, title: fmtTok(x.tokens) + ' token', body: '约 ¥' + Number(x.cost || 0).toFixed(2) })
              })
              if (!rows.length) return
              finish(false)
              setTimeout(function () {
                if (typeof window.__yshenImportantPopup === 'function') {
                  window.__yshenImportantPopup({ autoExpand: true, closeOnly: true, badge: '用量明细', title: '今日 ¥' + Number(d.today.cost || 0).toFixed(2), items: rows })
                }
              }, 300)
            })
            .catch(function () { /* 忽略 */ })
        })
        stage.appendChild(wingHitR)

        // 顶冠（大王冠）：点一下 → 现在后台在忙什么（白话）
        const crownHit = document.createElement('div')
        Object.assign(crownHit.style, {
          position: 'absolute', left: '22%', top: '0', width: '56%', height: '24%',
          cursor: 'pointer', pointerEvents: 'none', zIndex: '2',
        })
        crownHit.title = '后台在忙什么'
        const crownTip = document.createElement('div')
        crownTip.textContent = '任务'
        Object.assign(crownTip.style, {
          position: 'absolute', left: '50%', top: '52%', transform: 'translateX(-50%)',
          fontSize: '1.4cqw', letterSpacing: '.2em', color: T.colors.badge, opacity: '0',
          transition: 'opacity .2s ease', pointerEvents: 'none',
          textShadow: '0 2px 12px rgba(0,0,0,.9)',
        })
        crownHit.appendChild(crownTip)
        crownHit.addEventListener('mouseenter', () => { crown.style.filter = 'brightness(1.2)'; crownTip.style.opacity = '1' })
        crownHit.addEventListener('mouseleave', () => { crown.style.filter = ''; crownTip.style.opacity = '0' })
        crownHit.addEventListener('click', (e) => {
          e.stopPropagation()
          fetch('/yushen-popup/busy', { credentials: 'same-origin' })
            .then(function (r) { return r.json() })
            .then(function (d) {
              if (!d || !d.ok) return
              const items = (d.items || []).map(function (x) {
                return { badge: x.kind || '', title: x.what || '', body: x.busy ? '在跑' : '' }
              })
              if (!items.length) items.push({ badge: '空闲', title: '现在没有在跑的任务', body: '' })
              finish(false)
              setTimeout(function () {
                if (typeof window.__yshenImportantPopup === 'function') {
                  window.__yshenImportantPopup({ autoExpand: true, closeOnly: true, badge: '后台在忙什么', title: (d.verdict && d.verdict.text) || '现在的情况', items: items })
                }
              }, 300)
            })
            .catch(function () { /* 忽略 */ })
        })
        stage.appendChild(crownHit)

        stage.addEventListener('pointerup', endDrag)
        stage.addEventListener('pointercancel', endDrag)
        stage.addEventListener('click', (e) => {
          if (!suspended) return
          e.stopPropagation()
          if (dragMoved) { dragMoved = false; return }
          resume()
        })

        const onWheel = (e) => {
          if (!opened || suspended) return
          if (!wrap.contains(e.target)) return
          // 只有「鼠标真的落在内容区/框体」上才交给滚动；舞台空白边也算场外（可缩放）
          if (content.contains(e.target)) return
          e.preventDefault()
          const dir = e.deltaY > 0 ? -1 : 1
          zoom = Math.max(0.55, Math.min(1.5, zoom + dir * 0.06))
          zoomStage()
          // 「缩放时显示」= 收拢的画卷 → 缩放一下就收起来（只动外壳）
          if (_view.zoomView === 'rolled' && zoom !== 1) rollUp()
        }
        window.addEventListener('wheel', onWheel, { passive: false })

        requestAnimationFrame(() => {
          playClick()
          wrap.style.opacity = '1'
          stage.style.opacity = '1'
          if (reduced) { reveal(); return }
          if (opts.autoExpand) { reveal(); return }
          setTimeout(() => { axis.style.opacity = '1' }, 300)
        })
      })
    }
    try { window.__yshenImportantPopup = mountImportantPopup } catch { /* window 不可用 */ }

    // 2026-11-11：显示标志看门狗。__ysPopupShowing 一旦被卡住（弹窗被删了、或某条路径忘了复位），
    // 后面所有弹窗都会只进队列不显示，界面上看着就是"点了没反应"。5 秒检查一次，DOM 里没有弹窗就复位。
    if (typeof window !== 'undefined' && typeof setInterval === 'function' && !window.__yspPopupWatchdog) {
      window.__yspPopupWatchdog = setInterval(function () {
        try {
          if (!window.__ysPopupShowing) return
          const el = (typeof document.querySelector === 'function') ? document.querySelector('[data-ys-popup]') : null
          if (el) return
          window.__ysPopupShowing = false
          const q = Array.isArray(window.__ysPopupPending) ? window.__ysPopupPending : []
          if (q.length && typeof window.__yshenImportantPopup === 'function') window.__yshenImportantPopup(q.shift())
        } catch { /* 忽略 */ }
      }, 5000)
    }

    // ── 小黑板：常驻右上角的临时备忘（最近会话自动 + 手写事项） ──
    const MEMO_KEY = 'yspopup.memo.items'
    function yspReadMemo() { try { return JSON.parse(localStorage.getItem(MEMO_KEY) || '[]') || [] } catch { return [] } }
    function yspSaveMemo(items) { try { localStorage.setItem(MEMO_KEY, JSON.stringify(items)) } catch { /* 忽略 */ } }
    // 小黑板是否在显示：用来让「常驻画卷」让位，避免两个常驻悬浮抢地方
    function yspMemoVisible() {
      try {
        const el = document.getElementById('ysp-memo')
        return !!(el && el.style.display !== 'none')
      } catch { return false }
    }

    function mountMemoBoard() {
      if (typeof document === 'undefined') return
      if (document.getElementById('ysp-memo')) return
      const T = POPUP_THEMES.blue
      const el = document.createElement('div')
      el.id = 'ysp-memo'
      el.style.cssText = 'position:fixed;right:18px;top:96px;width:min(380px,calc(100vw - 36px));z-index:2147482000;cursor:grab;user-select:none'
      const stage = document.createElement('div')
      stage.style.cssText = 'position:relative;width:100%;aspect-ratio:2366 / 1772;container-type:inline-size;transition:transform .15s ease'
      const mk = function (part, box) {
        const im = document.createElement('img')
        im.src = '/yushen-popup/assets/blue/' + part + '.png'
        im.alt = ''
        im.draggable = false
        Object.assign(im.style, { position: 'absolute', pointerEvents: 'none', userSelect: 'none', width: box.w + '%', top: box.y + '%' })
        if (box.right != null) im.style.right = box.right + '%'
        else im.style.left = box.x + '%'
        stage.appendChild(im)
        return im
      }
      mk('crown', { x: T.crown[0], y: T.crown[1], w: T.crown[2] })
      mk('left', { x: T.wingL[0], y: T.wingL[1], w: T.wingL[2] })
      mk('right', { right: T.wingR[0], y: T.wingR[1], w: T.wingR[2] })
      mk('frame', { x: T.frame[0], y: T.frame[1], w: T.frame[2] })
      mk('bottom', { x: T.bottom[0], y: T.bottom[1], w: T.bottom[2] })
      // 框内内容区
      const content = document.createElement('div')
      Object.assign(content.style, {
        position: 'absolute', left: '27%', right: '27%', top: '26%', bottom: '42%',
        display: 'flex', flexDirection: 'column', gap: '1.2cqw', overflowY: 'auto', overflowX: 'hidden',
        color: '#eaf7ff', fontSize: '3.6cqw', textShadow: '0 2px 12px rgba(0,20,40,.7)', cursor: 'default',
        padding: '0 1cqw',
      })
      const title = document.createElement('div')
      title.textContent = '小黑板'
      title.style.cssText = 'font-size:4.2cqw;font-weight:600;color:#f2fbff;letter-spacing:.1em;text-align:center'
      const memoBox = document.createElement('div')
      memoBox.style.cssText = 'display:flex;flex-direction:column;gap:1cqw'
      const addBtn = document.createElement('button')
      addBtn.textContent = '+ 添加一行'
      addBtn.style.cssText = 'margin-top:.8cqw;padding:.5cqw 1cqw;border-radius:1.2cqw;border:1px dashed rgba(140,210,255,.45);background:rgba(20,40,60,.5);color:#9fd4ff;cursor:pointer;font-size:3.2cqw'
      content.appendChild(title)
      content.appendChild(memoBox)
      content.appendChild(addBtn)
      stage.appendChild(content)
      el.appendChild(stage)
      document.body.appendChild(el)
      const applyOn = function () {
        let on = true
        try { on = localStorage.getItem('yspopup.memo.enabled') !== '0' } catch { on = true }
        el.style.display = on ? 'block' : 'none'
      }
      applyOn()
      // 2026-11-11 老板：「开关不能立刻生效，是没跑通还是要重启」——是等下一轮 30 秒的检查。
      // 现在把"现在就看一眼开关"挂出去，保存设置时立刻调。
      try { if (typeof window !== 'undefined') window.__yspMemoOn = applyOn } catch { /* 忽略 */ }
      // 拖动
      let drag = null
      el.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button,input,[contenteditable]')) return
        const r = el.getBoundingClientRect()
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }
        el.style.cursor = 'grabbing'
        try { el.setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
      })
      el.addEventListener('pointermove', function (e) {
        if (!drag) return
        const w = el.offsetWidth
        el.style.left = Math.max(0, Math.min(window.innerWidth - w, e.clientX - drag.dx)) + 'px'
        el.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy)) + 'px'
        el.style.right = 'auto'
      })
      el.addEventListener('pointerup', function () {
        if (!drag) return
        drag = null
        el.style.cursor = 'grab'
        try { localStorage.setItem('yspopup.memo.pos', JSON.stringify({ left: el.style.left, top: el.style.top })) } catch { /* 忽略 */ }
      })
      try {
        const pos = JSON.parse(localStorage.getItem('yspopup.memo.pos') || 'null')
        if (pos && pos.left && pos.top) { el.style.left = pos.left; el.style.top = pos.top; el.style.right = 'auto' }
      } catch { /* 忽略 */ }
      // 滚轮缩放
      let zoom = 1
      el.addEventListener('wheel', function (e) {
        e.preventDefault()
        zoom = Math.max(0.7, Math.min(1.6, zoom + (e.deltaY > 0 ? -0.08 : 0.08)))
        stage.style.transform = 'scale(' + zoom.toFixed(2) + ')'
        stage.style.transformOrigin = 'top left'
      }, { passive: false })
      // 待办列表
      const renderMemo = function () {
        memoBox.textContent = ''
        const items = yspReadMemo()
        items.forEach(function (it, i) {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;gap:1cqw;align-items:flex-start'
          const box = document.createElement('input')
          box.type = 'checkbox'
          box.checked = !!it.done
          box.style.cssText = 'margin-top:.4cqw;cursor:pointer'
          box.onchange = function () { items[i].done = box.checked; yspSaveMemo(items); renderMemo() }
          const txt = document.createElement('div')
          txt.contentEditable = 'true'
          txt.textContent = it.text || ''
          txt.style.cssText = 'flex:1;font-size:3.6cqw;outline:none;color:' + (it.done ? '#66748a' : '#dfe9f5') + ';text-decoration:' + (it.done ? 'line-through' : 'none') + ';min-height:4cqw;word-break:break-word;cursor:text'
          txt.onblur = function () { items[i].text = txt.textContent.trim(); yspSaveMemo(items); if (!items[i].text) { items.splice(i, 1); yspSaveMemo(items); renderMemo() } }
          txt.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); txt.blur() }
          })
          const del = document.createElement('button')
          del.textContent = '×'
          del.style.cssText = 'background:transparent;border:none;color:#66748a;cursor:pointer;font-size:3.4cqw;padding:0 .5cqw'
          del.onclick = function () { items.splice(i, 1); yspSaveMemo(items); renderMemo() }
          row.appendChild(box)
          row.appendChild(txt)
          row.appendChild(del)
          memoBox.appendChild(row)
        })
        if (!items.length) {
          const d = document.createElement('div')
          d.textContent = '点「+ 添加一行」写今天要做的事'
          d.style.cssText = 'font-size:3cqw;color:#66748a;text-align:center'
          memoBox.appendChild(d)
        }
      }
      addBtn.onclick = function () {
        const items = yspReadMemo()
        items.push({ text: '', done: false })
        yspSaveMemo(items)
        renderMemo()
        try {
          const boxes = memoBox.querySelectorAll('[contenteditable]')
          if (boxes.length) boxes[boxes.length - 1].focus()
        } catch { /* 忽略 */ }
      }
      renderMemo()
      setInterval(applyOn, 30000)
    }

    // 在消息下面的「用量 X tok」旁边标出本轮花费：优先用真实账本（能对上 tokens 的那轮），对不上才估算
    function mountInlineCost() {
      if (typeof document === 'undefined') return
      const marked = new WeakSet()
      const parseTok = function (num, unit) {
        let n = parseFloat(num)
        if (!isFinite(n)) return 0
        if (unit === 'K' || unit === 'k') n *= 1000
        else if (unit === 'M' || unit === 'm') n *= 1000000
        else if (unit === 'W' || unit === 'w' || unit === '万') n *= 10000
        return Math.round(n)
      }
      const estimate = function (tokens) {
        const peak = yspIsPeak(Date.now())
        const p = YSP_PRICE[peak ? 'peak' : 'off']
        return (tokens * (0.99 * p.hit + 0.01 * p.miss)) / 1e6 * YSP_USD_CNY
      }
      let realCache = null
      const loadReal = function () {
        fetch('/yushen-popup/real', { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d && d.ok) realCache = d })
          .catch(function () { /* 忽略 */ })
      }
      loadReal()
      setInterval(loadReal, 60000)
      // 在真实账本里找 tokens 对得上的那轮（误差 < 2%），用它的真实 cost
      const matchCost = function (tokens) {
        try {
          if (!realCache || !Array.isArray(realCache.recent)) return null
          for (let i = realCache.recent.length - 1; i >= 0; i--) {
            const e = realCache.recent[i]
            const et = Number(e.tokens) || 0
            if (et && Math.abs(et - tokens) / Math.max(tokens, 1) < 0.02) return Number(e.cost) || null
          }
        } catch { /* 忽略 */ }
        return null
      }
      const mark = function () {
        if (document.hidden) return
        try {
          if (localStorage.getItem('yspopup.inlineCost') === '0') return
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          let n
          while ((n = walker.nextNode())) {
            const t = n.nodeValue || ''
            const m = /用量\s*([\d.]+)\s*([KMW万]?)\s*tok/i.exec(t)
            if (!m) continue
            const parent = n.parentElement
            if (!parent || marked.has(parent) || parent.hasAttribute('data-ysp-cost-parent')) continue
            if (parent.closest('#ysp-memo, #ysp-cd-choice, [data-ys-popup], [data-ysp-cost]')) continue
            if (parent.querySelector('[data-ysp-cost]')) continue
            if (String(parent.textContent || '').indexOf('¥') >= 0) continue
            const tokens = parseTok(m[1], m[2])
            if (!tokens) continue
            const real = matchCost(tokens)
            const cost = real != null ? real : estimate(tokens)
            const span = document.createElement('span')
            span.setAttribute('data-ysp-cost', '1')
            span.textContent = ' · ' + (real != null ? '¥' : '约 ¥') + cost.toFixed(2)
            span.style.cssText = 'margin-left:6px;color:#9fd4ff;font-size:11px;opacity:.85;cursor:default'
            parent.appendChild(span)
            parent.setAttribute('data-ysp-cost-parent', '1')
            marked.add(parent)
          }
        } catch { /* 忽略 */ }
      }
      mark()
      // 保存设置后立刻重扫一遍（不然要等下一次 DOM 变化才生效）
      try { if (typeof window !== 'undefined') window.__yspInlineOn = mark } catch { /* 忽略 */ }
      let lastMark = 0
      try {
        const obs = new MutationObserver(function () {
          const now = Date.now()
          if (now - lastMark < 1500) return
          lastMark = now
          mark()
        })
        obs.observe(document.body, { childList: true, subtree: true })
      } catch { /* 忽略 */ }
    }


    // ── 弹窗控制台（后台独立页面：左侧分类 + 右侧开关） ──
    const TABS = [
      ['display', '展示方式'], ['feel', '手感'], ['reminder', '提醒'], ['theme', '主题'], ['font', '字体美化'], ['jobs', '任务'], ['usage', '用法'],
    ]
    const LABEL = { display: '展示方式', feel: '手感', theme: '主题', font: '字体美化', usage: '用法' }

    function AdminPage() {
      const [tab, setTab] = React.useState('display')
      const [cfg, setCfg] = React.useState(null)
      const [msg, setMsg] = React.useState('')
      // 任务页数据（hooks 必须在组件顶层，不能写在分支里）
      const [busy, setBusy] = React.useState(null)
      const [realUsage, setRealUsage] = React.useState(null)
      React.useEffect(function () {
        let live = true
        const load = function () {
          fetch('/yushen-popup/real', { credentials: 'same-origin' })
            .then(function (r) { return r.json() })
            .then(function (d) { if (live && d && d.ok) setRealUsage(d) })
            .catch(function () { /* 忽略 */ })
        }
        load()
        const t = setInterval(load, 30000)
        return function () { live = false; clearInterval(t) }
      }, [])
      const [sessWin, setSessWin] = React.useState(60)
      const [sessTick, setSessTick] = React.useState(0)
      React.useEffect(function () {
        const t = setInterval(function () { setSessTick(function (x) { return x + 1 }) }, 5000)
        return function () { clearInterval(t) }
      }, [])
      React.useEffect(function () {
        let live = true
        const load = function () {
          fetch('/yushen-popup/busy', { credentials: 'same-origin' })
            .then(function (r) { return r.json() })
            .then(function (d) { if (live && d && d.ok) setBusy(d) })
            .catch(function () { /* 忽略 */ })
        }
        load()
        const t = setInterval(load, 5000)
        return function () { live = false; clearInterval(t) }
      }, [])
      React.useEffect(function () {
        fetch('/yushen-popup/config', { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d && d.ok) setCfg(d.config) })
          .catch(function () { /* 忽略 */ })
      }, [])
      const save = function (quiet) {
        if (!quiet) setMsg('保存中…')
        fetch('/yushen-popup/config', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cfg),
        }).then(function (r) { return r.json() }).then(function (d) {
          if (d && d.ok) {
            setCfg(d.config)
            try {
              localStorage.setItem('yspopup.font', JSON.stringify({
                fontFamily: cfg.fontFamily || '', fontSize: cfg.fontSize || '',
                textColor: cfg.textColor || '', accentColor: cfg.accentColor || '', titleColor: cfg.titleColor || '', strokeColor: cfg.strokeColor || '', strokeWidth: Number(cfg.strokeWidth) || 0, fontWeight: cfg.fontWeight || '',
                scheme: cfg.scheme || 'dark', buttonStyle: cfg.buttonStyle || 'crystal', sound: cfg.sound !== false,
              }))
            } catch { /* 忽略 */ }
            try { localStorage.setItem('yspopup.view', JSON.stringify({ zoomView: cfg.zoomView || 'expanded', reopenView: cfg.reopenView || 'expanded' })) } catch { /* 忽略 */ }
            try { localStorage.setItem('yspopup.blankAction', cfg.blankAction || 'fold') } catch { /* 忽略 */ }
            try { localStorage.setItem('yspopup.memo.enabled', cfg.memoEnabled === false ? '0' : '1') } catch { /* 忽略 */ }
            try { localStorage.setItem('yspopup.inlineCost', cfg.inlineCost === false ? '0' : '1') } catch { /* 忽略 */ }
            try { localStorage.setItem('yspopup.memo.auto', cfg.memoAutoSessions ? '1' : '0') } catch { /* 忽略 */ }
            // 2026-11-11 老板：「不能改成立刻生效吗」——能。保存完当场把受开关控制的那几处重跑一遍，
            // 不用等 30~60 秒的定时检查，更不用重启。
            try { if (window.__yspMemoOn) window.__yspMemoOn() } catch { /* 忽略 */ }
            try { if (window.__yspInlineOn) window.__yspInlineOn() } catch { /* 忽略 */ }
            try { if (window.__yspApplyChatColors) window.__yspApplyChatColors() } catch { /* 忽略 */ }
            try { if (window.__yspReloadCfg) window.__yspReloadCfg() } catch { /* 忽略 */ }
            if (!quiet) setMsg('已保存')
          } else setMsg('没存成')
        }).catch(function (e) { setMsg('没存成：' + String(e && e.message || e)) })
      }
      // 2026-11-11 老板：「后台的开关不能立刻生效，是没跑通还是要重启」——两者都不是，是**要按保存**。
      // 现在改成：改一下就自动存（500 毫秒防抖），存完立刻应用到界面，不用再找保存键。
      let autoSaveTimer = null
      const scheduleAutoSave = function () {
        try {
          if (autoSaveTimer) clearTimeout(autoSaveTimer)
          autoSaveTimer = setTimeout(function () { autoSaveTimer = null; try { save(true) } catch { /* 忽略 */ } }, 500)
        } catch { /* 忽略 */ }
      }
      const set = function (patch) {
        setCfg(Object.assign({}, cfg, patch))
        scheduleAutoSave()
      }
      // 会话染色配置（字体美化页的「会话」块用）
      const setChat = function (patch) {
        const cur = (cfg && cfg.chatColors) || {}
        const next = Object.assign({ on: true, mine: '#dff1ff', theirs: '#e6eef7', fontFamily: '', fontSize: '' }, cur, patch)
        set({ chatColors: next })
        try { localStorage.setItem('yspopup.chatColors', JSON.stringify(next)) } catch { /* 忽略 */ }
        try { if (window.__yspApplyChatColors) window.__yspApplyChatColors() } catch { /* 忽略 */ }
      }
      const getDeep = function (key) {
        const parts = String(key).split('.')
        let v = cfg
        for (let i = 0; i < parts.length; i++) v = v ? v[parts[i]] : undefined
        return v
      }
      const setDeep = function (key, val) {
        const parts = String(key).split('.')
        if (parts.length === 1) { set({ [key]: val }); return }
        const root = Object.assign({}, cfg[parts[0]] || {})
        root[parts[1]] = val
        set({ [parts[0]]: root })
      }
      const check = function (key, label) {
        return h('label', { style: S.check }, h('input', {
          type: 'checkbox', checked: !!getDeep(key),
          onChange: function (e) { setDeep(key, e.target.checked) },
        }), label)
      }
      const radio = function (key, value, label, current) {
        return h('label', { style: S.check }, h('input', {
          type: 'radio', name: key, checked: (current !== undefined ? current : cfg && cfg[key]) === value,
          onChange: function () { set({ [key]: value }) },
        }), label)
      }
      const bar = function (text) { return h('div', { style: S.bar }, text) }
      if (!cfg) return h('div', { style: S.loading }, '读取中…')

      let body = null
      if (tab === 'display') {
        body = h('div', null,
          bar('弹出方式 — 弹出时带不带仪式感'),
          radio('mode', 'auto', '直接通知（弹出即展开，不搞仪式）'),
          radio('mode', 'ritual', '卷轴仪式（弹出是收拢画卷，点开才展开）'),
          bar('要紧的事 — 跳过仪式，直接给你看'),
          check('urgentDirect', '紧急的事不搞仪式，直接展开'),
          bar('关掉的时候 — 点「好/知道了」和点弹窗外面各做什么'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: (function () { try { return localStorage.getItem('yspopup.stay') === '1' } catch { return false } })(),
            onChange: function (e) { try { localStorage.setItem('yspopup.stay', e.target.checked ? '1' : '0') } catch { /* 忽略 */ } set({ stayOnClose: e.target.checked }) },
          }), '确认键保留悬浮窗（关掉后收成小画卷留在屏幕；不开就是直接消失）'),
          bar('点弹窗外面 — 做什么'),
          radio('blankAction', 'fold', '收成画卷（留屏）'),
          radio('blankAction', 'close', '直接关闭'),
          radio('blankAction', 'none', '什么都不做'),
          bar('卷起来的画卷 — 滚轮缩小时长什么样、再点开又是什么'),
          radio('zoomView', 'expanded', '缩放时保持展开（能看到内容）'),
          radio('zoomView', 'rolled', '缩放时收拢成画卷（只有外壳）'),
          radio('reopenView', 'expanded', '点开时直接展开'),
          radio('reopenView', 'rolled', '点开时还是收拢（要再点一下）'),
          bar('桌面上的小东西 — 常驻备忘、花费标签'),
          check('memoEnabled', '显示小黑板（常驻右上角的临时备忘）'),
          check('memoAutoSessions', '小黑板里自动列出最近会话（默认关，黑板保持空白）'),
          check('inlineCost', '在消息下面的「用量 X tok」旁显示本轮花费'),
          h('div', { style: { color: '#999', fontSize: '12px' } }, '小黑板可拖动、可折叠；手写事项存在本地，重启不丢。'))
      } else if (tab === 'feel') {
        body = h('div', null,
          bar('声音 — 点击弹窗时是否出声'),
          check('sound', '点击水声'),
          bar('缩小后的画卷 — 收成小画卷后可以拖到哪'),
          check('draggable', '可以拖动'),
          check('rememberPos', '记住拖动后的位置（不跳回默认）'),
          bar('反馈 — 鼠标移到能点的东西上时的提示'),
          check('hoverFx', '悬停时有反馈（提亮 / 稍后提示）'))
      } else if (tab === 'reminder') {
        const ta = (cfg && cfg.tokenAlert) || {}
        const setTa = function (patch) { set({ tokenAlert: Object.assign({}, ta, patch) }) }
        const peakNow = (function () { try { return window.__yspIsPeak ? window.__yspIsPeak(Date.now()) : null } catch { return null } })()
        body = h('div', null,
          bar('会话 token 提醒 — 每轮成本 / 累计花费 / 上下文容量，三条线各自可调'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: ta.enabled !== false,
            onChange: function (e) { setTa({ enabled: e.target.checked }) },
          }), '总开关（开着）'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: ta.checkOnOpen !== false,
            onChange: function (e) { setTa({ checkOnOpen: e.target.checked }) },
          }), '每次打开页面检查一次'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: !!ta.repeatOnOpen,
            onChange: function (e) { setTa({ repeatOnOpen: e.target.checked }) },
          }), '重启后同一会话也再提醒（默认关：每会话每级只提醒一次）'),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.otherSessionAlert !== false,
            onChange: function (e) { setTa({ otherSessionAlert: e.target.checked }) } }), '其他会话完成一轮时也提醒（不切过去也弹）'),
          h('div', { style: S.row }, h('span', { style: S.key }, '其他会话'),
            h('input', { type: 'number', min: 60, max: 600, step: 60, style: S.num, value: ta.otherIntervalSec || 300,
              onChange: function (e) { setTa({ otherIntervalSec: Math.max(60, Number(e.target.value) || 300) }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '秒一次（默认 300 = 5 分钟）')),

          bar('成本线 — 超过就弹（¥，按当前峰谷和缓存估算）'),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.roundEnabled === true,
            onChange: function (e) { setTa({ roundEnabled: e.target.checked }) } }), '每轮成本线开着'),
          h('div', { style: S.row }, h('span', { style: S.key }, '每轮'),
            h('input', { type: 'number', min: 0.01, step: 0.01, style: S.num, value: ta.roundLine || 0.1,
              onChange: function (e) { setTa({ roundLine: Number(e.target.value) || 0.1 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '¥/轮 — 参考：上下文 8 万、峰时全价约 ¥0.17/轮')),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.totalEnabled !== false,
            onChange: function (e) { setTa({ totalEnabled: e.target.checked }) } }), '累计花费线开着'),
          h('div', { style: S.row }, h('span', { style: S.key }, '累计'),
            h('input', { type: 'number', min: 1, step: 1, style: S.num, value: ta.totalLine || 10,
              onChange: function (e) { setTa({ totalLine: Number(e.target.value) || 10 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '¥，之后每 +'),
            h('input', { type: 'number', min: 1, step: 1, style: S.num, value: ta.totalStep || 10,
              onChange: function (e) { setTa({ totalStep: Number(e.target.value) || 10 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '¥ 再提醒一次（估算）')),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.contextEnabled !== false,
            onChange: function (e) { setTa({ contextEnabled: e.target.checked }) } }), '上下文容量线开着'),
          h('div', { style: S.row }, h('span', { style: S.key }, '容量'),
            h('input', { type: 'number', min: 10000, step: 10000, style: S.num, value: ta.contextLimit || 500000,
              onChange: function (e) { setTa({ contextLimit: Number(e.target.value) || 500000 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, 'token — 上限 100 万，默认 50 万')),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '6px' } }, '默认：每轮线**关**（消息下面的小标已经写着本轮花费）；累计线开，¥10 起、每 +¥10 再提醒；容量线开，50 万 tok。三条各管各的，互不影响。'),

          bar('频率与静默'),
          h('div', { style: S.row }, h('span', { style: S.key }, '检查'),
            h('input', { type: 'number', min: 60, max: 3600, step: 60, style: S.num, value: ta.intervalSec || 300,
              onChange: function (e) { setTa({ intervalSec: Math.max(60, Number(e.target.value) || 300) }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '秒一次（默认 300 = 5 分钟；页面隐藏时暂停）')),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.quietEnabled !== false,
            onChange: function (e) { setTa({ quietEnabled: e.target.checked }) } }), '启用静默时段（这个时段只记录不弹）'),
          h('div', { style: S.row }, h('span', { style: S.key }, '静默'),
            h('input', { type: 'number', min: 0, max: 23, step: 1, style: S.num, value: ta.quietStart != null ? ta.quietStart : 0,
              onChange: function (e) { setTa({ quietStart: Number(e.target.value) || 0 }) } }),
            h('span', null, '—'),
            h('input', { type: 'number', min: 0, max: 24, step: 1, style: S.num, value: ta.quietEnd != null ? ta.quietEnd : 8,
              onChange: function (e) { setTa({ quietEnd: Number(e.target.value) || 8 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '点 — 这个时段只记录不弹')),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.limitEnabled !== false,
            onChange: function (e) { setTa({ limitEnabled: e.target.checked }) } }), '启用每小时限弹（防刷屏）'),
          h('div', { style: S.row }, h('span', { style: S.key }, '限弹'),
            h('input', { type: 'number', min: 1, max: 20, step: 1, style: S.num, value: ta.maxPerHour || 3,
              onChange: function (e) { setTa({ maxPerHour: Number(e.target.value) || 3 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '次/小时 — 防刷屏')),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: !!ta.silentMode,
            onChange: function (e) { setTa({ silentMode: e.target.checked }) },
          }), '只记录不弹（后台看曲线，不打扰）'),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.crossSessionAlert !== false,
            onChange: function (e) { setTa({ crossSessionAlert: e.target.checked }) } }), '切回会话时提醒（其他会话期间涨了也提醒）'),

          bar('稍后（CD）与强制提醒'),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.cdEnabled !== false,
            onChange: function (e) { setTa({ cdEnabled: e.target.checked }) } }), '启用「稍后」CD'),
          h('div', { style: S.row }, h('span', { style: S.key }, '稍后'),
            h('input', { type: 'number', min: 5, max: 120, step: 5, style: S.num, value: ta.cdMinutes || 10,
              onChange: function (e) { setTa({ cdMinutes: Number(e.target.value) || 10 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '分钟 — 点「稍后」等这么久；连续稍后自动翻倍（上限 2 小时）')),
          h('label', { style: S.check }, h('input', { type: 'checkbox', checked: ta.forceEnabled !== false,
            onChange: function (e) { setTa({ forceEnabled: e.target.checked }) } }), '启用强制提醒（贵到爆时无视稍后）'),
          h('div', { style: S.row }, h('span', { style: S.key }, '强制'),
            h('input', { type: 'number', min: 0.1, step: 0.1, style: S.num, value: ta.forceRoundLine || 0.5,
              onChange: function (e) { setTa({ forceRoundLine: Number(e.target.value) || 0.5 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '¥/轮 或 上下文 ≥'),
            h('input', { type: 'number', min: 0.5, max: 0.99, step: 0.05, style: S.num, value: ta.forceContextPct || 0.8,
              onChange: function (e) { setTa({ forceContextPct: Number(e.target.value) || 0.8 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '×上限 — 无视 CD 强制提醒一次（每小时最多 1 次）')),

          bar('缓存与数据'),
          h('div', { style: S.row }, h('span', { style: S.key }, '缓存'),
            h('select', { value: String(ta.cacheManual ? 'manual' : 'auto'),
              onChange: function (e) {
                if (e.target.value === 'auto') setTa({ cacheManual: false })
                else setTa({ cacheManual: true, cacheAssumption: ta.cacheAssumption || 0.8 })
              } },
              h('option', { value: 'auto' }, '自动估算（80%）'),
              h('option', { value: 'manual' }, '手动')),
            h('input', { type: 'number', min: 0, max: 100, step: 5, style: S.num, value: Math.round((ta.cacheAssumption || 0.8) * 100),
              disabled: !ta.cacheManual,
              onChange: function (e) { setTa({ cacheAssumption: (Number(e.target.value) || 80) / 100 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '% 命中（只影响估算，不影响真实账单）')),
          h('div', { style: S.row }, h('span', { style: S.key }, '冷档'),
            h('input', { type: 'number', min: 1, max: 30, step: 1, style: S.num, value: ta.coldDays || 3,
              onChange: function (e) { setTa({ coldDays: Number(e.target.value) || 3 }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '天 — 这么久没打开的会话清掉提醒状态（不删聊天记录）')),
          peakNow !== null ? h('div', { style: { color: '#9fd4ff', fontSize: '12px', marginTop: '4px' } },
            '现在是' + (peakNow ? '峰时（全价）' : '谷时（半价）') + ' · 峰时=工作日 9-12/14-18，其余含周末全天都是谷时') : null,
          h('div', { style: { marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' } },
            h('button', { style: S.btn, onClick: function () { try { window.__yspTokenCheck && window.__yspTokenCheck() ; setMsg('已检查一次') } catch { setMsg('检查失败') } } }, '立即检查一次'),
            h('button', { style: S.btn, onClick: function () { try { localStorage.removeItem('yspopup.sessions'); setMsg('已清空会话提醒状态') } catch { setMsg('清空失败') } } }, '清空提醒状态')),

          bar('确认后做什么（都要点弹窗的确认才执行，不做全自动）'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: !!(ta.actions && ta.actions.summarize),
            onChange: function (e) { setTa({ actions: Object.assign({}, ta.actions, { summarize: e.target.checked }) }) },
          }), '确认后帮我总结'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: !!(ta.actions && ta.actions.newSession),
            onChange: function (e) { setTa({ actions: Object.assign({}, ta.actions, { newSession: e.target.checked }) }) },
          }), '确认后开新会话'),

          bar('哪些事件弹 — 勾上的事件才会弹窗提醒'),
          check('events.incident', '出问题'),
          check('events.ask', '有人找你'),
          check('events.restart', '重启确认'),
          bar('接收哪些来源的事件（QQ / B站 / 本机 / 以后的新机器）'),
          h('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap' } },
            [['qq', 'QQ'], ['bili', 'B站'], ['local', '本机']].map(function (pair) {
              return h('label', { key: pair[0], style: { display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: !(cfg.sources && cfg.sources[pair[0]] === false),
                  onChange: function (e) {
                    set({ sources: Object.assign({}, cfg.sources || {}, { [pair[0]]: e.target.checked }) })
                  },
                }),
                pair[1])
            })),
          // 2026-11-11 老板：「备份这种提醒的可以开关，我们有备份机制别人不一定有，所以出厂有些默认是关」
          h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer', marginTop: '8px', color: '#cfe9ff' } },
            h('input', {
              type: 'checkbox',
              checked: !!(cfg.sources && cfg.sources.backup === true),
              onChange: function (e) { set({ sources: Object.assign({}, cfg.sources || {}, { backup: e.target.checked }) }) },
            }),
            '备份完成提醒（默认关：这是鱼神自己的备份机制，别人不一定有）'),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '4px' } },
            '外部推事件用 POST /yushen-popup/event（{ source, badge, title, body }），推来就弹。'),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '6px' } },
            '提醒会写：为什么弹 / 现在峰还是谷 / 上下文多少 / 每轮约多少钱 / 累计约多少 / 建议。数据来源：页面「用量 X tok」（估算，不是账单）。'),
          h('div', { style: { marginTop: '18px' } },
            bar('真实账本 — DSH 自己的用量文件，和平台账单对齐（不是估算）'),
            realUsage ? h('div', null,
              h('div', { style: { fontSize: '13px', marginBottom: '4px' } },
                '今日真实：¥' + Number(realUsage.todayUsage || 0).toFixed(2) + '（账本 records 合计 ¥' + Number(realUsage.todayEventsCost || 0).toFixed(2) + '，' + Number(realUsage.todayEventsCount || 0) + ' 轮）'),
              h('div', { style: { fontSize: '13px', marginBottom: '4px' } }, '余额：¥' + Number(realUsage.lastBalance || 0).toFixed(2)),
              h('div', { style: { color: '#999', fontSize: '12px', marginBottom: '2px' } }, '最近几轮真实花费：'),
              (realUsage.recent || []).slice().reverse().map(function (e, i) {
                return h('div', { key: String(i), style: { display: 'flex', gap: '10px', fontSize: '12px', padding: '2px 0', color: '#aab6c6' } },
                  h('span', { style: { minWidth: '58px', color: '#66748a' } }, String(e.at || '').slice(11, 19)),
                  h('span', { style: { minWidth: '70px' } }, '¥' + Number(e.cost || 0).toFixed(4)),
                  h('span', { style: { color: '#66748a' } }, e.tokens ? (e.tokens / 10000).toFixed(0) + ' 万 tok' : ''))
              })) : h('div', { style: { color: '#999', fontSize: '12px' } }, '读取中…')),
          h('div', { style: { marginTop: '18px' } },
            bar('最近会话 — 过去多久里用过几个（只统计弹窗检测过的）'),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              [[30, '30 分钟'], [60, '1 小时'], [180, '3 小时'], [1440, '24 小时']].map(function (pair) {
                return h('button', {
                  key: String(pair[0]),
                  style: Object.assign({}, S.btn, sessWin === pair[0] ? { background: 'rgba(120,190,255,.25)', borderColor: 'rgba(160,220,255,.7)' } : {}),
                  onClick: function () { setSessWin(pair[0]) },
                }, pair[1])
              })),
            (function () {
              void sessTick
              try {
                const now = Date.now()
                const all = yspReadSessions()
                const cur = yspSessionKey() || 'main'
                const list = Object.keys(all).map(function (k) {
                  const s = all[k] || {}
                  return { key: k, last: Number(s.lastSeenAt) || 0, tokens: Number(s.tokens) || 0, spent: Number(s.spentEst) || 0, rounds: Number(s.rounds) || 0, reminded: s.reminded || {} }
                }).filter(function (x) { return now - x.last <= sessWin * 60000 }).sort(function (a, b) { return b.last - a.last })
                if (!list.length) return h('div', { style: { color: '#999', fontSize: '12px', marginTop: '6px' } }, '这段时间没有检测到会话活动（页面刚打开还没读到用量也算没活动）')
                return h('div', { style: { marginTop: '6px' } }, list.map(function (x, i) {
                  const isCur = x.key === cur
                  const mins = Math.max(0, Math.round((now - x.last) / 60000))
                  const grew = x.rounds > 0 && !x.reminded.round
                  return h('div', { key: String(i), style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.06)' } },
                    h('span', { style: { minWidth: '52px', color: isCur ? '#9fd4ff' : '#ccc', fontSize: '12px', fontWeight: isCur ? 600 : 400 } }, isCur ? '当前' : '其他'),
                    h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' } }, x.key.indexOf('::') >= 0 ? String(x.key.split('::')[1] || x.key).slice(0, 18) : x.key.slice(-8)),
                    h('span', { style: { color: '#999', fontSize: '12px', minWidth: '58px' } }, mins === 0 ? '刚刚' : mins + ' 分钟前'),
                    h('span', { style: { color: '#999', fontSize: '12px', minWidth: '64px' } }, '约 ' + yspFmt(x.tokens) + ' tok'),
                    h('span', { style: { color: '#999', fontSize: '12px', minWidth: '64px' } }, '累计 ¥' + (Math.round(x.spent * 100) / 100).toFixed(2)),
                    grew ? h('span', { style: { color: '#ffb347', fontSize: '11px' } }, '有增长、未提醒') : null)
                }))
              } catch { return null }
            })(),
            h('div', { style: { color: '#999', fontSize: '12px', marginTop: '4px' } },
              '「有增长、未提醒」= 这个会话检测到增长后还没弹过提醒（近似“跑完了还没处理”）。当前会话高亮；数字是估算。')))
      } else if (tab === 'theme') {
        body = h('div', null,
          bar('主题 — 弹窗用哪种颜色：蓝=平时，红=警醒，默认=两者自动分配'),
          radio('themeMode', 'blue', '只用蓝（平时）'),
          radio('themeMode', 'red', '只用红（警醒）'),
          radio('themeMode', 'auto', '默认（蓝平常 + 红警醒）'),
          bar('红蓝图 — 决定弹窗颜色范围（全部/只蓝/只红）'),
          radio('themeScope', 'all', '全部弹（默认）'),
          radio('themeScope', 'blue', '只弹蓝'),
          radio('themeScope', 'red', '只弹红'),
          bar('事件 → 颜色 — 每类事件用哪种颜色的画卷'),
          [['incident', '出问题'], ['ask', '有人找你'], ['restart', '重启确认']].map(function (pair) {
            return h('div', { key: pair[0], style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '4px 0' } },
              h('span', { style: { minWidth: '90px' } }, pair[1]),
              h('select', {
                value: (cfg.eventColors && cfg.eventColors[pair[0]]) || 'blue',
                onChange: function (e) {
                  set({ eventColors: Object.assign({}, cfg.eventColors || {}, { [pair[0]]: e.target.value }) })
                },
              },
                h('option', { value: 'blue' }, '蓝'),
                h('option', { value: 'red' }, '红')))
          }),
          bar('按钮风格 — 弹窗里按钮长什么样'),
          radio('buttonStyle', 'crystal', '水晶（渐变 + 高光 + 发光）'),
          radio('buttonStyle', 'glass', '玻璃（半透明 + 细边）'),
          radio('buttonStyle', 'gold', '金边（深底 + 金线）'))
      } else if (tab === 'font') {
        body = h('div', null,
          bar('字体样式 — 弹窗里的字用什么字体、多大'),
          h('div', { style: S.row }, h('span', { style: S.key }, '字体'),
            h('select', { value: cfg.fontFamily || '', onChange: function (e) { set({ fontFamily: e.target.value }) } },
              h('option', { value: '' }, '默认'),
              h('option', { value: 'Microsoft YaHei' }, '微软雅黑'),
              h('option', { value: 'SimSun' }, '宋体'),
              h('option', { value: 'KaiTi' }, '楷体'))),
          h('div', { style: S.row }, h('span', { style: S.key }, '字号'),
            h('select', { value: cfg.fontSize || '', onChange: function (e) { set({ fontSize: e.target.value }) } },
              h('option', { value: '' }, '中'),
              h('option', { value: 'small' }, '小'),
              h('option', { value: 'large' }, '大'))),
          bar('颜色 — 标题/正文/强调，分别对应弹窗里的三种字'),
          h('div', { style: S.row }, h('span', { style: S.key }, '标题'),
            h('input', { type: 'color', value: cfg.titleColor || '#f2fbff', onChange: function (e) { set({ titleColor: e.target.value }) } }),
            h('button', { style: S.btn, onClick: function () { set({ titleColor: '' }) } }, '默认')),
          h('div', { style: S.row }, h('span', { style: S.key }, '正文'),
            h('input', { type: 'color', value: cfg.textColor || '#eaf7ff', onChange: function (e) { set({ textColor: e.target.value }) } }),
            h('button', { style: S.btn, onClick: function () { set({ textColor: '' }) } }, '默认')),
          h('div', { style: S.row }, h('span', { style: S.key }, '强调'),
            h('input', { type: 'color', value: cfg.accentColor || '#7fd4ff', onChange: function (e) { set({ accentColor: e.target.value }) } }),
            h('button', { style: S.btn, onClick: function () { set({ accentColor: '' }) } }, '默认')),
          h('div', { style: S.row }, h('span', { style: S.key }, '描边色'),
            h('input', { type: 'color', value: cfg.strokeColor || '#ffffff', onChange: function (e) { set({ strokeColor: e.target.value }) } }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, '字的轮廓色')),
          h('div', { style: S.row }, h('span', { style: S.key }, '描边宽'),
            h('input', {
              type: 'range', min: '0', max: '4', step: '0.5', value: cfg.strokeWidth || 0,
              onChange: function (e) { set({ strokeWidth: Number(e.target.value) }) },
              style: { width: '160px' },
            }), h('span', { style: { color: '#999', fontSize: '12px' } }, String(cfg.strokeWidth || 0) + 'px（0=不描边）')),
          h('div', { style: S.row }, h('span', { style: S.key }, '粗细'),
            h('select', {
              value: String(cfg.fontWeight || ''),
              onChange: function (e) { set({ fontWeight: e.target.value }) },
            },
              h('option', { value: '' }, '常规'),
              h('option', { value: '300' }, '细'),
              h('option', { value: '600' }, '半粗'),
              h('option', { value: '700' }, '粗'),
              h('option', { value: '900' }, '特粗'))),
          bar('深浅 — 弹窗整体暗一点还是亮一点'),
          radio('scheme', 'dark', '深色（默认）'),
          radio('scheme', 'light', '浅色'),
          bar('会话 — 对话界面里你的消息 / 我的消息（只改字，不动布局）'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: ((cfg.chatColors || {}).on !== false),
            onChange: function (e) { setChat({ on: e.target.checked }) },
          }), '开着'),
          h('div', { style: S.row }, h('span', { style: S.key }, '字体'),
            h('select', { value: (cfg.chatColors || {}).fontFamily || '', onChange: function (e) { setChat({ fontFamily: e.target.value }) } },
              h('option', { value: '' }, '默认'),
              h('option', { value: 'Microsoft YaHei' }, '微软雅黑'),
              h('option', { value: 'SimSun' }, '宋体'),
              h('option', { value: 'KaiTi' }, '楷体'))),
          h('div', { style: S.row }, h('span', { style: S.key }, '字号'),
            h('select', { value: (cfg.chatColors || {}).fontSize || '', onChange: function (e) { setChat({ fontSize: e.target.value }) } },
              h('option', { value: '' }, '中'),
              h('option', { value: 'small' }, '小'),
              h('option', { value: 'large' }, '大'))),
          h('div', { style: S.row }, h('span', { style: S.key }, '你的消息'),
            h('input', { type: 'color', value: (cfg.chatColors || {}).mine || '#dff1ff', onChange: function (e) { setChat({ mine: e.target.value }) } })),
          h('div', { style: S.row }, h('span', { style: S.key }, '我的消息'),
            h('input', { type: 'color', value: (cfg.chatColors || {}).theirs || '#e6eef7', onChange: function (e) { setChat({ theirs: e.target.value }) } })),
          h('div', { style: S.row }, h('span', { style: S.key }, '会话描边'),
            h('input', { type: 'color', value: (cfg.chatColors || {}).strokeColor || '#ffffff', onChange: function (e) { setChat({ strokeColor: e.target.value }) } }),
            h('input', {
              type: 'range', min: '0', max: '4', step: '0.5', value: (cfg.chatColors || {}).strokeWidth || 0,
              onChange: function (e) { setChat({ strokeWidth: Number(e.target.value) }) },
              style: { width: '120px' },
            }),
            h('span', { style: { color: '#999', fontSize: '12px' } }, String((cfg.chatColors || {}).strokeWidth || 0) + 'px')),
          h('div', { style: S.row }, h('span', { style: S.key }, '会话粗细'),
            h('select', {
              value: String((cfg.chatColors || {}).weight || ''),
              onChange: function (e) { setChat({ weight: e.target.value }) },
            },
              h('option', { value: '' }, '常规'),
              h('option', { value: '300' }, '细'),
              h('option', { value: '600' }, '半粗'),
              h('option', { value: '700' }, '粗'),
              h('option', { value: '900' }, '特粗'))),
          h('div', { style: { marginTop: '8px' } },
            h('button', {
              style: S.btn,
              onClick: function () { setChat({ on: true, mine: '#dff1ff', theirs: '#e6eef7', fontFamily: '', fontSize: '' }); setMsg('会话颜色已还原默认') },
            }, '会话还原默认')),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '4px' } },
            'DSH 升级后类名可能变，失效了告诉我重新对。'),
          h('div', { style: { marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' } },
            h('button', {
              style: S.btn,
              onClick: function () {
                set({ fontFamily: '', fontSize: '', textColor: '', accentColor: '', titleColor: '', scheme: 'dark' })
                setMsg('字体/颜色已恢复默认，点保存生效')
              },
            }, '弹窗还原默认'),
            h('button', {
              style: S.btn,
              onClick: function () { save() },
            }, '保存')))
      } else if (tab === 'jobs') {
        const items = (busy && busy.items) || []
        body = h('div', null,
          bar('现在后台在忙什么（白话，只读）'),
          busy ? h('div', { style: { color: '#999', fontSize: '12px', marginBottom: '8px' } },
            '更新于 ' + String(busy.at || '').slice(11, 19) + (busy.verdict && busy.verdict.text ? ' · ' + busy.verdict.text : '')) : h('div', { style: { color: '#999' } }, '读取中…'),
          items.length ? items.map(function (it, i) {
            return h('div', { key: String(i), style: { display: 'flex', gap: '10px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.06)' } },
              h('span', { style: { minWidth: '70px', color: '#9fd4ff', fontSize: '12px' } }, it.kind || ''),
              h('span', { style: { fontSize: '13px', color: it.busy ? '#ffd9a8' : 'inherit' } }, it.what || ''),
              it.busy ? h('span', { style: { color: '#ffb347', fontSize: '11px' } }, '在跑') : null)
          }) : h('div', { style: { color: '#999' } }, '看不到（数据源没读到）'),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '8px' } },
            '关窗口时如果还有在跑的任务，会弹系统确认框提醒。'))
      } else {
        body = h('div', null,
          bar('给别的插件用 — 其他插件调这些接口就能弹窗'),
          h('pre', { style: S.pre }, "window.__yshenImportantPopup({\n  theme: 'blue' | 'red',\n  items: [{ badge, title, body }],\n  autoExpand: false,\n  badge: '要紧',\n  title: '标题',\n  body: '正文',\n  confirmText: '知道了',   // 不给 cancelText = 只出一个键（看完关掉）\n  // cancelText: '稍后',   // 真有第二个选择时才给\n})"),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '6px' } }, '也可以让后台直接推：POST /yushen-popup/preview'))
      }

      return h('div', { style: S.wrap },
        h('div', { style: S.top },
          h('div', { style: S.title }, '弹窗控制台'),
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
            h('label', { style: S.check }, h('input', {
              type: 'checkbox', checked: !!cfg.enabled,
              onChange: function (e) { set({ enabled: e.target.checked }) },
            }), '总开关'),
            h('button', { style: S.btn, onClick: save }, '保存'),
            h('button', {
              style: S.btn,
              onClick: function () {
                window.__yshenImportantPopup && window.__yshenImportantPopup({
                  theme: 'blue', autoExpand: cfg.mode === 'auto', badge: '蓝色预览',
                  title: '蓝色画卷', body: '平时用这版，和深海蓝界面统一。', confirmText: '好',
                })
              },
            }, '预览蓝'),
            h('button', {
              style: S.btn,
              onClick: function () {
                window.__yshenImportantPopup && window.__yshenImportantPopup({
                  theme: 'red', autoExpand: cfg.mode === 'auto', badge: '要紧',
                  title: '红色画卷', body: '更张扬，适合真正要紧、需要你拍板的事。', confirmText: '好',
                })
              },
            }, '预览红'),
            msg ? h('span', { style: { color: '#999', fontSize: '12px' } }, msg) : null)),
        h('div', { style: S.main },
          h('div', { style: S.nav },
            TABS.map(function (pair) {
              return h('div', {
                key: pair[0],
                style: Object.assign({}, S.navItem, tab === pair[0] ? S.navOn : {}),
                onClick: function () { setTab(pair[0]) },
              }, pair[1])
            })),
          h('div', { style: S.panel }, body)))
    }

    const S = {
      wrap: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--dsw-alias-bg-base, #0e131a)', color: 'var(--dsw-alias-label-primary, #e6eef7)', fontFamily: 'inherit' },
      top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' },
      title: { fontSize: '16px', fontWeight: '600', letterSpacing: '.04em' },
      main: { display: 'flex', flex: 1, minHeight: 0 },
      nav: { width: '170px', borderRight: '1px solid rgba(255,255,255,.08)', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px' },
      navItem: { padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'rgba(230,238,247,.72)' },
      navOn: { background: 'rgba(120,190,255,.14)', color: '#dff1ff' },
      panel: { flex: 1, padding: '18px 24px', overflowY: 'auto' },
      bar: { marginTop: '14px', marginBottom: '6px', fontSize: '12px', color: 'rgba(230,238,247,.5)', letterSpacing: '.08em' },
      check: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', margin: '5px 0', fontSize: '13px' },
      row: { display: 'flex', gap: '12px', alignItems: 'center', margin: '6px 0' },
      key: { minWidth: '48px', fontSize: '13px', color: 'rgba(230,238,247,.72)' },
      btn: { padding: '5px 14px', borderRadius: '8px', border: '1px solid rgba(140,200,255,.35)', background: 'rgba(30,50,70,.6)', color: '#dff1ff', cursor: 'pointer', fontSize: '13px' },
      loading: { padding: '40px', color: '#999' },
      pre: { background: 'rgba(0,0,0,.35)', padding: '12px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto', lineHeight: 1.6 },
      num: { width: '110px', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(140,200,255,.35)', background: 'rgba(0,0,0,.25)', color: 'inherit', fontSize: '13px' },
    }

    // token 提醒的"确认后动作"：往输入框发指令 / 点新会话。失败就静默（不影响提醒本身）
    function yspSendToComposer(text) {
      try {
        const box = document.querySelector('textarea, [contenteditable="true"]')
        if (!box) return false
        if (box.tagName === 'TEXTAREA') {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(box, text)
          box.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          box.textContent = text
          box.dispatchEvent(new InputEvent('input', { bubbles: true }))
        }
        setTimeout(function () {
          try {
            const btn = [].slice.call(document.querySelectorAll('button')).find(function (b) {
              return b.offsetParent !== null && /发送|send/i.test(b.innerText || '')
            })
            if (btn) btn.click()
            else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          } catch { /* 忽略 */ }
        }, 300)
        return true
      } catch { return false }
    }
    function yspOpenNewSession() {
      try {
        const hit = [].slice.call(document.querySelectorAll('button,a,div')).find(function (e) {
          return e.offsetParent !== null && /^新会话$/.test((e.innerText || '').trim())
        })
        if (hit) { hit.click(); return true }
        return false
      } catch { return false }
    }

    // 弹窗历史（未读中心用）：最近 20 条
    const HISTORY_KEY = 'yspopup.history'
    function yspReadHistory() {
      try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || [] } catch { return [] }
    }
    function yspPushHistory(item) {
      try {
        const h = yspReadHistory()
        h.unshift({ badge: item.badge || '', title: item.title || '', body: item.body || '', at: Date.now() })
        localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20)))
      } catch { /* 忽略 */ }
    }

    // ── 会话 token 提醒：峰谷 + 每轮成本 + 累计 + 容量 + CD（2026-11-10 重写） ──
    // 价格：DeepSeek 官方 deepseek-flash（2026-11-10 查）美元/百万 token，¥7.2/$ 换算
    const YSP_PRICE = {
      peak: { hit: 0.006, miss: 0.3, out: 1.2 },
      off: { hit: 0.003, miss: 0.15, out: 0.6 },
    }
    const YSP_USD_CNY = 7.2
    // 峰时 = 工作日 09:00-12:00 / 14:00-18:00（北京时间）；周末全天、节假日全天是谷时。
    // 节假日表近似（未含调休）；表里没有的日期按普通工作日算。
    const YSP_HOLIDAYS = new Set([
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-09-25', '2026-09-26', '2026-09-27',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ])
    function yspYmd(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }
    function yspIsPeak(now) {
      const d = new Date(now)
      const day = d.getDay()
      if (day === 0 || day === 6) return false
      if (YSP_HOLIDAYS.has(yspYmd(d))) return false
      const m = d.getHours() * 60 + d.getMinutes()
      return (m >= 540 && m < 720) || (m >= 840 && m < 1080)
    }
    try { window.__yspIsPeak = yspIsPeak } catch { /* 忽略 */ }
    function yspUnitPrice(peak, cache) {
      const p = YSP_PRICE[peak ? 'peak' : 'off']
      return (cache * p.hit + (1 - cache) * p.miss) * YSP_USD_CNY
    }
    function yspRoundCost(tokens, peak, cache, outTokens) {
      const p = YSP_PRICE[peak ? 'peak' : 'off']
      const inCost = (tokens * (cache * p.hit + (1 - cache) * p.miss)) / 1e6
      const outCost = ((outTokens || 400) * p.out) / 1e6
      return (inCost + outCost) * YSP_USD_CNY
    }
    function yspFmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(Math.round(n)) }
    function yspYuan(x) { return '¥' + (Math.round(x * 100) / 100).toFixed(2) }
    const YSP_SESS_KEY = 'yspopup.sessions'
    function yspReadSessions() { try { return JSON.parse(localStorage.getItem(YSP_SESS_KEY) || '{}') || {} } catch { return {} } }
    function yspSaveSessions(m) { try { localStorage.setItem(YSP_SESS_KEY, JSON.stringify(m)) } catch { /* 忽略 */ } }
    // 当前会话标题：先从页面找（DSH 聊天区顶部），拿不到才退到 document.title
    function yspReadSessionTitle() {
      try {
        const sels = ['[data-session-title]', '[class*="session-title"]', '[class*="sessionTitle"]', '[class*="conversation-title"]', '[class*="conversationTitle"]', '[class*="chat-title"]', '[class*="chatTitle"]', '[class*="thread-title"]']
        for (let i = 0; i < sels.length; i++) {
          const el = document.querySelector(sels[i])
          const t = el && el.textContent ? String(el.textContent).trim() : ''
          if (t) return t.slice(0, 30)
        }
        const t = String(document.title || '').replace(/^.*?[·\-—|]\s*/, '').trim()
        if (t && !/^DeepSeek Harness$/i.test(t)) return t.slice(0, 30)
      } catch { /* 忽略 */ }
      return ''
    }
    function yspSessionKey() {
      try {
        const el = document.querySelector('[data-session-id]')
        if (el) return String(el.getAttribute('data-session-id'))
      } catch { /* 忽略 */ }
      const title = yspReadSessionTitle()
      return (location.pathname || '/') + '::' + (title || 'main')
    }
    function yspSessionGet(all, key) {
      const s = all[key] || {}
      return {
        tokens: Number(s.tokens) || 0,
        lastSeenAt: Number(s.lastSeenAt) || 0,
        spentEst: Number(s.spentEst) || 0,
        rounds: Number(s.rounds) || 0,
        cdUntil: Number(s.cdUntil) || 0,
        cdCount: Number(s.cdCount) || 0,
        forceAt: Number(s.forceAt) || 0,
        hits: Array.isArray(s.hits) ? s.hits.filter(function (t) { return Date.now() - t < 3600000 }) : [],
        reminded: s.reminded || {},
      }
    }

    function yspMountCdChoice(baseMinutes, onPick) {
      if (typeof document === 'undefined') return
      try { const old = document.getElementById('ysp-cd-choice'); if (old) old.remove() } catch { /* 忽略 */ }
      const box = document.createElement('div')
      box.id = 'ysp-cd-choice'
      box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483000;background:rgba(12,20,30,.97);border:1px solid rgba(140,210,255,.5);border-radius:14px;padding:18px 20px;color:#eaf7ff;font-size:14px;box-shadow:0 12px 40px rgba(0,0,0,.6);min-width:260px'
      const title = document.createElement('div')
      title.textContent = '多久后再提醒？'
      title.style.cssText = 'font-size:15px;margin-bottom:12px;color:#bfe9ff'
      box.appendChild(title)
      const base = Math.max(5, Number(baseMinutes) || 10)
      const opts = [
        [base, base + ' 分钟后'],
        [base * 2, (base * 2) + ' 分钟后'],
        [Math.min(120, base * 4), Math.min(120, base * 4) + ' 分钟后'],
        [-1, '本会话不再提醒'],
      ]
      let done = false
      const finish = function (mins) {
        if (done) return
        done = true
        try { box.remove() } catch { /* 忽略 */ }
        onPick(mins)
      }
      opts.forEach(function (pair) {
        const b = document.createElement('button')
        b.textContent = pair[1]
        b.style.cssText = 'display:block;width:100%;margin:6px 0;padding:8px 12px;border-radius:8px;border:1px solid rgba(140,210,255,.35);background:rgba(30,50,70,.6);color:#dff1ff;cursor:pointer;font-size:13px'
        b.onclick = function () { finish(pair[0]) }
        box.appendChild(b)
      })
      const cancel = document.createElement('button')
      cancel.textContent = '取消'
      cancel.style.cssText = 'display:block;width:100%;margin-top:10px;padding:6px;border:none;background:transparent;color:#8899aa;cursor:pointer;font-size:12px'
      cancel.onclick = function () { finish(null) }
      box.appendChild(cancel)
      document.body.appendChild(box)
    }

    function mountTokenAlert() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      if (window.__ysTokenAlertMounted) return
      window.__ysTokenAlertMounted = true
      let cfg = null
      let failCount = 0
      let broken = false
      let brokenNotified = false
      // 2026-11-11 老板：「读不到是因为新开了一个会话」——新会话页面上本来就没有「用量 X tok」，
      // 那不是数据源坏了。readUsage 会把"页面上压根没出现用量字样"记在这里，tick 见到就静默。
      let usageNoTurn = false
      let hidden = document.hidden
      let lastCfgAt = 0
      let lastMutAt = 0
      let inited = false
      let lastKey = ''
      let lastReadTokens = 0
      let lastEventTs = 0
      try { lastEventTs = Number(localStorage.getItem('yspopup.lastEventTs')) || 0 } catch { lastEventTs = 0 }
      let justSwitched = false
      let lastTickAt = 0
      const loadCfg = function () {
        fetch('/yushen-popup/config', { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (!d || !d.ok) return
            cfg = d.config
            lastCfgAt = Date.now()
            if (!inited) {
              inited = true
              const ta = cfg.tokenAlert || {}
              if (ta.repeatOnOpen) {
                const all = yspReadSessions()
                const key = yspSessionKey() || 'main'
                const st = yspSessionGet(all, key)
                st.reminded = {}
                st.cdUntil = 0
                st.cdCount = 0
                all[key] = st
                yspSaveSessions(all)
              }
              if (ta.enabled !== false && ta.checkOnOpen !== false) tick(true)
            }
          })
          .catch(function () { /* 忽略 */ })
      }
      const numOf = function (s) {
        if (s == null) return null
        const n = parseFloat(String(s).replace(/,/g, ''))
        return isFinite(n) ? n : null
      }
      // 读页面上的用量明细（DSH 每轮结束显示：本轮用量 / 缓存命中 / 未缓存输入 / 缓存读取 / 输出）
      // 2026-11-11：读不到用量时把"页面上到底长什么样"记一行，别再靠猜 DSH 改了哪。
      const diag = function (why, extra) {
        try {
          fetch('/yushen-popup/diag', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ why: why, extra: extra || null }),
          }).catch(function () { /* 忽略 */ })
        } catch { /* 忽略 */ }
      }
      // 用量读法（2026-11-11 重写）：
      //   DSH 现在把用量渲染成「用量 12.2K tok」这样的按钮（button[aria-haspopup] 里的 label），
      //   K/M/万/千 这些简写要认得；tok/s 是速度，不是总数，别当成本轮用量。
      //   先按按钮找（最准），再退回整页文本（老结构）。
      const readUsage = function () {
        const UNIT = { K: 1e3, k: 1e3, '千': 1e3, M: 1e6, m: 1e6, W: 1e4, w: 1e4, '万': 1e4, '亿': 1e8 }
        const pick = function (m) {
          if (!m) return null
          const n = parseFloat(String(m[1]).replace(/,/g, ''))
          if (!isFinite(n)) return null
          return Math.round(n * (UNIT[m[2]] || 1))
        }
        const ANCHOR = /用量\s*([\d][\d,.]*)\s*(千|万|亿|[KkMmWw])?\s*(?:tok|tokens?)\b(?!\s*\/)/i
        const ANY = /([\d][\d,.]*)\s*(千|万|亿|[KkMmWw])?\s*(?:tok|tokens?)\b(?!\s*\/)/i
        const txt = (document.body && document.body.innerText) || ''
        let total = null
        let sample = ''
        // a) 那一枚用量按钮
        try {
          const btns = document.querySelectorAll('button[aria-haspopup]')
          for (const b of btns) {
            const t = String((b.innerText || b.textContent || ''))
            if (!/用量/.test(t)) continue
            if (!sample) sample = t.slice(0, 160)
            const hit = pick(ANCHOR.exec(t))
            if (hit != null) { total = hit; break }
          }
        } catch { /* 老结构没有这种按钮 */ }
        // b) 整页文本
        if (total == null) total = pick(ANCHOR.exec(txt))
        if (total == null) total = pick(ANY.exec(txt))
        const grab = function (re) { const m = re.exec(txt); return m ? m[1] : null }
        const hitPct = numOf(grab(/缓存命中\s*([\d.]+)\s*%/i))
        const missIn = numOf(grab(/未缓存输入\s*([\d,]+)\s*(?:tok|tokens?)/i))
        const cacheRead = numOf(grab(/缓存读取\s*([\d,]+)\s*(?:tok|tokens?)/i))
        const out = numOf(grab(/输出\s*([\d,]+)\s*(?:tok|tokens?)/i))
        if (total == null && missIn != null && cacheRead != null) total = missIn + cacheRead
        if (total == null) {
          // 页面上连 "tok" 字样都没有 = 新会话/这一轮还没跑完，页面本来就没有用量可读。
          // 这不是"数据源坏了"，别报、也别记失败（老板 2026-11-11：「读不到是因为新开了一个会话」）。
          usageNoTurn = !/tok/i.test(txt) && !/tok/i.test(sample)
          if (!usageNoTurn) diag('usage-miss', { sample: (sample || txt).slice(0, 600), hasBody: !!txt })
          return null
        }
        usageNoTurn = false
        return { total: Math.round(total), hitPct, missIn, cacheRead, out }
      }
      // 真实每轮成本：缓存读取按 hit 价、未缓存输入按 miss 价、输出按 out 价；没明细才用总 token × 命中率兜底
      const calcCost = function (u, peak) {
        if (!u) return 0
        const p = YSP_PRICE[peak ? 'peak' : 'off']
        let hit = u.cacheRead
        let miss = u.missIn
        if (hit == null || miss == null) {
          const hp = u.hitPct != null ? Math.max(0, Math.min(1, u.hitPct / 100)) : 0.8
          hit = (u.total || 0) * hp
          miss = (u.total || 0) * (1 - hp)
        }
        const outT = u.out != null ? u.out : 400
        return (hit * p.hit + miss * p.miss + outT * p.out) / 1e6 * YSP_USD_CNY
      }
      const readTokens = function () { const u = readUsage(); return u ? u.total : null }
      const selfHeal = function () {
        try {
          const sc = document.querySelector('[class*="scroll"], [class*="messages"]')
          if (sc) sc.scrollTop = 0
        } catch { /* 忽略 */ }
        return new Promise(function (resolve) { setTimeout(function () { resolve(readTokens()) }, 800) })
      }
      const notifyBroken = function () {
        if (brokenNotified) return
        brokenNotified = true
        // 2026-11-11：一天最多喊一次（以前每次读到失败都可能再弹，弹窗就赖在屏幕上）
        try {
          const last = Number(localStorage.getItem('yspopup.brokenAt') || 0)
          if (Date.now() - last < 6 * 3600 * 1000) return
          localStorage.setItem('yspopup.brokenAt', String(Date.now()))
        } catch { /* 存不了就照弹 */ }
        diag('notify-broken')
        try {
          if (window.__yshenImportantPopup) {
            window.__yshenImportantPopup({
              theme: 'blue', autoExpand: true, badge: '数据源',
              title: '读不到「用量 X tok」了',
              body: '自动修复一次无效。可能是 DSH 界面文案变了。\n后台 → 提醒 → 数据源自检 可以手动重试。',
              confirmText: '知道了',
            })
          }
        } catch { /* 忽略 */ }
      }
      const tick = function (force) {
        if (!cfg || !cfg.tokenAlert || cfg.tokenAlert.enabled === false) return
        if (hidden) return
        const now = Date.now()
        const ta = cfg.tokenAlert
        const minGap = Math.max(60, Number(ta.intervalSec || 300)) * 1000
        if (!force && now - lastTickAt < minGap) return
        lastTickAt = now
        const peak = yspIsPeak(now)
        const usage = readUsage()
        const tokens = usage ? usage.total : null
        lastReadTokens = tokens || lastReadTokens
        if (!tokens) {
          if (usageNoTurn) { failCount = 0; broken = false; brokenNotified = false; return }
          // 切了会话：新会话那一页可能还没渲染出用量，先把计数清掉，别拿上一条会话的失败去报警
          const k0 = yspSessionKey() || 'main'
          if (lastKey && lastKey !== k0) {
            lastKey = k0
            failCount = 0
            broken = false
            brokenNotified = false
            setTimeout(function () { tick(true) }, 1500)
            return
          }
          failCount += 1
          if (failCount >= 3 && !broken) {
            broken = true
            selfHeal().then(function (v) {
              if (v) { broken = false; failCount = 0; brokenNotified = false; tick(true) }
              else notifyBroken()
            })
          }
          return
        }
        failCount = 0
        broken = false
        brokenNotified = false
        const hour = new Date(now).getHours()
        const qs = Number(ta.quietStart != null ? ta.quietStart : 0)
        const qe = Number(ta.quietEnd != null ? ta.quietEnd : 8)
        const quiet = qs < qe ? (hour >= qs && hour < qe) : (hour >= qs || hour < qe)
        const key = yspSessionKey() || 'main'
        if (lastKey && lastKey !== key) {
          // 切会话：先把旧会话记一下，等页面渲染完（1.5s）再读新会话，避免把旧会话的数字记到新会话头上
          const oldKey = lastKey
          lastKey = key
          justSwitched = true
          const all0 = yspReadSessions()
          if (all0[oldKey]) { all0[oldKey].lastSeenAt = now; yspSaveSessions(all0) }
          setTimeout(function () { tick(true) }, 1500)
          return
        }
        lastKey = key
        const all = yspReadSessions()
        const s = yspSessionGet(all, key)
        const roundCost = calcCost(usage, peak)
        const prevTokens = s.tokens
        const grew = tokens > prevTokens ? tokens - prevTokens : 0
        if (tokens > s.tokens) { s.spentEst += roundCost; s.rounds += 1 }
        s.tokens = Math.max(tokens, s.tokens)
        s.lastSeenAt = now
        const coldMs = (Number(ta.coldDays) || 3) * 86400000
        Object.keys(all).forEach(function (k) {
          if (k !== key && all[k] && now - (Number(all[k].lastSeenAt) || 0) > coldMs) delete all[k]
        })
        all[key] = s
        const roundLine = Number(ta.roundLine) || 0.1
        const totalLine = Number(ta.totalLine) || 10
        const totalStep = Number(ta.totalStep) || 10
        const contextLimit = Number(ta.contextLimit) || 500000
        const forceRound = Number(ta.forceRoundLine) || 0.5
        const forcePct = Number(ta.forceContextPct) || 0.8
        const forceHit = ta.forceEnabled !== false && (roundCost >= forceRound || tokens >= contextLimit * forcePct)
        const hits = s.hits.filter(function (t) { return now - t < 3600000 })
        const overFreq = ta.limitEnabled !== false && hits.length >= (Number(ta.maxPerHour) || 3)
        const cdActive = ta.cdEnabled !== false && s.cdUntil > now
        const quietOn = ta.quietEnabled !== false
        const inForceWindow = forceHit && now - s.forceAt > 3600000
        if (ta.silentMode) { yspSaveSessions(all); return }
        if (!inForceWindow && ((quietOn && quiet) || cdActive || (ta.limitEnabled !== false && overFreq))) { yspSaveSessions(all); return }
        const dueTotal = !s.reminded.total ? (s.spentEst >= totalLine) : (s.spentEst >= (s.reminded.total || 0) + totalStep)
        let trigger = ''
        if (inForceWindow) trigger = 'force'
        else if (ta.roundEnabled !== false && roundCost >= roundLine && !s.reminded.round) trigger = 'round'
        else if (ta.totalEnabled !== false && dueTotal) trigger = 'total'
        else if (ta.contextEnabled !== false && tokens >= contextLimit && !s.reminded.context) trigger = 'context'
        if (!trigger) { yspSaveSessions(all); return }
        const d = new Date(now)
        const timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
        const switchHint = (function () {
          const m = d.getHours() * 60 + d.getMinutes()
          if (peak) {
            if (m < 720) return '约 ' + Math.ceil((720 - m) / 60) + ' 小时后转谷时（半价）'
            return '约 ' + Math.ceil((1080 - m) / 60) + ' 小时后转谷时（半价）'
          }
          const day = d.getDay()
          if (day === 0 || day === 6) return '今天全天谷时（半价）'
          if (m < 540) return '明天 9 点后是峰时（全价）'
          if (m < 840) return '约 ' + Math.ceil((840 - m) / 60) + ' 分钟后转峰时（全价）'
          return '今晚都是谷时（半价）'
        })()
        const why = trigger === 'round' ? '每轮 ≥ ' + yspYuan(roundLine)
          : trigger === 'total' ? '累计 ≥ ' + yspYuan(Math.max(totalLine, (s.reminded.total || 0) + totalStep))
            : trigger === 'context' ? '上下文到容量线'
              : '每轮或上下文到强制线'
        const sessTitle = (function () {
          try { return yspReadSessionTitle() || '当前会话' } catch { return '当前会话' }
        })()
        const bodyLines = [
          '会话：' + sessTitle,
          '每轮 ' + yspYuan(roundCost) + '（' + (peak ? '峰时' : '谷时') + ' · ' + (usage && usage.hitPct != null ? Math.round(usage.hitPct) + '% 缓存' : '缓存未知') + '）',
          '上下文 ' + yspFmt(tokens) + ' / ' + yspFmt(contextLimit),
          '累计 ' + yspYuan(s.spentEst) + '（' + s.rounds + ' 轮）',
          '原因：' + why,
        ]
        if (justSwitched && grew >= 500 && ta.crossSessionAlert !== false) {
          bodyLines.splice(3, 0, '你不在这个会话时又跑了约 ' + yspFmt(grew) + ' token')
        }
        const winMin = Number(ta.recentWindowMin) || 60
        const others = Object.keys(all).filter(function (k) {
          return k !== key && now - (Number(all[k].lastSeenAt) || 0) <= winMin * 60000
        }).length
        if (others > 0) bodyLines.splice(2, 0, '最近 ' + winMin + ' 分钟你还用过 ' + others + ' 个会话')
        justSwitched = false
        const body = bodyLines.join('\n')
        hits.push(now)
        s.hits = hits
        if (trigger === 'round') s.reminded.round = true
        if (trigger === 'total') s.reminded.total = Math.max(totalLine, (s.reminded.total || 0) + totalStep)
        if (trigger === 'context') s.reminded.context = true
        if (trigger === 'force') s.forceAt = now
        yspSaveSessions(all)
        try {
          if (!window.__yshenImportantPopup) return
          window.__yshenImportantPopup({
            theme: (trigger === 'context' || trigger === 'force') ? 'red' : 'blue',
            autoExpand: true,
            badge: trigger === 'context' ? '上下文' : (trigger === 'force' ? '强制提醒' : (trigger === 'total' ? '累计花费' : '每轮成本')),
            title: (sessTitle ? sessTitle + ' · ' : '') + (trigger === 'context' ? '上下文 ' + yspFmt(tokens)
              : (trigger === 'force' ? '每轮 ' + yspYuan(roundCost) + '（强制线）'
                : (trigger === 'total' ? '累计 ' + yspYuan(s.spentEst)
                  : '每轮 ' + yspYuan(roundCost)))),
            body: body,
            confirmText: (ta.actions && ta.actions.summarize && ta.actions.newSession) ? '总结并开新会话'
              : ((ta.actions && ta.actions.summarize) ? '帮我总结'
                : ((ta.actions && ta.actions.newSession) ? '开新会话' : '知道了')),
            // 2026-11-12 老板：次按钮改成「关闭」，点了收起内容、变回画框（能再点开）
            cancelText: '关闭',
            cancelAction: 'fold',
          }).then(function (ok) {
            if (ok) {
              if (ta.actions && ta.actions.summarize) yspSendToComposer('帮我把这段会话的要点总结一下，写成简短的记忆条目。')
              if (ta.actions && ta.actions.newSession) setTimeout(yspOpenNewSession, 600)
              return
            }
            const baseMin = Number(ta.cdMinutes) || 10
            const n = yspReadSessions()
            const st = yspSessionGet(n, key)
            st.cdCount = Math.min(4, st.cdCount + 1)
            const mult = Math.min(8, Math.pow(2, st.cdCount - 1))
            st.cdUntil = now + baseMin * mult * 60000
            n[key] = st
            yspSaveSessions(n)
          })
        } catch { /* 提醒失败不影响别的 */ }
      }
      window.__yspTokenCheck = function () { tick(true) }
      loadCfg()
      const loop = function () {
        if (Date.now() - lastCfgAt > 60000) loadCfg()
        tick()
        const sec = Math.max(60, Number((cfg && cfg.tokenAlert && cfg.tokenAlert.intervalSec) || 300))
        setTimeout(loop, sec * 1000)
      }
      setTimeout(loop, 1200)
      try {
        const obs = new MutationObserver(function () {
          const now = Date.now()
          if (now - lastMutAt < 1000) return
          lastMutAt = now
          tick()
        })
        obs.observe(document.body, { childList: true, subtree: true })
      } catch { /* 忽略 */ }
      document.addEventListener('visibilitychange', function () {
        hidden = document.hidden
        if (!hidden) tick(true)
      })
      // 其他会话完成一轮的提醒：读 DSH 真实账本 events，当前页面没动、账本却在长 → 别的会话跑了
      let lastOtherAt = 0
      try { lastOtherAt = Number(localStorage.getItem('yspopup.lastOtherAt')) || 0 } catch { lastOtherAt = 0 }
      const checkOthers = function () {
        if (!cfg || !cfg.tokenAlert || cfg.tokenAlert.enabled === false) return
        if (cfg.tokenAlert.otherSessionAlert === false) return
        if (hidden) return
        fetch('/yushen-popup/real', { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (!d || !d.ok || !Array.isArray(d.recent) || !d.recent.length) return
            const last = d.recent[d.recent.length - 1]
            const at = last && last.at ? Date.parse(last.at) : 0
            if (!at || at <= lastOtherAt) return
            const prevAt = lastOtherAt
            lastOtherAt = at
            try { localStorage.setItem('yspopup.lastOtherAt', String(at)) } catch { /* 忽略 */ }
            if (!prevAt) return
            // 当前会话自己也在动 → 多半是自己的轮，不打扰
            const cur = readUsage()
            const curTotal = cur ? cur.total : 0
            if (curTotal && lastReadTokens && curTotal !== lastReadTokens) return
            try {
              if (!window.__yshenImportantPopup) return
              window.__yshenImportantPopup({
                theme: 'blue', autoExpand: true, badge: '其他会话',
                title: '别的会话刚跑了一轮',
                body: '约 ¥' + Number(last.cost || 0).toFixed(2) + (last.tokens ? ' / ' + Math.round(last.tokens / 10000) + ' 万 tok' : '') + '\n你这边没动。要看就切过去，不看也行。',
                confirmText: '知道了',
              })
            } catch { /* 忽略 */ }
          })
          .catch(function () { /* 忽略 */ })
      }
      // 间隔可调（后台 otherIntervalSec，默认 300 秒）；配置改了下一轮就用新的
      const otherLoop = function () {
        checkOthers()
        const sec = Math.max(60, Number((cfg && cfg.tokenAlert && cfg.tokenAlert.otherIntervalSec) || 300))
        setTimeout(otherLoop, sec * 1000)
      }
      setTimeout(otherLoop, 5000)
      // 给「宿主推来的信号」留两个把手：来了就现算，不用等定时器
      try { if (typeof window !== 'undefined') { window.__yspTick = tick; window.__yspCheckOthers = checkOthers; window.__yspReloadCfg = loadCfg } } catch { /* 忽略 */ }
    }

    try { if (typeof window !== 'undefined') window.__ysAdminPage = AdminPage } catch { /* 调试用 */ }

    // 错误边界：后台渲染崩了要把错误显示出来，而不是白屏（fake React 没有 Component 时退化成透传）
    let YspErrorBoundary = function (props) { return props.children }
    if (typeof React.Component === 'function') {
      YspErrorBoundary = class extends React.Component {
        constructor(props) {
          super(props)
          this.state = { err: null }
        }
        static getDerivedStateFromError(err) {
          return { err }
        }
        componentDidCatch(err) {
          try { console.error('[yspopup] AdminPage 渲染出错', err) } catch { /* 忽略 */ }
        }
        render() {
          if (this.state.err) {
            const msg = String((this.state.err && this.state.err.message) || this.state.err || '未知错误')
            const stack = String((this.state.err && this.state.err.stack) || '').slice(0, 600)
            return h('div', { style: { padding: '20px', color: '#ff8a8a', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } },
              '弹窗后台渲染出错：' + msg + '\n\n' + stack)
          }
          return this.props.children
        }
      }
    }
    return {
      inject: ['slots'],
      apply: function (ctx) {
        try { mountTokenAlert() } catch { /* 提醒挂不上不影响弹窗 */ }
        try { mountMemoBoard() } catch { /* 黑板挂不上不影响弹窗 */ }
        try { mountInlineCost() } catch { /* 花费标签挂不上不影响弹窗 */ }
        // 拉 host 的预览/备份队列；备份事件顺手广播给桌宠（localStorage）
        try {
          const handleItems = function (items) {
            if (!Array.isArray(items)) return 0
            items.forEach(function (it) {
              // 2026-11-11 老板：「不能每一轮动的时候机制就动吗」——宿主推来的"该算了"信号，
              // 不弹窗，只把提醒那套叫起来跑一遍（新会话没用量时它会自己静默）。
              if (it && it.__nudge) {
                try {
                  const mine = (typeof yspSessionKey === 'function') ? yspSessionKey() : ''
                  if (it.sid && mine && String(it.sid) !== String(mine)) {
                    try { if (window.__yspCheckOthers) window.__yspCheckOthers() } catch { /* 忽略 */ }
                  } else if (Date.now() - (window.__yspNudgeAt || 0) > 60000) {
                    // 有人正在跑就现算，但一分钟最多一次——被动触发不是为了把轮询换成更密的轮询
                    window.__yspNudgeAt = Date.now()
                    try { if (window.__yspTick) window.__yspTick(true) } catch { /* 忽略 */ }
                  }
                } catch { /* 忽略 */ }
                return
              }
              if (window.__yshenImportantPopup) window.__yshenImportantPopup(it)
              if (it && it.badge === '备份') {
                try {
                  localStorage.setItem('ysp.pet.say', JSON.stringify({
                    text: (it.title || '备份完成') + (it.body ? '：' + String(it.body).replace(/\n/g, ' ') : ''),
                    at: Date.now(),
                  }))
                } catch { /* 忽略 */ }
              }
            })
            return items.length
          }
          const pullPreview = function () {
            return fetch('/yushen-popup/preview', { credentials: 'same-origin' })
              .then(function (r) { return r.json() })
              .then(function (d) { return (d && d.ok) ? handleItems(d.items) : 0 })
              .catch(function () { return 0 })
          }
          // 2026-11-11 老板：「别的会话在跑的时候也被动拉起，根本不需要主动去轮询啊」
          // 对——检测早就不是轮询了（宿主在 session/event 上，所有会话的动静都从它过）；
          // 慢的只有"送货"这一段。所以改成**长轮询**：请求挂在宿主那边，有东西立刻回，
          // 没有就 20 秒后自己断，前端马上再挂一次。空闲时是"一个安静的请求挂着"，不是每 15 秒干问一遍。
          // 宿主根本不认 /wait（老版本）时才退回定时轮询。
          let mode = 'wait'
          let pollTimer = null
          let lastPullAt = 0
          let idleMs = 15000
          const IDLE_MIN = 15000
          const IDLE_MAX = 120000
          const pullNow = function (force) {
            const now = Date.now()
            if (!force && now - lastPullAt < 5000) return 0
            lastPullAt = now
            try { return window.__ysPopupShowing ? 0 : pullPreview() } catch { return 0 }
          }
          const pullSoon = function () {
            if (pollTimer) return
            pollTimer = setTimeout(function () {
              pollTimer = null
              idleMs = IDLE_MIN      // 页面动了 = 回到勤快档
              pullNow(false)
            }, 800)
          }
          const startPolling = function () {
            if (mode === 'poll') return
            mode = 'poll'
            try {
              const obs = new MutationObserver(function () { pullSoon() })
              obs.observe(document.body, { childList: true, subtree: true })
            } catch { /* 老浏览器没有 MutationObserver 就靠保底 */ }
            try {
              document.addEventListener('visibilitychange', function () {
                if (!document.hidden) { idleMs = IDLE_MIN; pullNow(true) }
              })
            } catch { /* 忽略 */ }
            const backstop = function () {
              const hid = (typeof document !== 'undefined') && document.hidden
              setTimeout(function () {
                Promise.resolve(pullNow(true)).then(function (n) {
                  idleMs = (Number(n) > 0) ? IDLE_MIN : Math.min(IDLE_MAX, Math.round(idleMs * 2))
                }).catch(function () { /* 忽略 */ })
                backstop()
              }, hid ? 300000 : idleMs)
            }
            backstop()
            pullNow(true)
          }
          const waitLoop = function () {
            if (mode !== 'wait') return
            fetch('/yushen-popup/wait', { credentials: 'same-origin' })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (!d || d.ok !== true || d.long !== true) { startPolling(); return }
                if (Array.isArray(d.items) && d.items.length) handleItems(d.items)
                setTimeout(waitLoop, 60)
              })
              .catch(function () { setTimeout(waitLoop, 2000) })
          }
          waitLoop()
        } catch { /* 忽略 */ }
        // 关闭提醒：后台还有在跑的任务时，关窗口弹系统确认（白话）
        try {
          let busyCount = 0
          const tick = function () {
            fetch('/yushen-popup/busy', { credentials: 'same-origin' })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (!d || !d.ok) return
                busyCount = (d.items || []).filter(function (x) { return x.busy }).length
              })
              .catch(function () { /* 忽略 */ })
          }
          tick()
          setInterval(tick, 30000)
          window.addEventListener('beforeunload', function (e) {
            if (busyCount > 0) {
              const msg = '后台还有 ' + busyCount + ' 件事在跑，确定关？'
              e.preventDefault()
              e.returnValue = msg
              return msg
            }
          })
        } catch { /* 忽略 */ }
        // 对话染色：你的消息 / 我的消息（DSH 主界面，改字色不改结构）
        try {
          const st = document.createElement('style')
          st.id = 'ysp-chat-colors'
          const applyChat = () => {
            let c = {}
            try { c = JSON.parse(localStorage.getItem('yspopup.chatColors') || '{}') || {} } catch { c = {} }
            if (!c.on) { st.textContent = ''; document.head.appendChild(st); return }
            const font = c.fontFamily ? 'font-family:' + c.fontFamily + ' !important;' : ''
            const size = c.fontSize === 'small' ? 'font-size:0.92em !important;' : (c.fontSize === 'large' ? 'font-size:1.08em !important;' : '')
            const stroke = (Number(c.strokeWidth) > 0) ? ('-webkit-text-stroke:' + Number(c.strokeWidth) + 'px ' + (c.strokeColor || '#ffffff') + ' !important;') : ''
            const weight = c.weight ? ('font-weight:' + c.weight + ' !important;') : ''
            const mineSel = '[class*="userStack"], [class*="userStack"] *'
            const theirSel = '[class*="assistantContent"], [class*="assistantContent"] *, [class*="assistantOutput"], [class*="assistantOutput"] *'
            st.textContent = mineSel + '{color:' + (c.mine || '#dff1ff') + ' !important;' + font + size + stroke + weight + '}'
              + theirSel + '{color:' + (c.theirs || '#e6eef7') + ' !important;' + font + size + stroke + weight + '}'
          }
          applyChat()
          if (!document.head.querySelector('#ysp-chat-colors')) document.head.appendChild(st)
          // 配置变了（别的页面保存）时靠轮询刷新
          setInterval(applyChat, 5000)
          window.__yspApplyChatColors = applyChat
        } catch { /* 染色失败不影响弹窗 */ }
        const slots = (ctx && ctx.slots) || (typeof ctx.get === 'function' ? ctx.get('slots') : undefined)
        if (!slots || typeof slots.inject !== 'function') return
        const wrap = (name, factory) => {
          const run = () => slots.inject(name, factory)
          if (ctx && typeof ctx.effect === 'function') ctx.effect(run)
          else run()
        }
        wrap('sidebar.panellist', () => slots.register(
          { name: 'sidebar.panellist', id: 'dsh-yushen-popup', order: 24, label: '弹窗' },
          function Glyph() { return h('span', { style: { fontSize: '16px' } }, '✦') },
        ))
        wrap('main', () => slots.register(
          { name: 'main', key: 'dsh-yushen-popup', id: 'dsh-yushen-popup', label: '弹窗控制台' },
          function (props) {
            try {
              return h(YspErrorBoundary, null, h(AdminPage, props))
            } catch (e) {
              return h('div', { style: { padding: '20px', color: '#ff8a8a', fontSize: '13px' } },
                '弹窗后台渲染出错：' + String((e && e.message) || e))
            }
          },
        ))
      },
    }
  },
})
