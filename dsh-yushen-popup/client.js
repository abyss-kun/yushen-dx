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

    function mountImportantPopup(opts = {}) {
      if (typeof document === 'undefined') return Promise.resolve(false)
      // 合并全局队列：同时来多条时，一个弹窗显示「未读 N 条」列表
      const pending2 = (typeof window !== 'undefined' && Array.isArray(window.__ysPopupPending)) ? window.__ysPopupPending.splice(0) : []
      const merged = (Array.isArray(opts.items) && opts.items.length) ? opts.items.slice() : [opts]
      for (const p2 of pending2) merged.push(p2)
      const items = merged
      const theme = (opts.theme === 'red' || (items[0] && items[0].theme === 'red')) ? 'red' : 'blue'
      // 已有弹窗在显示 → 入队，等它关掉再弹（避免同时叠好几个）
      if (typeof window !== 'undefined' && window.__ysPopupShowing) {
        window.__ysPopupPending = window.__ysPopupPending || []
        window.__ysPopupPending.push(opts)
        return Promise.resolve(false)
      }
      if (typeof window !== 'undefined') window.__ysPopupShowing = true
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
        const _strokeW = Number(_font.strokeWidth) || 0
        const _stroke = _strokeW > 0 ? (_strokeW + 'px ' + (_font.strokeColor || '#ffffff')) : '0 transparent'
        const wrap = document.createElement('div')
        wrap.setAttribute('data-ys-popup', '1')
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
          gap: '1.4cqw', padding: '0 2.4cqw 5cqw', boxSizing: 'border-box',
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

        const mkBadge = (text) => {
          const b = document.createElement('div')
          b.textContent = text || '提醒'
          Object.assign(b.style, {
            fontSize: FS(1.7), letterSpacing: '.28em', padding: '.4cqw 1.6cqw',
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
          Object.assign(h.style, { margin: '0', fontSize: FS(3.4), fontWeight: '600', letterSpacing: '.05em', color: (_font.titleColor || _font.textColor) || (LIGHT ? '#12202c' : T.colors.title), width: '100%', wordBreak: 'break-word', textAlign: 'center', WebkitTextStroke: _stroke, fontWeight: _font.fontWeight || '' })
          content.appendChild(h)
          const p = document.createElement('p')
          p.textContent = it.body || ''
          Object.assign(p.style, { margin: '0', fontSize: FS(1.9), lineHeight: '1.75', color: _font.textColor || (LIGHT ? '#2a3a48' : T.colors.body), WebkitTextStroke: _stroke, fontWeight: _font.fontWeight || '', whiteSpace: 'pre-wrap', width: '100%', wordBreak: 'break-word', textAlign: 'center' })
          content.appendChild(p)
          // 两个按钮：同一风格、同色系，不分主次，放框外下方
          const _bs = (_font && _font.buttonStyle) || 'crystal'
          const _accent = (_font && _font.accentColor) || ''
          const btnBase = {
            font: 'inherit', fontSize: FS(2), padding: '1cqw 2.6cqw', borderRadius: '1.2cqw', cursor: 'pointer',
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
          const cancel = document.createElement('button')
          cancel.textContent = it.cancelText || '关掉'
          Object.assign(cancel.style, btnBase)
          cancel.style.filter = 'brightness(.92)'
          cancel.addEventListener('click', (e) => { e.stopPropagation(); playClick(); finish(false) })
          btnRow.appendChild(cancel)
          const ok = document.createElement('button')
          ok.textContent = it.confirmText || '好'
          // 主按钮同一套风格，只是略亮一点、字重更实（不偏离主题）
          Object.assign(ok.style, btnBase)
          ok.style.filter = 'brightness(1.12)'
          ok.style.fontWeight = '700'
          ok.style.boxShadow = String(btnBase.boxShadow || '') + ', 0 0 1.6cqw rgba(255,255,255,.25)'
          ok.addEventListener('click', (e) => { e.stopPropagation(); playClick(); finish(true) })
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
            font: 'inherit', fontSize: FS(2), padding: '1cqw 2.6cqw', borderRadius: '1.2cqw', cursor: 'pointer',
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
          Object.assign(backBtn.style, listBtn)
          backBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(false) })
          btnRow.appendChild(backBtn)
          // 未读中心额外给「全部已读」
          if (!opts.closeOnly) {
            const readAll = document.createElement('button')
            readAll.textContent = '全部已读'
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
        const onKey = (e) => { if (e.key === 'Escape') finish(false) }
        const finish = (result) => {
          if (done) return
          done = true
          // 常驻：点「好/知道了」不销毁，收成悬浮画卷留在屏幕
          if (_stay && result) {
            try { suspend() } catch { /* 忽略 */ }
            try { resolve(true) } catch { /* 忽略 */ }
            return
          }
          document.removeEventListener('keydown', onKey, true)
          window.removeEventListener('wheel', onWheel, { passive: false })
          try { wrap.style.opacity = '0' } catch { /* noop */ }
          setTimeout(() => {
            try { wrap.remove() } catch { /* 已移除 */ }
            try { noDragStyle.remove() } catch { /* 已移除 */ }
          }, 260)
          try { yspPushHistory(items[0] || opts) } catch { /* 忽略 */ }
          resolve(result)
          try {
            if (typeof window !== 'undefined') window.__ysPopupShowing = false
            const q = (typeof window !== 'undefined' && Array.isArray(window.__ysPopupPending)) ? window.__ysPopupPending : []
            if (q.length && typeof window.__yshenImportantPopup === 'function') {
              setTimeout(function () { window.__yshenImportantPopup(q.shift()) }, 260)
            }
          } catch { /* 忽略 */ }
        }
        document.addEventListener('keydown', onKey, true)
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
        wrap.addEventListener('click', (e) => { if (e.target === wrap) suspend() })

        const reveal = () => {
          if (opened) return
          opened = true
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
            target = clampPos({ x: window.innerWidth - pad, y: window.innerHeight - pad })
            lastPos = target
            savePos(target)
          }
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
      const save = function () {
        setMsg('保存中…')
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
            setMsg('已保存')
          } else setMsg('没存成')
        }).catch(function (e) { setMsg('没存成：' + String(e && e.message || e)) })
      }
      const set = function (patch) { setCfg(Object.assign({}, cfg, patch)) }
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
          bar('紧急事件直接弹 — 要紧的事是否跳过卷轴直接显示'),
          check('urgentDirect', '紧急的事跳过仪式，直接给你看'),
          bar('关闭后 — 点「好/知道了」之后弹窗怎么处理'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: (function () { try { return localStorage.getItem('yspopup.stay') === '1' } catch { return false } })(),
            onChange: function (e) { try { localStorage.setItem('yspopup.stay', e.target.checked ? '1' : '0') } catch { /* 忽略 */ } set({ stayOnClose: e.target.checked }) },
          }), '保留悬浮窗（关掉就收成画卷留在屏幕上，不消失）'),
          bar('滚轮缩放时 — 弹窗显示成什么样'),
          radio('zoomView', 'expanded', '展开的样子（能看到内容）'),
          radio('zoomView', 'rolled', '收拢的画卷（只有外壳）'),
          bar('缩放后再打开 — 从收起状态点开后显示什么'),
          radio('reopenView', 'expanded', '直接展开（看到内容）'),
          radio('reopenView', 'rolled', '还是收拢的画卷（要再点一下才展开）'),
          bar('点空白处 — 点击弹窗外面的空白区域时做什么'),
          radio('blankAction', 'fold', '收成画卷'),
          radio('blankAction', 'close', '直接关闭'),
          radio('blankAction', 'none', '无效（什么都不发生）'))
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
        body = h('div', null,
          bar('会话 token 提醒 — 单个会话上下文快满时弹窗提醒你'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: ta.enabled !== false,
            onChange: function (e) { set({ tokenAlert: Object.assign({}, ta, { enabled: e.target.checked }) }) },
          }), '开着（默认开）'),
          h('div', { style: S.row }, h('span', { style: S.key }, '8 万时'),
            h('input', {
              type: 'number', min: 1000, step: 1000, style: S.num,
              value: ta.warnAt || 80000,
              onChange: function (e) { set({ tokenAlert: Object.assign({}, ta, { warnAt: Number(e.target.value) || 80000 }) }) },
            }), h('span', { style: { color: '#999', fontSize: '12px' } }, 'token — 蓝框提醒一次')),
          h('div', { style: S.row }, h('span', { style: S.key }, '15 万时'),
            h('input', {
              type: 'number', min: 1000, step: 1000, style: S.num,
              value: ta.dangerAt || 150000,
              onChange: function (e) { set({ tokenAlert: Object.assign({}, ta, { dangerAt: Number(e.target.value) || 150000 }) }) },
            }), h('span', { style: { color: '#999', fontSize: '12px' } }, 'token — 红框加重提醒一次')),
          bar('确认后做什么（都要点弹窗的确认才执行，不做全自动）'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: !!(ta.actions && ta.actions.summarize),
            onChange: function (e) { set({ tokenAlert: Object.assign({}, ta, { actions: Object.assign({}, ta.actions || {}, { summarize: e.target.checked }) }) }) },
          }), '确认后帮我总结（往输入框发“总结会话要点”的指令）'),
          h('label', { style: S.check }, h('input', {
            type: 'checkbox', checked: !!(ta.actions && ta.actions.newSession),
            onChange: function (e) { set({ tokenAlert: Object.assign({}, ta, { actions: Object.assign({}, ta.actions || {}, { newSession: e.target.checked }) }) }) },
          }), '确认后开新会话（点击侧边栏「新会话」）'),
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
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '4px' } },
            '外部推事件用 POST /yushen-popup/event（{ source, badge, title, body }），推来就弹。'),
          h('div', { style: { color: '#999', fontSize: '12px', marginTop: '6px' } },
            '每级只弹一次（记在本地），开新会话后重新计。数据来源：页面上的「用量 X tok」。'))
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
          h('pre', { style: S.pre }, "window.__yshenImportantPopup({\n  theme: 'blue' | 'red',\n  items: [{ badge, title, body }],\n  autoExpand: false,\n  badge: '要紧',\n  title: '标题',\n  body: '正文',\n  confirmText: '好',\n  cancelText: '关掉',\n})"),
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
                  title: '蓝色画卷', body: '平时用这版，和深海蓝界面统一。', confirmText: '好', cancelText: '关掉',
                })
              },
            }, '预览蓝'),
            h('button', {
              style: S.btn,
              onClick: function () {
                window.__yshenImportantPopup && window.__yshenImportantPopup({
                  theme: 'red', autoExpand: cfg.mode === 'auto', badge: '要紧',
                  title: '红色画卷', body: '更张扬，适合真正要紧、需要你拍板的事。', confirmText: '好', cancelText: '关掉',
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

    // ── 会话 token 提醒：读页面「用量 X tok」，超阈值弹窗（每级只弹一次） ──
    function mountTokenAlert() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      if (window.__ysTokenAlertMounted) return
      window.__ysTokenAlertMounted = true
      const KEY = 'yspopup.tokenAlerted'
      const readSeen = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} } }
      const markSeen = (level) => {
        try {
          const m = readSeen()
          m[level] = Date.now()
          localStorage.setItem(KEY, JSON.stringify(m))
        } catch { /* 忽略 */ }
      }
      const readTokens = () => {
        const txt = (document.body && document.body.innerText) || ''
        const m = /用量\s*([\d.]+)\s*([KM]?)\s*tok/i.exec(txt)
        if (!m) return null
        let n = parseFloat(m[1])
        if (!isFinite(n)) return null
        if (m[2] === 'K' || m[2] === 'k') n *= 1000
        if (m[2] === 'M' || m[2] === 'm') n *= 1000000
        return Math.round(n)
      }
      const fmt = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n))
      let cfg = null
      const loadCfg = () => {
        fetch('/yushen-popup/config', { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d && d.ok) cfg = d.config })
          .catch(function () { /* 忽略 */ })
      }
      loadCfg()
      setInterval(function () {
        try {
          if (!cfg || !cfg.tokenAlert || !cfg.tokenAlert.enabled) return
          const n = readTokens()
          if (!n) return
          const warnAt = Number(cfg.tokenAlert.warnAt) || 80000
          const dangerAt = Number(cfg.tokenAlert.dangerAt) || 150000
          const seen = readSeen()
          if (n >= dangerAt && !seen.danger && typeof window.__yshenImportantPopup === 'function') {
            markSeen('danger')
            const acts2 = (cfg.tokenAlert && cfg.tokenAlert.actions) || {}
            window.__yshenImportantPopup({
              theme: 'red',
              autoExpand: true,
              badge: '上下文很满了',
              title: '会话已经用了 ' + fmt(n) + ' token',
              body: '上下文快到 ' + fmt(dangerAt) + ' 了，再聊下去会开始压缩/变慢，重要的东西可能被挤掉。\n要不要开个新会话，或者先让我把要点记下来？'
                + (acts2.summarize ? '\n（你配了"确认后帮我总结"：点确认我就开始总结。）' : '')
                + (acts2.newSession ? '\n（你配了"确认后开新会话"：点确认我就开个新的。）' : ''),
              confirmText: (acts2.summarize && acts2.newSession) ? '总结并开新会话' : (acts2.summarize ? '帮我总结' : (acts2.newSession ? '开新会话' : '知道了')),
              cancelText: '先记着',
            }).then(function (ok) {
              if (!ok) return
              if (acts2.summarize) yspSendToComposer('帮我把这段会话的要点总结一下，写成简短的记忆条目。')
              if (acts2.newSession) setTimeout(yspOpenNewSession, 600)
            })
          } else if (n >= warnAt && !seen.warn && typeof window.__yshenImportantPopup === 'function') {
            markSeen('warn')
            const acts = (cfg.tokenAlert && cfg.tokenAlert.actions) || {}
            window.__yshenImportantPopup({
              theme: 'blue',
              autoExpand: true,
              badge: '上下文提醒',
              title: '会话用了 ' + fmt(n) + ' token',
              body: '单个会话的上下文是有限的。到 ' + fmt(warnAt) + ' 了，提醒你一下——不用现在处理，心里有数就行。'
                + (acts.summarize ? '\n（你配了"确认后帮我总结"：点确认我就开始总结。）' : '')
                + (acts.newSession ? '\n（你配了"确认后开新会话"：点确认我就开个新的。）' : ''),
              confirmText: (acts.summarize && acts.newSession) ? '总结并开新会话' : (acts.summarize ? '帮我总结' : (acts.newSession ? '开新会话' : '知道了')),
              cancelText: '好',
            }).then(function (ok) {
              if (!ok) return
              if (acts.summarize) yspSendToComposer('帮我把这段会话的要点总结一下，写成简短的记忆条目。')
              if (acts.newSession) setTimeout(yspOpenNewSession, 600)
            })
          }
        } catch { /* 提醒失败不影响别的 */ }
      }, 5000)
    }

    try { if (typeof window !== 'undefined') window.__ysAdminPage = AdminPage } catch { /* 调试用 */ }
    return {
      inject: ['slots'],
      apply: function (ctx) {
        try { mountTokenAlert() } catch { /* 提醒挂不上不影响弹窗 */ }
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
          function (props) { return h(AdminPage, props) },
        ))
      },
    }
  },
})
