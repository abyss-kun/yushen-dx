// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
window.__ModuleLoader__.load({
  id: 'dsh-yushen-twins',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const API = '/api/dayu'
    const NOTICE_KEY = 'yushen.notice.v1'

    // —— 点按音效：现场合成，不用任何音频文件（也就不涉及素材授权） ——
    let ysnAudio = null
    function ysnTone({ f0, f1, dur = 0.08, gain = 0.22, type = 'sine' }) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        if (!ysnAudio) ysnAudio = new AC()
        const c = ysnAudio
        if (c.state === 'suspended') c.resume().catch(() => {})
        const t0 = c.currentTime
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
        g.connect(c.destination)
        const o = c.createOscillator()
        o.type = type
        o.frequency.setValueAtTime(f0, t0)
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
        o.connect(g)
        o.start(t0)
        o.stop(t0 + dur + 0.02)
      } catch { /* 没声音不影响功能 */ }
    }
    // 按下往下沉、松开往上挑——和“往下压一下再弹回来”的动作配对
    function ysnPress() { ysnTone({ f0: 330, f1: 170, dur: 0.085, gain: 0.18 }) }
    function ysnRelease() { ysnTone({ f0: 210, f1: 300, dur: 0.07, gain: 0.14 }) }

    const css = {
      page: { padding: '22px 26px 40px', boxSizing: 'border-box', height: '100%', overflow: 'auto', maxWidth: '1100px' },
      title: { fontSize: '22px', fontWeight: 650, letterSpacing: '.02em', marginBottom: '4px' },
      sub: { fontSize: '13px', opacity: 0.65, marginBottom: '18px' },
      card: { border: '1px solid rgba(128,128,128,.22)', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', background: 'var(--dsw-alias-bg-elevated, rgba(20,28,40,.72))', backdropFilter: 'blur(8px)' },
      h: { fontSize: '13px', fontWeight: 600, letterSpacing: '.04em', opacity: 0.7, marginBottom: '8px' },
      row: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '12px' },
      item: { display: 'grid', gap: '6px', padding: '7px 0', borderTop: '1px solid rgba(128,128,128,.12)', fontSize: '13px', alignItems: 'center' },
      muted: { opacity: 0.55 },
      err: { color: '#f87171', fontSize: '13px', marginTop: '8px' },
      tabbar: { display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' },
      tab: { padding: '6px 14px', borderRadius: '9px', border: '1px solid rgba(128,128,128,.22)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' },
      tabActive: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
      chatWrap: { display: 'flex', flexDirection: 'column', height: 'calc(100% - 96px)', minHeight: '380px' },
      chatHead: { display: 'flex', alignItems: 'baseline', gap: '10px', fontWeight: 600, marginBottom: '8px', fontSize: '15px' },
      chatHint: { fontSize: '12px', opacity: 0.55, fontWeight: 400 },
      msgList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid rgba(128,128,128,.18)', borderRadius: '12px', minHeight: '240px' },
      msgUser: { alignSelf: 'flex-end', maxWidth: '82%', background: '#2563eb', color: '#fff', padding: '8px 12px', borderRadius: '12px', fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.6 },
      msgFish: { alignSelf: 'flex-start', maxWidth: '82%', background: 'rgba(128,128,128,.14)', padding: '8px 12px', borderRadius: '12px', fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.6 },
      msgMeta: { fontSize: '11px', opacity: 0.6, marginBottom: '3px' },
      composer: { display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'flex-end' },
      input: { flex: 1, resize: 'vertical', minHeight: '64px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' },
      select: { padding: '7px 10px', borderRadius: '9px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', fontSize: '13px', maxWidth: '240px' },
      searchRow: { display: 'flex', gap: '8px', marginTop: '8px' },
      searchInput: { flex: 1, padding: '8px 10px', borderRadius: '9px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', fontSize: '13px', boxSizing: 'border-box' },
      smallBtn: { padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,.3)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
      searchPop: { position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 8px)', zIndex: 60, padding: '12px', borderRadius: '14px', border: '1px solid rgba(128,128,128,.28)', background: 'var(--dsw-alias-bg-elevated, #1f2937)', boxShadow: '0 18px 50px rgba(0,0,0,.4)' },
      searchHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '8px' },
      recentRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' },
      recentChip: { padding: '3px 9px', borderRadius: '999px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
      hits: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '180px', overflow: 'auto' },
      hitRow: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 10px', border: '1px solid rgba(128,128,128,.15)', borderRadius: '9px', fontSize: '12px' },
      hitText: { flex: 1, minWidth: 0 },
      hitSnippet: { opacity: 0.6, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      chips: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' },
      chip: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '999px', background: 'rgba(96,165,250,.18)', fontSize: '12px' },
      chipX: { border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '12px', opacity: 0.7 },
      home: { display: 'flex', flexDirection: 'column', height: 'calc(100% - 96px)', overflow: 'auto' },
      nativePage: { padding: '10px 14px 0', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
      chatPage: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
      chatList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 2px 12px' },
      chatEmpty: { margin: 'auto', opacity: 0.45, fontSize: '13px' },
      bubbleRowUser: { display: 'flex', justifyContent: 'flex-end' },
      bubbleRowFish: { display: 'flex', justifyContent: 'flex-start' },
      bubbleUser: { maxWidth: '78%', background: '#2563eb', color: '#fff', padding: '9px 13px', borderRadius: '14px 14px 4px 14px', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
      bubbleFish: { maxWidth: '78%', background: 'rgba(128,128,128,.16)', padding: '9px 13px', borderRadius: '14px 14px 14px 4px', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
      bubbleTime: { fontSize: '10px', opacity: 0.5, marginTop: '4px' },
      chatBar: { display: 'flex', gap: '8px', alignItems: 'flex-end', paddingTop: '10px', borderTop: '1px solid rgba(128,128,128,.15)' },
      chatInput: { flex: 1, resize: 'none', minHeight: '42px', maxHeight: '120px', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', fontSize: '14px', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' },
      homeWrap: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
      fishRow: { display: 'flex', alignItems: 'flex-end', gap: '56px' },
      fishBtn: { border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' },
      fishDayu: { width: '360px', maxWidth: '40vw', display: 'block', filter: 'drop-shadow(0 24px 32px rgba(0,0,0,.5))', transition: 'transform .18s ease' },
      fishXiaoyu: { width: '210px', maxWidth: '24vw', display: 'block', filter: 'drop-shadow(0 18px 24px rgba(0,0,0,.4))', transition: 'transform .18s ease' },
      fishName: { fontSize: '14px', opacity: 0.75 },
      gearBtn: { position: 'absolute', right: '18px', bottom: '16px', width: '34px', height: '34px', borderRadius: '50%', border: '1px solid rgba(128,128,128,.3)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '16px' },
      gearMenu: { position: 'absolute', right: '18px', bottom: '58px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', borderRadius: '12px', border: '1px solid rgba(128,128,128,.25)', background: 'var(--dsw-alias-bg-elevated, #1f2937)', boxShadow: '0 14px 40px rgba(0,0,0,.4)' },
      gearItem: { padding: '7px 16px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '13px', textAlign: 'left' },
      nestStage: { flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '14px', padding: '6px 2px 0', minHeight: 0, position: 'relative' },
      nestSlot: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative', flex: 1, minWidth: 0 },
      nestImgWrap: { position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer', outline: 'none', borderRadius: '14px', transition: 'transform .18s ease' },
      nestImg: { maxWidth: '100%', maxHeight: '210px', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 14px 22px rgba(0,0,0,.35))', transition: 'transform .18s ease', userSelect: 'none', pointerEvents: 'none' },
      nestName: { fontSize: '13px', padding: '2px 12px', borderRadius: '999px', background: 'rgba(128,128,128,.14)' },
      nestHint: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '11px', opacity: 0.7, textAlign: 'center', marginTop: '8px', lineHeight: 1.7 },
      nestHint2: { fontSize: '11px', color: '#fbbf24', textAlign: 'center', marginTop: '4px' },
      catchBtn: { padding: '3px 10px', borderRadius: '999px', border: '1px solid rgba(128,128,128,.35)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '11px' },
      catchOn: { borderColor: '#f59e0b', color: '#fbbf24' },
      guestRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginTop: '8px' },
      guestItem: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
      guestImg: { width: '48px', height: '48px', objectFit: 'contain', cursor: 'pointer', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,.35))' },
      guestX: { position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '10px', cursor: 'pointer', lineHeight: '16px', padding: 0 },
      guestName: { fontSize: '10px', opacity: 0.6, maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      nestEmpty: { width: '100%', maxWidth: '140px', height: '170px', border: '1.5px dashed rgba(128,128,128,.4)', borderRadius: '14px', display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'transparent', color: 'inherit', fontSize: '12px', opacity: 0.75, lineHeight: 1.8, textAlign: 'center', margin: 'auto' },
      nestOver: { outline: '2px solid #60a5fa', outlineOffset: '3px', background: 'rgba(96,165,250,.08)' },
      nestMenu: { position: 'absolute', bottom: 'calc(100% - 4px)', left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', flexDirection: 'column', padding: '6px', borderRadius: '12px', border: '1px solid rgba(128,128,128,.28)', background: 'var(--dsw-alias-bg-elevated, #1f2937)', boxShadow: '0 14px 40px rgba(0,0,0,.4)' },
      nestMenuItem: { padding: '6px 14px', borderRadius: '7px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px', textAlign: 'left', whiteSpace: 'nowrap' },
      nestBackdrop: { position: 'fixed', inset: 0, zIndex: 89 },
      roleRow: { display: 'flex', gap: '10px', margin: '12px 0' },
      roleCard: { flex: 1, padding: '12px 10px', borderRadius: '12px', border: '1px solid rgba(128,128,128,.25)', cursor: 'pointer', background: 'transparent', color: 'inherit', textAlign: 'center', fontSize: '13px', lineHeight: 1.8 },
      roleCardOn: { borderColor: '#2563eb', background: 'rgba(37,99,235,.12)' },
      previewBox: { display: 'grid', placeItems: 'center', padding: '10px', borderRadius: '12px', background: 'rgba(128,128,128,.08)', marginBottom: '12px', minHeight: '120px' },
      previewImg: { maxWidth: '170px', maxHeight: '170px', objectFit: 'contain' },
      lookRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: '1px solid rgba(128,128,128,.12)', flexWrap: 'wrap' },
      lookImg: { width: '66px', height: '84px', objectFit: 'contain', borderRadius: '10px', background: 'rgba(128,128,128,.08)', flex: '0 0 auto' },
      subPage: { padding: '10px 18px 18px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 900 },
      subHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flex: '0 0 auto' },
      pair: { display: 'flex', alignItems: 'center', gap: '4px' },
      pairImg: { width: '26px', height: '26px', borderRadius: '50%', objectFit: 'contain', cursor: 'pointer', opacity: 0.55, background: 'rgba(128,128,128,.12)', border: '1px solid transparent', flex: '0 0 auto' },
      pairImgOn: { opacity: 1, borderColor: 'rgba(96,165,250,.75)' },
      backBtn: { width: '28px', height: '28px', borderRadius: '50%', border: '1px solid rgba(128,128,128,.28)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '14px' },
      subTitle: { fontSize: '15px', fontWeight: 600, letterSpacing: '.03em' },
      ovGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '8px' },
      ovCard: { border: '1px solid rgba(128,128,128,.2)', borderRadius: '14px', padding: '16px', minHeight: '100px' },
      bigNum: { fontSize: '26px', fontWeight: 650, letterSpacing: '.02em', margin: '6px 0 4px' },
      tokenCard: { border: '1px solid rgba(128,128,128,.2)', borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', overflowX: 'auto' },
      tokenStats: { display: 'flex', gap: '36px', border: '1px solid rgba(128,128,128,.2)', borderRadius: '14px', padding: '14px 18px', marginBottom: '10px' },
      statNum: { fontSize: '20px', fontWeight: 650, marginTop: '2px' },
      barRow: { display: 'grid', gridTemplateColumns: '170px 1fr 130px', gap: '10px', alignItems: 'center', padding: '4px 0', fontSize: '12px' },
      sourceRow: { display: 'grid', gridTemplateColumns: 'minmax(80px, 150px) minmax(0, 1fr) 56px 68px', gap: '6px', alignItems: 'center', padding: '5px 0', fontSize: '12px' },
      filterBtn: { padding: '4px 11px', borderRadius: '999px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
      filterActive: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
      barName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
      barBg: { height: '8px', background: 'rgba(128,128,128,.18)', borderRadius: '999px', overflow: 'hidden' },
      barFill: { height: '100%', background: '#3b82f6', borderRadius: '999px' },
      barMeta: { textAlign: 'right', opacity: 0.7 },
      turnHead: { display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) 40px 58px 58px 56px', gap: '5px', fontSize: '11px', opacity: 0.55, padding: '4px 0' },
      turnRow: { display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) 40px 58px 58px 56px', gap: '5px', fontSize: '12px', padding: '3px 0', borderTop: '1px solid rgba(128,128,128,.08)' },
      treasureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', padding: '4px' },
      thumbBtn: { padding: 0, border: '1px solid rgba(128,128,128,.2)', borderRadius: '10px', overflow: 'hidden', background: 'transparent', cursor: 'pointer', aspectRatio: '1' },
      thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      bigOverlay: { position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: '30px' },
      bigImg: { maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' },
      archiveWrap: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '10px', minHeight: '320px' },
      archiveList: { overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' },
      archiveItem: { textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(128,128,128,.15)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
      archiveText: { margin: 0, padding: '12px', border: '1px solid rgba(128,128,128,.15)', borderRadius: '10px', overflow: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap', maxHeight: 'calc(100vh - 230px)' },
      statusStrip: { display: 'flex', gap: '18px', alignItems: 'center', padding: '8px 12px', border: '1px solid rgba(128,128,128,.18)', borderRadius: '10px', marginBottom: '10px', fontSize: '12px', opacity: 0.9 },
      taskBar: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' },
      taskInput: { flex: 1, padding: '9px 12px', borderRadius: '10px', border: '1px solid rgba(128,128,128,.25)', background: 'transparent', color: 'inherit', fontSize: '13px' },
      taskRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderTop: '1px solid rgba(128,128,128,.1)', fontSize: '13px' },
      taskChip: { padding: '3px 10px', borderRadius: '999px', border: '1px solid rgba(128,128,128,.3)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
      centerWrap: { margin: 'auto', width: '100%', maxWidth: '860px', display: 'flex', flexDirection: 'column' },
      hero: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' },
      heroTitle: { fontSize: '30px', fontWeight: 650, letterSpacing: '.03em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' },
      badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(128,128,128,.4)', opacity: 0.75, fontWeight: 400 },
      heroSub: { fontSize: '13px', opacity: 0.6, marginTop: '10px', textAlign: 'center' },
      metaRow: { display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' },
      metaChip: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 6px', fontSize: '13px', opacity: 0.8 },
      composerCard: { width: '100%', background: 'rgba(14,16,22,.72)', backdropFilter: 'blur(12px)', borderRadius: '20px', padding: '16px 18px 12px', border: '1px solid rgba(255,255,255,.06)', boxSizing: 'border-box' },
      composerInput: { width: '100%', minHeight: '84px', border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: '15px', resize: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' },
      composerBar: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'nowrap' },
      plusBtn: { width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '18px', lineHeight: 1, opacity: 0.65 },
      pill: { padding: '4px 6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'inherit', fontSize: '13px', maxWidth: '240px', opacity: 0.8 },
      sendBtn: { width: '34px', height: '34px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px', marginLeft: 'auto' },
      chatBody: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '6px 0 12px', minHeight: '120px' },
      footHint: { fontSize: '11px', opacity: 0.45, textAlign: 'center', marginTop: '8px' },
      empty: { opacity: 0.5, fontSize: '13px', textAlign: 'center', padding: '30px 0' },
      switchRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: '1px solid rgba(128,128,128,.12)', fontSize: '14px', cursor: 'pointer' },
      switchHint: { fontSize: '12px', opacity: 0.55, marginLeft: 'auto' },
      overlay: { position: 'fixed', inset: 0, zIndex: 9999, padding: '20px', background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center' },
      modal: { width: 'min(520px, 100%)', maxHeight: '85vh', overflow: 'auto', boxSizing: 'border-box', padding: '22px 24px', borderRadius: '14px', border: '1px solid rgba(96,165,250,.4)', background: 'var(--dsw-alias-bg-elevated, #1f2937)', color: 'var(--dsw-alias-label-primary, #f3f4f6)', boxShadow: '0 20px 60px rgba(0,0,0,.45)', fontSize: '14px', lineHeight: 1.7, margin: 'auto' },
      modalTitle: { fontSize: '18px', fontWeight: 650, marginBottom: '10px' },
      modalText: { marginBottom: '8px' },
      modalSmall: { fontSize: '12px', opacity: 0.65, marginBottom: '14px' },
      modalRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', opacity: 0.8, marginBottom: '14px' },
      btn: { padding: '8px 18px', borderRadius: '9px', border: '1px solid rgba(96,165,250,.5)', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '13px' },
    }

    // 鱼窝的样式单独走一份带类名的表：内联样式做不了媒体查询、hover、focus-visible。
    // 类名统一 ysn- 前缀，避免和宿主 / 别的插件撞。
    const NEST_STYLE = `
.ysn-root{position:relative;z-index:900;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;color:#eaf2ff;isolation:isolate;background:#0b1622}
.ysn-bg{position:absolute;inset:0;z-index:0;background-image:linear-gradient(180deg,rgba(4,10,18,.62) 0%,rgba(4,10,18,.18) 26%,rgba(4,10,18,0) 56%,rgba(4,10,18,.22) 100%),url("/yushen-assets/nest/bg");background-size:cover;background-position:center 58%;background-repeat:no-repeat}
.ysn-inner{position:relative;z-index:1;height:100%;min-height:0;display:flex;flex-direction:column;padding:14px 18px 12px;box-sizing:border-box}
.ysn-head{flex:0 0 auto;display:flex;align-items:flex-start;gap:12px;min-height:0}
.ysn-title{font-size:20px;font-weight:650;letter-spacing:.06em;line-height:1.3;text-shadow:0 2px 16px rgba(0,0,0,.6)}
.ysn-sub{font-size:12px;line-height:1.6;opacity:.78;margin-top:2px;text-shadow:0 1px 8px rgba(0,0,0,.6)}
.ysn-head-side{margin-left:auto;display:flex;align-items:center;gap:8px;flex:0 0 auto}
.ysn-zoom{display:flex;align-items:center;gap:1px;padding:2px;border-radius:999px;background:rgba(10,20,32,.55);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(6px)}
.ysn-zoom-btn{border:0;background:transparent;color:#eaf2ff;font-family:inherit;font-size:13px;line-height:1;padding:5px 6px;border-radius:999px;cursor:pointer;min-width:24px}
.ysn-zoom-btn:hover{background:rgba(96,165,250,.22)}
.ysn-zoom-btn:focus-visible{outline:2px solid #7cc4ff;outline-offset:1px}
.ysn-zoom-btn:disabled{opacity:.35;cursor:default}
.ysn-zoom-btn[data-pct="1"]{font-size:10px;min-width:34px;opacity:.85}
.ysn-icon-btn{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.24);background:rgba(10,20,32,.55);color:#eaf2ff;cursor:pointer;font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);transition:background .18s ease,border-color .18s ease,transform .18s ease}
.ysn-icon-btn:hover{background:rgba(30,60,90,.75);border-color:rgba(255,255,255,.42)}
.ysn-icon-btn:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
.ysn-icon-btn[aria-expanded="true"]{background:rgba(37,99,235,.72);border-color:rgba(124,196,255,.8)}
.ysn-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:flex-end;justify-content:center;gap:clamp(2px,3vw,44px);padding:4px 2px 2px;margin-top:2px}
.ysn-stage{/* 两边各留一点，让人不贴边；右下角那块桌宠的地方也就不挡名字了 */padding:0 min(9vw,96px)}
.ysn-slot{position:relative;flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}
.ysn-slot-dayu{z-index:2}
.ysn-slot-xiaoyu{z-index:2;flex:.92 1 0}
.ysn-slot-hero{z-index:1;flex:1.14 1 0;transform:translateY(-16px)}
.ysn-slot-hero::before{content:'';position:absolute;left:50%;bottom:5%;width:98%;height:72%;transform:translateX(-50%);background:radial-gradient(ellipse at 50% 66%,rgba(116,185,181,.2),rgba(116,185,181,0) 68%);filter:blur(10px);pointer-events:none;z-index:0}
.ysn-slot-open{z-index:32}
.ysn-fig{position:relative;height:auto;width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;padding:0;margin:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;border-radius:16px;outline:none;-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation;transform:scale(var(--ysn-zoom,1));transform-origin:50% 100%;transition:transform .16s ease}
.ysn-crown{position:absolute;left:50%;bottom:calc(100% + 2px);width:150px;height:40px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;z-index:7;pointer-events:none;color:var(--rank-color,#9fd8d2)}
.ysn-crown[data-role="dayu"]{--rank-color:#78b8ff}
.ysn-crown[data-role="xiaoyu"]{--rank-color:#83e0dd}
.ysn-crown[data-role="dragon"]{--rank-color:#e3c27c}
.ysn-rank-chip{position:relative;z-index:2;display:inline-flex;align-items:center;justify-content:center;min-height:17px;padding:1px 9px;border-radius:999px;border:1px solid currentColor;background:rgba(4,13,22,.78);box-shadow:0 0 10px rgba(120,190,220,.18);font-size:10px;line-height:1.45;letter-spacing:.06em;white-space:nowrap;backdrop-filter:blur(4px)}
.ysn-xp{display:block;position:relative;z-index:2;width:132px;height:6px;border-radius:999px;overflow:hidden;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.18)}
.ysn-xp-fill{display:block;height:100%;min-width:0;border-radius:999px;background:linear-gradient(90deg,currentColor,rgba(255,255,255,.92));box-shadow:0 0 8px currentColor;transition:width .6s ease}
.ysn-xp-num{position:relative;z-index:2;font-size:9px;line-height:1.3;color:#d9e9f2;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap;letter-spacing:.02em}
.ysn-art{position:relative;flex:0 0 auto;min-height:0;width:100%;height:var(--ysn-h,220px);display:flex;align-items:flex-end;justify-content:center;border-radius:16px}
.ysn-art .ysn-character{display:block;width:auto;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:bottom center;filter:drop-shadow(0 18px 22px rgba(0,0,0,.42));transition:transform .22s cubic-bezier(.2,.8,.2,1),filter .22s ease;user-select:none;-webkit-user-drag:none}
  /* 2026-10-28：入场——三个人错开冒出来，不要干站着（老板说太难看了）
     只用 transform/opacity，400ms 结束；系统设了"减少动态"就跳过 */
  @keyframes ysn-enter{from{opacity:0;transform:translateY(22px) scale(.985)}to{opacity:1;transform:none}}
  .ysn-slot .ysn-art{animation:ysn-enter .46s cubic-bezier(.22,.9,.3,1) both}
  .ysn-slot-dayu .ysn-art{animation-delay:.02s}
  .ysn-slot-hero .ysn-art{animation-delay:.12s}
  .ysn-slot-xiaoyu .ysn-art{animation-delay:.22s}
  @media (prefers-reduced-motion: reduce){.ysn-slot .ysn-art{animation:none}}
  .ysn-fig:hover .ysn-art .ysn-character,.ysn-fig:focus-visible .ysn-art .ysn-character{transform:translateY(-5px);filter:drop-shadow(0 24px 28px rgba(0,0,0,.5))}
.ysn-fig:focus-visible .ysn-art{outline:2px solid #7cc4ff;outline-offset:5px}
    /* 按下去：以底部为原点压扁一点、往下沉 2px；松手先往上抬一点，再落回 */
    .ysn-fig:active{transform:translateY(2px) scale(calc(var(--ysn-zoom,1) * 1.03),calc(var(--ysn-zoom,1) * 0.97))}
    .ysn-fig-hit{animation:ysn-hop .26s cubic-bezier(.22,.9,.32,1)}
    @keyframes ysn-hop{
      0%{transform:translateY(2px) scale(calc(var(--ysn-zoom,1) * 1.03),calc(var(--ysn-zoom,1) * 0.97))}
      55%{transform:translateY(-7px) scale(calc(var(--ysn-zoom,1) * 0.985),calc(var(--ysn-zoom,1) * 1.015))}
      100%{transform:translateY(0) scale(var(--ysn-zoom,1))}
    }
    @media (prefers-reduced-motion: reduce){.ysn-fig-hit{animation:none}}
.ysn-shadow{position:absolute;left:50%;bottom:0;width:62%;height:16px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.42),rgba(0,0,0,0) 72%);filter:blur(2px);pointer-events:none}
.ysn-name{flex:0 0 auto;max-width:100%;display:flex;flex-direction:column;align-items:center;overflow:hidden;font-size:13px;line-height:1.35;padding:3px 12px 4px;border-radius:14px;background:rgba(6,14,24,.62);border:1px solid rgba(255,255,255,.16);color:#f1f7ff;text-shadow:0 1px 4px rgba(0,0,0,.5);backdrop-filter:blur(6px)}
.ysn-name-text{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ysn-post{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:1.35;opacity:.78;letter-spacing:.02em;margin-top:1px}
.ysn-title-row{display:flex;align-items:center;gap:8px}
.ysn-crest{font-size:10px;line-height:1.6;letter-spacing:.18em;padding:1px 7px 1px 9px;border-radius:4px;border:1px solid rgba(216,172,98,.42);background:rgba(216,172,98,.08);color:#e8cd95;font-weight:400;text-shadow:none}
.ysn-slot-hero .ysn-name{font-size:14px;padding:4px 14px 5px;border-color:rgba(216,172,98,.55);background:linear-gradient(180deg,rgba(26,36,40,.9),rgba(8,18,22,.9));box-shadow:0 12px 28px rgba(0,0,0,.4),0 0 0 1px rgba(216,172,98,.1)}
.ysn-slot-hero .ysn-post{font-size:11px;color:#e8cd95;opacity:.95}
.ysn-slot-dayu .ysn-name{border-color:rgba(124,196,255,.38)}
.ysn-slot-dayu .ysn-post{color:#a9d1ff}
.ysn-slot-xiaoyu .ysn-name{border-color:rgba(116,185,181,.35);font-size:12px;background:rgba(6,14,24,.54)}
.ysn-slot-xiaoyu .ysn-post{color:#9fd8d2}
.ysn-slot-hero .ysn-fig{position:relative;z-index:1}
.ysn-slot-hero .ysn-art::before{content:'';position:absolute;left:50%;bottom:-7px;width:82%;height:18px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.4),rgba(0,0,0,0) 72%);border:1px solid rgba(216,172,98,.2);box-shadow:0 12px 26px rgba(0,0,0,.3);pointer-events:none;z-index:0}
.ysn-slot-hero .ysn-art::after{content:'';position:absolute;left:50%;bottom:-4px;width:74%;height:18px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(216,172,98,.3),rgba(216,172,98,0) 72%);filter:blur(3px);pointer-events:none;z-index:0}
.ysn-slot-hero .ysn-art .ysn-character{position:relative;z-index:1;filter:drop-shadow(0 26px 36px rgba(0,0,0,.52))}
.ysn-fig:hover .ysn-name{border-color:rgba(124,196,255,.55)}
.ysn-drop .ysn-art{outline:2px dashed #7cc4ff;outline-offset:5px;background:rgba(96,165,250,.08)}
.ysn-broken{width:100%;max-width:150px;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed rgba(255,255,255,.4);border-radius:14px;background:rgba(6,14,24,.35);font-size:12px;line-height:1.7;text-align:center}
.ysn-empty{width:100%;max-width:150px;min-height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed rgba(255,255,255,.32);border-radius:14px;background:rgba(6,14,24,.28);font-size:12px;opacity:.85;color:inherit;font-family:inherit;cursor:pointer}
.ysn-guests{flex:0 0 auto;display:flex;align-items:center;gap:8px;max-width:100%;overflow-x:auto;padding:6px 2px 2px;scrollbar-width:thin}
.ysn-guests-label{flex:0 0 auto;font-size:11px;opacity:.6;letter-spacing:.08em}
.ysn-guest{position:relative;flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:1px;padding:0 3px}
.ysn-guest img{width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 5px 7px rgba(0,0,0,.4))}
.ysn-guest-name{max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;opacity:.72}
.ysn-guest-x{position:absolute;top:-5px;right:-1px;width:17px;height:17px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.72);color:#fff;font-size:10px;line-height:1;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center}
.ysn-guest-x:hover{background:#b91c1c}
.ysn-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:7px 10px;margin-top:6px;border-radius:12px;background:rgba(5,12,20,.42);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(6px);font-size:11px;line-height:1.6;color:rgba(238,246,255,.82);text-align:center}
.ysn-catch{padding:3px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;cursor:pointer;font-size:11px;line-height:1.6;white-space:nowrap;font-family:inherit}
.ysn-catch:hover{border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.08)}
.ysn-catch:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
.ysn-catch[data-on="1"]{border-color:#f59e0b;color:#fbbf24;background:rgba(245,158,11,.14)}
.ysn-toast{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);z-index:25;max-width:min(520px,calc(100% - 24px));padding:7px 14px;border-radius:10px;background:rgba(10,20,32,.92);border:1px solid rgba(251,191,36,.5);color:#fde68a;font-size:12px;line-height:1.6;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.4)}
    /* 桌宠气泡：长在宠物身上；小的时候是椭圆，放大后慢慢变成圆角方框（圆角由 React 按实际宽高算） */
    .ysn-bubble{display:block;position:absolute;left:50%;bottom:calc(100% + 44px);z-index:12;max-width:min(250px,82vw);padding:11px 16px;box-sizing:border-box;background:rgba(255,255,255,.97);border:1px solid rgba(40,100,160,.4);color:#15578f;font-size:13.5px;line-height:1.6;text-align:center;box-shadow:0 16px 34px rgba(0,0,0,.4);cursor:pointer;pointer-events:auto;transition:border-radius .28s ease,width .28s ease,font-size .28s ease}
    .ysn-bubble::after{content:'';position:absolute;left:50%;bottom:-8px;width:13px;height:11px;transform:translateX(-50%);border-radius:50%;background:inherit;border:1px solid rgba(70,100,150,.35)}
    .ysn-bubble[data-kind="run"]{border-color:rgba(59,130,246,.6)}
    .ysn-bubble[data-kind="cost"]{border-color:rgba(217,119,6,.6)}
    .ysn-bubble[data-kind="info"]{border-color:rgba(100,116,139,.45)}
    .ysn-bubble[data-kind="idle"]{border-color:rgba(120,170,210,.55);color:#2a6ea3}
    @media (prefers-reduced-motion: reduce){.ysn-bubble{transition:none}}
.ysn-catchbar{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:25;padding:6px 14px;border-radius:999px;background:rgba(245,158,11,.94);color:#1b1305;font-size:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.ysn-catching .ysn-stage{cursor:crosshair}
.ysn-foot-catch{border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.12);color:#fde68a}
.ysn-foot-catch .ysn-catch{border-color:rgba(253,230,138,.75);background:#fbbf24;color:#1b1305;font-weight:600}
.ysn-menu{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);z-index:31;display:flex;flex-direction:column;gap:2px;min-width:132px;padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(16,26,40,.97);box-shadow:0 16px 40px rgba(0,0,0,.5);animation:ysn-pop .14s ease-out}
.ysn-menu button{border:0;background:transparent;color:#eef5ff;text-align:left;padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
.ysn-menu button:hover,.ysn-menu button:focus-visible{background:rgba(96,165,250,.24);outline:none}
.ysn-menu-sep{height:1px;margin:3px 4px;background:rgba(255,255,255,.12)}
.ysn-backdrop{position:fixed;inset:0;z-index:30;background:transparent}
.ysn-gear{position:absolute;top:58px;right:16px;z-index:41;display:flex;flex-direction:column;gap:2px;min-width:132px;padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(16,26,40,.97);box-shadow:0 16px 40px rgba(0,0,0,.5);animation:ysn-pop .14s ease-out}
.ysn-gear button{border:0;background:transparent;color:#eef5ff;text-align:left;padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
.ysn-gear button:hover,.ysn-gear button:focus-visible{background:rgba(96,165,250,.24);outline:none}
.ysn-fr-mascot{display:block;width:132px;height:auto;margin:0 auto 14px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.ysn-firstrun{margin:auto;max-width:760px;padding:30px 28px;text-align:center;border-radius:18px;border:1px solid rgba(120,170,230,.22);background:rgba(6,14,24,.62);backdrop-filter:blur(10px)}
.ysn-fr-title{font-size:26px;font-weight:650;letter-spacing:.04em}
.ysn-fr-sub{font-size:14px;opacity:.7;margin:8px 0 22px}
.ysn-fr-cards{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.ysn-fr-card{flex:1 1 240px;max-width:320px;padding:18px 16px;border-radius:14px;border:1px solid rgba(140,190,255,.32);background:rgba(255,255,255,.05);color:inherit;cursor:pointer;text-align:left;font:inherit;transition:border-color .15s ease,background .15s ease}
.ysn-fr-card:hover{border-color:rgba(140,190,255,.7);background:rgba(96,165,250,.12)}
.ysn-fr-card b{display:block;font-size:16px;margin-bottom:4px}
.ysn-fr-card span{font-size:12px;opacity:.7}
.ysn-fr-note{margin-top:18px;font-size:12px;opacity:.55}
.ysn-fr-mask{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(4,8,14,.66);backdrop-filter:blur(6px)}
.ysn-fr-modal{width:min(620px,100%);padding:26px 24px;border-radius:16px;border:1px solid rgba(124,196,255,.38);background:linear-gradient(180deg,rgba(25,38,56,.98),rgba(16,26,40,.98));box-shadow:0 24px 70px rgba(0,0,0,.55);text-align:center}
.ysn-fr-cancel{margin-top:16px;padding:8px 22px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:transparent;color:inherit;font:inherit;cursor:pointer}
.ysn-help-btn{position:absolute;right:18px;bottom:14px;z-index:22;width:34px;height:34px;border-radius:50%;border:1px solid rgba(140,190,255,.35);background:rgba(8,18,30,.6);color:#cfe3ff;font-size:15px;cursor:pointer;backdrop-filter:blur(6px)}
.ysn-help-btn:hover{border-color:rgba(140,190,255,.9)}
.ysn-add-role{position:absolute;left:18px;bottom:14px;z-index:22;padding:7px 14px;border-radius:999px;border:1px dashed rgba(140,190,255,.45);background:rgba(8,18,30,.6);color:#cfe3ff;font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(6px)}
.ysn-add-role:hover{border-color:rgba(140,190,255,.9);background:rgba(96,165,250,.18)}
.ysn-fr-kicker{font-size:11px;letter-spacing:.18em;color:#e0b15c;margin-bottom:6px}
.ysn-welcome{text-align:left}
.ysn-welcome .ysn-fr-title{text-align:center}
.ysn-welcome .ysn-fr-sub{text-align:center}
.ysn-w-list{display:flex;flex-direction:column;gap:10px;margin:16px 0;font-size:13.5px;line-height:1.7;color:#c4d6e6}
.ysn-w-list b{color:#eaf2ff;margin-right:6px}
.ysn-w-steps{text-align:center;font-size:13px;color:#8fb2cc;margin:6px 0 14px}
.ysn-w-license{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.9;color:#c4d6e6}
.ysn-w-license .ysn-ok{color:#7ee0b0;font-weight:600}
.ysn-w-license .ysn-no{color:#ffb4a8;font-weight:600}
.ysn-w-start{display:block;margin:18px auto 0;padding:10px 34px;border:0;background:linear-gradient(180deg,#e8c07a,#d9a84f);color:#06202f;font-weight:600;border-radius:12px;cursor:pointer}
.ysn-state{margin:auto;max-width:420px;padding:18px 20px;text-align:center;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(6,14,24,.6);font-size:13px;line-height:1.8;backdrop-filter:blur(8px)}
.ysn-state button{margin-top:10px;padding:7px 16px;border-radius:9px;border:1px solid rgba(96,165,250,.6);background:#2563eb;color:#fff;cursor:pointer;font-size:13px}
.ysn-notice-back{position:fixed;inset:0;z-index:2147483005;display:grid;place-items:center;padding:18px;background:rgba(4,8,14,.66);backdrop-filter:blur(7px)}
.ysn-notice{width:min(520px,100%);max-height:85vh;overflow:auto;box-sizing:border-box;padding:22px 24px;border-radius:16px;border:1px solid rgba(124,196,255,.38);background:linear-gradient(180deg,rgba(25,38,56,.98),rgba(16,26,40,.98));color:#eef5ff;box-shadow:0 24px 70px rgba(0,0,0,.55);font-size:14px;line-height:1.75;animation:ysn-pop .18s ease-out}
.ysn-notice h2{margin:0 0 10px;font-size:18px;font-weight:650}
.ysn-notice p{margin:0 0 8px}
.ysn-notice .ysn-small{font-size:12px;opacity:.65;margin-bottom:14px}
.ysn-notice-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:6px}
.ysn-notice label{display:inline-flex;align-items:center;gap:7px;font-size:12px;opacity:.82;cursor:pointer}
.ysn-notice .ysn-primary{padding:8px 20px;border-radius:9px;border:1px solid rgba(96,165,250,.6);background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-family:inherit}
.ysn-notice .ysn-primary:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
.ysn-subpage{background:#f5f7fa;color:#16202c}
body[data-ds-dark-theme] .ysn-subpage{background:#0f1622;color:#eaf2ff}
.ysc-panel{background:rgba(8,14,22,.72);border:1px solid rgba(255,255,255,.09)}
body:not([data-ds-dark-theme]) .ysc-panel{background:rgba(255,255,255,.92);border-color:rgba(15,23,42,.12)}
.ysc-bubble{background:rgba(19,29,43,.92);border:1px solid rgba(255,255,255,.08)}
body:not([data-ds-dark-theme]) .ysc-bubble{background:rgba(15,23,42,.06);border-color:rgba(15,23,42,.1)}
.ysn-style-note{display:flex;flex-wrap:wrap;gap:4px;align-items:baseline;font-size:12px;line-height:1.6;color:#9fd8d2;margin:-2px 0 10px}
.ysn-style-hint{font-size:11px;opacity:.55;color:inherit}
.ysc-sysbar{display:flex;justify-content:flex-end;padding:0 2px 6px}
.ysc-sysbtn{font:inherit;font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;cursor:pointer;opacity:.75}
.ysc-sysbtn:hover{opacity:1}
.ysn-roster{grid-template-columns:minmax(110px,1.6fr) 62px 62px 46px}
@media (max-width:520px){
  .ysn-roster{grid-template-columns:minmax(100px,1fr) 58px 40px;font-size:11px}
  .ysn-roster>:nth-child(3){display:none}
}
@keyframes ysn-pop{from{opacity:0;transform:translate(-50%,4px)}to{opacity:1;transform:translate(-50%,0)}}
.ysn-gear{animation-name:ysn-pop-static}
@keyframes ysn-pop-static{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:760px){
  #yushen-restart-fab{display:none!important}
  .ysn-zoom-btn{padding:4px 5px;min-width:21px;font-size:12px}
  .ysn-zoom-btn[data-pct="1"]{min-width:30px;font-size:9px}
  .ysn-inner{padding:10px 10px 8px}
  .ysn-title{font-size:17px}
  .ysn-sub{font-size:11px}
  .ysn-icon-btn{width:30px;height:30px;font-size:15px}
  .ysn-stage{gap:2px}
  .ysn-name{font-size:12px;padding:1px 8px}
  .ysn-crown{width:124px;height:38px}
  .ysn-xp{width:96px}
  .ysn-rank-chip{font-size:9px;padding:0 6px}
  .ysn-xp-num{font-size:8px}
  .ysn-foot{font-size:10px;gap:6px;padding:6px 8px}
  .ysn-guest img{width:38px;height:38px}
  .ysn-menu{bottom:54px;min-width:118px}
}
@media (max-width:460px){
  .ysn-sub{display:none}
  .ysn-head{align-items:center}
  .ysn-title{font-size:16px}
  .ysn-foot .ysn-hint-long{display:none}
  .ysn-slot-hero{transform:translateY(-8px);flex:1.05 1 0}
  .ysn-slot-hero .ysn-art::before{display:none}
  .ysn-name{font-size:11px;padding:2px 7px 3px}
  .ysn-post{font-size:9px}
  .ysn-slot-hero .ysn-name{font-size:12px;padding:3px 9px 4px}
  .ysn-slot-hero .ysn-post{font-size:9px}
  .ysn-crown{width:106px;height:36px}
  .ysn-xp{width:82px;height:4px}
  .ysn-rank-chip{min-height:15px;padding:0 5px;font-size:8px}
  .ysn-xp-num{font-size:7px}
}
@media (max-height:560px){
  .ysn-inner{padding-top:8px;padding-bottom:6px}
  .ysn-title{font-size:16px}
  .ysn-sub{display:none}
  .ysn-foot{padding:4px 8px}
}
@media (prefers-reduced-motion:reduce){
  .ysn-character,.ysn-icon-btn,.ysn-fig{transition:none}
  .ysn-menu,.ysn-gear,.ysn-notice{animation:none}
}
`

    async function getJson(path) {
      const res = await fetch(API + path, { credentials: 'same-origin' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      return body
    }

    async function postJson(path, body) {
      const res = await fetch(API + path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data
    }

    function Notice({ onClose }) {
      const [keep, setKeep] = React.useState(false)
      const close = () => {
        try {
          sessionStorage.setItem(NOTICE_KEY + '.session', '1')
          if (keep) localStorage.setItem(NOTICE_KEY, '1')
        } catch { /* 存不了就这次先关掉 */ }
        onClose()
      }
      React.useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', {
        className: 'ysn-notice-back',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '鱼神双子星作品声明',
        onClick: (e) => { if (e.target === e.currentTarget) close() },
      },
      h('div', { className: 'ysn-notice' },
        h('h2', null, '鱼神双子星'),
        h('p', null, '本作品由作者「从零开始」独立构思、从零开发。'),
        h('p', null, '请勿用于商业用途、二次分发，或修改本体；扩展请走公开接口。'),
        h('p', { className: 'ysn-small' }, '完整条款见 LICENSE / COMMERCIAL.md。'),
        h('div', { className: 'ysn-notice-foot' },
          h('label', null,
            h('input', { type: 'checkbox', checked: keep, onChange: (e) => setKeep(e.target.checked) }),
            '不再提示'),
          h('button', { type: 'button', className: 'ysn-primary', onClick: close, autoFocus: true }, '知道了'))))
    }

    function BasePage({ health, roster, days, error, status }) {
      const plugins = roster?.items || []
      const xyOff = status?.switches?.xiaoyu === false
      return h('div', null,
        error ? h('div', { style: css.err }, `读不到：${error}`) : null,
        h('div', { style: css.card },
          h('div', { style: css.h }, '家底'),
          h('div', { style: css.row },
            h('span', null, `profile：${health?.profile ?? '—'}`),
            h('span', null, `名册：${health?.plugins ?? plugins.length ?? '—'} 个`),
            h('span', null, `会话：${health?.sessions?.length ?? '—'} 个`),
            h('span', { style: css.muted }, `小鱼：${xyOff ? '休假中' : days?.ok ? `${days.name}（${days.alias}）在线` : '没应答'}`))),
        h('div', { style: css.card },
          h('div', { style: css.h }, '员工名册（只读）'),
          plugins.length === 0
            ? h('div', { style: css.muted }, health ? '名册是空的：这个 profile 还没装插件。' : '读取中…')
            : h('div', { style: { overflowX: 'auto' } },
              h('div', { className: 'ysn-roster', style: { ...css.item, ...css.muted, borderTop: 'none' } },
                h('span', null, '包名'), h('span', null, '版本'), h('span', null, '来源'), h('span', null, '状态')),
              plugins.map((p) => h('div', { key: p.name, className: 'ysn-roster', style: css.item },
                h('span', { style: css.mono }, p.name),
                h('span', { style: css.muted }, p.version || '—'),
                h('span', { style: css.muted }, p.source),
                h('span', { style: p.installed ? { color: '#34d399' } : css.muted }, p.installed ? '在岗' : '缺席'))))))
    }

    function SwitchPage({ status, setStatus }) {
      const [sw, setSw] = React.useState(status?.switches || { master: true, dayu: true, xiaoyu: true })
      const [note, setNote] = React.useState('')

      React.useEffect(() => { if (status?.switches) setSw(status.switches) }, [status])

      const save = async (patch) => {
        setSw((prev) => ({ ...prev, ...patch }))
        try {
          const r = await postJson('/switches', patch)
          setSw(r.switches)
          if (setStatus) setStatus((prev) => ({ ...(prev || {}), switches: r.switches }))
          const off = Object.values(patch)[0] === false
          const who = patch.master !== undefined ? '两条鱼' : patch.dayu !== undefined ? '大鱼' : '小鱼'
          setNote(`${off ? `已给${who}放假` : `已叫${who}回来上班`}，重启 DSH 后生效。`)
        } catch (e) {
          setNote(String(e?.message ?? e))
        }
      }

      const Toggle = ({ k, label, hint, disabled }) => h('label', { style: { ...css.switchRow, opacity: disabled ? 0.5 : 1 } },
        h('input', { type: 'checkbox', checked: sw[k] !== false, disabled, onChange: (e) => save({ [k]: e.target.checked }) }),
        h('span', null, label),
        h('span', { style: css.switchHint }, hint))

      return h('div', { style: css.card },
        h('div', { style: css.h }, '调试开关（关掉 = 放假）'),
        h('div', { style: { ...css.muted, marginBottom: '8px' } }, '平时两条鱼都在岗。只有排查 bug 时，才临时给谁放个假；放假期间不接活，重启 DSH 后生效。'),
        Toggle({ k: 'master', label: '全体上岗（关掉 = 两条都放假）', hint: '紧急用：两条都休息' }),
        Toggle({ k: 'dayu', label: '大鱼上岗（关掉 = 放假）', hint: '临时休息，排查用', disabled: sw.master === false }),
        Toggle({ k: 'xiaoyu', label: '小鱼上岗（关掉 = 放假）', hint: '临时休息，排查用', disabled: sw.master === false }),
        h('div', { style: css.muted }, note || '平时保持全开；放完假重启 DSH 回来上班。'))
    }

    // 照微：她有自己的本体卡和常驻会话（照微·太上长老），不借两姐妹的会话，也不共用她们的记忆。
    const NEST_ROLES = ['dayu', 'xiaoyu', 'dragon']
    // 站位不是身份表：站位按对外层次排，能力和授权完全不看这个。
    // 照微走她自己的五境，不换算 L0-L3；大鱼/小鱼用 L0-L3 的显示号。
    const NEST_DISPLAY_ORDER = ['dayu', 'dragon', 'xiaoyu']
    const NEST_SCALE = { dayu: 0.94, xiaoyu: 0.86, dragon: 1 }
    const NEST_ORG = {
      dayu: { post: '副总裁', rank: '阶位3', tone: 'blue' },
      xiaoyu: { post: '秘书', rank: '阶位2', tone: 'cyan' },
      dragon: { post: '太上长老', also: '空降总裁', rank: '五境', tone: 'gold' },
    }
    // 五阶光环样机：照微五境、大鱼阶位3、小鱼阶位2；只做显示，不接权限。
    const NEST_HALO_STAGE = { dragon: 5, dayu: 3, xiaoyu: 2 }
    // 后端路由要重启 DSH 才注册；这里带一份同样的 SVG 兜底，刷新页面就能看到。
    const HALO_FALLBACK = {
      dayu: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMjAgMzIwIiByb2xlPSJpbWciIGFyaWEtbGFiZWxsZWRieT0idGl0bGUgZGVzYyI+PHRpdGxlIGlkPSJ0aXRsZSI+ZGF5dSDmt7HmvZwg4oCUIOW+heacuuWKqOaAgeagt+acujwvdGl0bGU+PGRlc2MgaWQ9ImRlc2MiPumAj+aYjuiDjOaZr+eLrOeri+WFieeOr++8jOS4jeWQq+inkuiJsuOAguivgeaNruaguOW/g+m7mOiupOmakOiXj++8jOWPquacieehruiupOS6i+S7tuaJjeeUseaOpeWFpeaWueaYvuekuuOAgjwvZGVzYz48c3R5bGU+LnJpbmd7ZmlsbDpub25lO3N0cm9rZTojNDM4RkQyO3N0cm9rZS13aWR0aDoyfS5hY2NlbnQtbGluZXtmaWxsOm5vbmU7c3Ryb2tlOiNDRURGRUI7c3Ryb2tlLXdpZHRoOjEuNX0uYWNjZW50LWZpbGx7ZmlsbDojQ0VERkVCfS53aGFsZXtmaWxsOiM0MzhGRDI7c3Ryb2tlOiNDRURGRUI7c3Ryb2tlLXdpZHRoOjF9LmV2aWRlbmNlLWNvcmV7ZGlzcGxheTpub25lfS5vcmJpdHt0cmFuc2Zvcm0tb3JpZ2luOjE2MHB4IDE2MHB4fS5yaW5ne2FuaW1hdGlvbjpicmVhdGhlIDVzIGVhc2UtaW4tb3V0IGluZmluaXRlfS5vcmJpdHthbmltYXRpb246b3JiaXQgMTJzIGxpbmVhciBpbmZpbml0ZX1Aa2V5ZnJhbWVzIGJyZWF0aGV7NTAle29wYWNpdHk6LjQ1fX1Aa2V5ZnJhbWVzIG9yYml0e3Rve3RyYW5zZm9ybTpyb3RhdGUoMzYwZGVnKX19QG1lZGlhKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246cmVkdWNlKXsqe2FuaW1hdGlvbjpub25lIWltcG9ydGFudH19PC9zdHlsZT48ZWxsaXBzZSBjeD0iMTYwIiBjeT0iMTYwIiByeD0iNTAiIHJ5PSIxNi41IiBjbGFzcz0icmluZyIgb3BhY2l0eT0iMSIgc3Ryb2tlLWRhc2hhcnJheT0ibm9uZSIvPjxlbGxpcHNlIGN4PSIxNjAiIGN5PSIxNjAiIHJ4PSI2NyIgcnk9IjIyLjExIiBjbGFzcz0icmluZyIgb3BhY2l0eT0iMC44NyIgc3Ryb2tlLWRhc2hhcnJheT0ibm9uZSIvPjxlbGxpcHNlIGN4PSIxNjAiIGN5PSIxNjAiIHJ4PSI4NCIgcnk9IjI3LjcyMDAwMDAwMDAwMDAwMiIgY2xhc3M9InJpbmciIG9wYWNpdHk9IjAuNzQiIHN0cm9rZS1kYXNoYXJyYXk9Im5vbmUiLz48ZyBjbGFzcz0ib3JiaXQiPjxjaXJjbGUgY3g9IjE2MCIgY3k9IjEwMSIgcj0iMyIgY2xhc3M9ImFjY2VudC1maWxsIi8+PC9nPjxnIGNsYXNzPSJldmlkZW5jZS1jb3JlIj48Y2lyY2xlIGN4PSIxNjAiIGN5PSIxNjAiIHI9IjciIGNsYXNzPSJhY2NlbnQtZmlsbCIvPjwvZz48L3N2Zz4=',
      xiaoyu: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMjAgMzIwIiByb2xlPSJpbWciIGFyaWEtbGFiZWxsZWRieT0idGl0bGUgZGVzYyI+PHRpdGxlIGlkPSJ0aXRsZSI+eGlhb3l1IOaYn+azoSDigJQg5b6F5py65Yqo5oCB5qC35py6PC90aXRsZT48ZGVzYyBpZD0iZGVzYyI+6YCP5piO6IOM5pmv54us56uL5YWJ546v77yM5LiN5ZCr6KeS6Imy44CC6K+B5o2u5qC45b+D6buY6K6k6ZqQ6JeP77yM5Y+q5pyJ56Gu6K6k5LqL5Lu25omN55Sx5o6l5YWl5pa55pi+56S644CCPC9kZXNjPjxzdHlsZT4ucmluZ3tmaWxsOm5vbmU7c3Ryb2tlOiM3OUQ0RUY7c3Ryb2tlLXdpZHRoOjJ9LmFjY2VudC1saW5le2ZpbGw6bm9uZTtzdHJva2U6I0Q4QUM2MjtzdHJva2Utd2lkdGg6MS41fS5hY2NlbnQtZmlsbHtmaWxsOiNEOEFDNjJ9LndoYWxle2ZpbGw6Izc5RDRFRjtzdHJva2U6I0Q4QUM2MjtzdHJva2Utd2lkdGg6MX0uZXZpZGVuY2UtY29yZXtkaXNwbGF5Om5vbmV9Lm9yYml0e3RyYW5zZm9ybS1vcmlnaW46MTYwcHggMTYwcHh9LnJpbmd7YW5pbWF0aW9uOmJyZWF0aGUgNXMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Lm9yYml0e2FuaW1hdGlvbjpvcmJpdCAxMnMgbGluZWFyIGluZmluaXRlfUBrZXlmcmFtZXMgYnJlYXRoZXs1MCV7b3BhY2l0eTouNDV9fUBrZXlmcmFtZXMgb3JiaXR7dG97dHJhbnNmb3JtOnJvdGF0ZSgzNjBkZWcpfX1AbWVkaWEocHJlZmVycy1yZWR1Y2VkLW1vdGlvbjpyZWR1Y2Upeyp7YW5pbWF0aW9uOm5vbmUhaW1wb3J0YW50fX08L3N0eWxlPjxlbGxpcHNlIGN4PSIxNjAiIGN5PSIxNjAiIHJ4PSI1MCIgcnk9IjUwIiBjbGFzcz0icmluZyIgb3BhY2l0eT0iMSIgc3Ryb2tlLWRhc2hhcnJheT0ibm9uZSIvPjxlbGxpcHNlIGN4PSIxNjAiIGN5PSIxNjAiIHJ4PSI2NyIgcnk9IjY3IiBjbGFzcz0icmluZyIgb3BhY2l0eT0iMC44NyIgc3Ryb2tlLWRhc2hhcnJheT0ibm9uZSIvPjxnIGNsYXNzPSJvcmJpdCI+PGNpcmNsZSBjeD0iMTYwIiBjeT0iMTAxIiByPSIzIiBjbGFzcz0iYWNjZW50LWZpbGwiLz48L2c+PHBhdGggY2xhc3M9IndoYWxlIiBkPSJNMTA5IDE1NyBRMTM3IDEzMiAxNzcgMTUwIFExOTIgMTU1IDIwMyAxNDMgTDIxMSAxMzQgTDIxMyAxNDggTDIyNiAxNTAgTDIxNCAxNTggUTE5OCAxODAgMTYyIDE3OSBRMTI1IDE3OSAxMDkgMTU3WiIvPjxjaXJjbGUgY3g9IjEyNSIgY3k9IjE1NCIgcj0iMiIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
      dragon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMjAgMzIwIiByb2xlPSJpbWciIGFyaWEtbGFiZWxsZWRieT0idGl0bGUgZGVzYyI+PHRpdGxlIGlkPSJ0aXRsZSI+emhhb3dlaSDnhaflpJwg4oCUIOW+heacuuWKqOaAgeagt+acujwvdGl0bGU+PGRlc2MgaWQ9ImRlc2MiPumAj+aYjuiDjOaZr+eLrOeri+WFieeOr++8jOS4jeWQq+inkuiJsuOAguivgeaNruaguOW/g+m7mOiupOmakOiXj++8jOWPquacieehruiupOS6i+S7tuaJjeeUseaOpeWFpeaWueaYvuekuuOAgjwvZGVzYz48c3R5bGU+LnJpbmd7ZmlsbDpub25lO3N0cm9rZTojNzRCOUI1O3N0cm9rZS13aWR0aDoyfS5hY2NlbnQtbGluZXtmaWxsOm5vbmU7c3Ryb2tlOiNEOEFDNjI7c3Ryb2tlLXdpZHRoOjEuNX0uYWNjZW50LWZpbGx7ZmlsbDojRDhBQzYyfS53aGFsZXtmaWxsOiM3NEI5QjU7c3Ryb2tlOiNEOEFDNjI7c3Ryb2tlLXdpZHRoOjF9LmV2aWRlbmNlLWNvcmV7ZGlzcGxheTpub25lfS5vcmJpdHt0cmFuc2Zvcm0tb3JpZ2luOjE2MHB4IDE2MHB4fS5yaW5ne2FuaW1hdGlvbjpicmVhdGhlIDVzIGVhc2UtaW4tb3V0IGluZmluaXRlfS5vcmJpdHthbmltYXRpb246b3JiaXQgMTJzIGxpbmVhciBpbmZpbml0ZX1Aa2V5ZnJhbWVzIGJyZWF0aGV7NTAle29wYWNpdHk6LjQ1fX1Aa2V5ZnJhbWVzIG9yYml0e3Rve3RyYW5zZm9ybTpyb3RhdGUoMzYwZGVnKX19QG1lZGlhKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246cmVkdWNlKXsqe2FuaW1hdGlvbjpub25lIWltcG9ydGFudH19PC9zdHlsZT48ZWxsaXBzZSBjeD0iMTYwIiBjeT0iMTYwIiByeD0iNTAiIHJ5PSI1MCIgY2xhc3M9InJpbmciIG9wYWNpdHk9IjEiIHN0cm9rZS1kYXNoYXJyYXk9IjE4MCAxMiIvPjxlbGxpcHNlIGN4PSIxNjAiIGN5PSIxNjAiIHJ4PSI2NyIgcnk9IjY3IiBjbGFzcz0icmluZyIgb3BhY2l0eT0iMC44NyIgc3Ryb2tlLWRhc2hhcnJheT0iMTgwIDEyIi8+PGVsbGlwc2UgY3g9IjE2MCIgY3k9IjE2MCIgcng9Ijg0IiByeT0iODQiIGNsYXNzPSJyaW5nIiBvcGFjaXR5PSIwLjc0IiBzdHJva2UtZGFzaGFycmF5PSIxODAgMTIiLz48ZWxsaXBzZSBjeD0iMTYwIiBjeT0iMTYwIiByeD0iMTAxIiByeT0iMTAxIiBjbGFzcz0icmluZyIgb3BhY2l0eT0iMC42MSIgc3Ryb2tlLWRhc2hhcnJheT0iMTgwIDEyIi8+PGVsbGlwc2UgY3g9IjE2MCIgY3k9IjE2MCIgcng9IjExOCIgcnk9IjExOCIgY2xhc3M9InJpbmciIG9wYWNpdHk9IjAuNDgiIHN0cm9rZS1kYXNoYXJyYXk9IjE4MCAxMiIvPjxnIGNsYXNzPSJvcmJpdCI+PGNpcmNsZSBjeD0iMTYwIiBjeT0iMTAxIiByPSIzIiBjbGFzcz0iYWNjZW50LWZpbGwiLz48L2c+PHBhdGggY2xhc3M9ImFjY2VudC1saW5lIiBkPSJNODAgMTAwIFExMTUgNDQgMTg1IDU4IEwyMDMgNDcgTDIwMiA2NSBMMjE3IDczIEwxOTggNzkgUTE1MSA1OSAxMTkgOTQgUTk4IDExNyA5MSAxMzkiLz48ZyBjbGFzcz0iZXZpZGVuY2UtY29yZSI+PGNpcmNsZSBjeD0iMTYwIiBjeT0iMTYwIiByPSI3IiBjbGFzcz0iYWNjZW50LWZpbGwiLz48L2c+PHBhdGggY2xhc3M9ImFjY2VudC1saW5lIiBkPSJNNTcgMTQ1IFE4MCA2OSAxNTAgNTMgTTE3MCA1MyBRMjQwIDY5IDI2MyAxNDUiLz48cGF0aCBjbGFzcz0iYWNjZW50LWxpbmUiIGQ9Ik0xNjAgMjcgVjQ1IE0xNTEgMzYgSDE2OSBNMjY3IDE1MCBWMTY4IE0yNTggMTU5IEgyNzYiLz48L3N2Zz4=',
    }
    const orgOf = (role) => NEST_ORG[role] || { post: '', rank: '' }
    const NEST_LABELS = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
    const NEST_DESCRIPTIONS = { dayu: '姐姐 · 大鱼', xiaoyu: '妹妹 · 小鱼', dragon: '照微 · 太上长老' }
    const NEST_API = '/api/yushen/nest'
    const IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    const IMG_MAX = 8 * 1024 * 1024

    function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('读图失败'))
        reader.readAsDataURL(file)
      })
    }

    function guessRole(name) {
      const text = String(name || '')
      if (/照微|dragon/i.test(text)) return 'dragon'
      if (/大|姐|鲲/.test(text)) return 'dayu'
      if (/小|妹|鲤/.test(text)) return 'xiaoyu'
      return 'xiaoyu'
    }

    function pickImage(cb) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/png,image/jpeg,image/webp,image/gif'
      input.style.display = 'none'
      input.onchange = () => {
        const file = input.files && input.files[0]
        try { input.remove() } catch { /* 移除失败不影响 */ }
        if (file) cb(file)
      }
      document.body.appendChild(input)
      input.click()
    }

    async function nestPost(path, body) {
      const res = await fetch(NEST_API + path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`)
      return data
    }

    // 别的插件的桌宠拖过来时，浏览器给的不一定是文件：可能是 uri-list / text / html 里的 <img>。
    function dropImageSrc(dt) {
      if (!dt) return ''
      const uri = String(dt.getData('text/uri-list') || '').split(/\r?\n/).find((line) => line && !line.startsWith('#'))
      if (uri && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(uri)) return uri
      const plain = String(dt.getData('text/plain') || '').trim()
      if (/^(https?:|file:|data:)/i.test(plain) || /\.(png|jpe?g|webp|gif)$/i.test(plain)) return plain
      const html = String(dt.getData('text/html') || '')
      const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html)
      if (match) return match[1]
      return ''
    }

    // 收编模式：点一下任何桌宠，把它画的图抓出来；抓不到就返回空。
    function imageSrcAt(target) {
      if (!target || !target.tagName) return ''
      if (target.tagName === 'IMG') return target.currentSrc || target.src || ''
      const img = target.querySelector ? target.querySelector('img') : null
      if (img) return img.currentSrc || img.src || ''
      try {
        const bg = getComputedStyle(target).backgroundImage || ''
        const match = /url\(["']?(.*?)["']?\)/.exec(bg)
        if (match) return match[1]
      } catch { /* 拿不到样式就算了 */ }
      return ''
    }

    function NestFigure({
      slot, role, scale, height, zoom, rank, xp, menuOpen, setMenuOpen, catcher,
      onPick, onAdopt, onAdoptSrc, onMissing, onRename, onRestore, onZoom, live,
    }) {
      const [over, setOver] = React.useState(false)
      const [broken, setBroken] = React.useState(false)
      const [bubble, setBubble] = React.useState(null)
      const bubbleTimer = React.useRef(0)
      const bubbleEl = React.useRef(null)
      const [hit, setHit] = React.useState(false)
      const hitTimer = React.useRef(0)
      const say = React.useCallback((text, kind, ms) => {
        if (!text) return
        setBubble({ text, kind: kind || 'info' })
        if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
        bubbleTimer.current = setTimeout(() => { bubbleTimer.current = 0; setBubble(null) }, ms || 6000)
      }, [])
      React.useEffect(() => () => {
        if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
        if (hitTimer.current) clearTimeout(hitTimer.current)
      }, [])

      // 在跑：冒一句“正在…”，只用大白话。
      // 只让中间那只（照微）自动冒，三个人同时冒会互相压、还会顶到裁切。
      const wasActive = React.useRef(false)
      React.useEffect(() => {
        if (!live || role !== 'dragon') return
        if (live.active && !wasActive.current) {
          wasActive.current = true
          say(live.tool || '正在处理手头的事情…', 'run', 6000)
        } else if (!live.active) {
          wasActive.current = false
        }
      }, [live, live?.active, live?.tool, say, role])

      // 这一轮花了多少钱：跑完冒一下（同样只由中间那只冒）
      const seenSeq = React.useRef(0)
      React.useEffect(() => {
        if (!live || !live.lastTurn || role !== 'dragon') return
        if (Number(live.lastTurnSeq) > seenSeq.current) {
          const first = seenSeq.current === 0
          seenSeq.current = Number(live.lastTurnSeq)
          if (!first && Number(live.lastTurn.cost) > 0) {
            say(`这轮花了 ¥${Number(live.lastTurn.cost).toFixed(2)}`, 'cost', 6000)
          }
        }
      }, [live?.lastTurnSeq, say, role])

      // 没事的时候自己嘀咕一句（解压用；不打断正在跑的）
      React.useEffect(() => {
        const lines = ['嗯…让我想想。', '今天也要好好干活。', '有事情就点我。', '我在。', '要不要歇一会儿？']
        let alive = true
        let timer = 0
        const loop = () => {
          timer = setTimeout(() => {
            if (!alive) return
            if (!live?.active) say(lines[Math.floor(Math.random() * lines.length)], 'idle', 4200)
            loop()
          }, 40000 + Math.random() * 60000)
        }
        loop()
        return () => { alive = false; clearTimeout(timer) }
      }, [say, live?.active])

      // 气泡形状：小的时候椭圆，放大后慢慢变方框（按实际宽高算像素，别用百分比混算）
      React.useEffect(() => {
        const el = bubbleEl.current
        if (!el) return
        const w = el.offsetWidth || 210
        const h = el.offsetHeight || 60
        const m = Math.max(0, Math.min(1, (Number(zoom || 1) - 1) / 0.3))
        const rx = (1 - m) * (w / 2) + m * 24
        const ry = (1 - m) * (h * 0.46) + m * 24
        el.style.borderRadius = `${rx.toFixed(1)}px / ${ry.toFixed(1)}px`
      }, [bubble, zoom])
      const press = React.useRef({ timer: 0, long: false, moved: false, pending: false, suppressUntil: 0, x: 0, y: 0 })
      const stop = () => {
        if (press.current.timer) {
          clearTimeout(press.current.timer)
          press.current.timer = 0
        }
      }
      React.useEffect(() => stop, [])
      React.useEffect(() => { setBroken(false) }, [slot?.url])

      if (!slot) {
        return h('div', { className: 'ysn-slot' },
          h('button', {
            type: 'button',
            className: 'ysn-empty',
            onClick: () => onAdopt(role, null),
            'aria-label': `${NEST_LABELS[role]}还没有形象，点这里收养`,
          },
          h('span', { style: { fontSize: '22px', lineHeight: 1 } }, '＋'),
          h('span', null, '还在窝外'),
          h('span', { style: { fontSize: '11px', opacity: 0.65 } }, `给${NEST_LABELS[role]}找张图`)))
      }

      const label = slot.name || slot.label || NEST_LABELS[role]
      const org = orgOf(role)
      // 气泡形状：0 = 椭圆（小的时候），1 = 圆角方框（放大了要看清字）
      const bubbleM = Math.max(0, Math.min(1, (Number(zoom || 1) - 1) / 0.3))
      const toggleMenu = () => setMenuOpen(menuOpen ? '' : role)
      const onDown = (e) => {
        const p = press.current
        if (e.button !== undefined && e.button !== 0) return
        ysnPress()
        p.x = e.clientX
        p.y = e.clientY
        p.long = false
        p.moved = false
        p.pending = false
        stop()
        p.timer = setTimeout(() => {
          p.timer = 0
          p.long = true
          p.pending = true
        }, 520)
      }
      const onMove = (e) => {
        const p = press.current
        if (!p.timer || p.long) return
        if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) {
          p.moved = true
          stop()
        }
      }
      const onUp = (e) => {
        const p = press.current
        if (e && e.button === 2) return
        ysnRelease()
        // 松手往回抬一下（抬过头再落回）
        if (hitTimer.current) clearTimeout(hitTimer.current)
        setHit(true)
        hitTimer.current = setTimeout(() => { hitTimer.current = 0; setHit(false) }, 300)
        stop()
        if (p.pending) {
          p.pending = false
          p.long = false
          p.moved = false
          p.suppressUntil = Date.now() + 450
          // 等浏览器把这一下 click 派完，再开菜单；否则菜单会被这次抬手的 click 立刻关掉。
          setTimeout(() => setMenuOpen(role), 0)
          return
        }
        if (p.moved) p.suppressUntil = Date.now() + 250
        p.moved = false
        p.long = false
      }
      const onClick = (e) => {
        const p = press.current
        if (Date.now() < p.suppressUntil) {
          e.preventDefault()
          return
        }
        if (catcher) {
          onMissing?.('她已经在窝里了；去点那只你要收编的桌宠。')
          return
        }
        if (menuOpen) { setMenuOpen(''); return }
        if (broken) { pickImage((file) => onAdopt(role, file)); return }
        if (bubble) { setBubble(null); return }
        say(`${label}在呢。双击进页面，长按换形象。`, 'info', 4600)
      }
      const onDouble = () => {
        if (Date.now() < press.current.suppressUntil) return
        if (catcher || broken) return
        onPick(role)
      }
      const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (broken) pickImage((file) => onAdopt(role, file))
          else onPick(role)
          return
        }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          toggleMenu()
        }
        if (e.key === 'Escape' && menuOpen) {
          e.preventDefault()
          setMenuOpen('')
        }
      }
      const onDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const file = e.dataTransfer?.files?.[0]
        if (file) { onAdopt(role, file); return }
        const src = dropImageSrc(e.dataTransfer)
        if (src) { onMissing?.(''); onAdoptSrc(role, src, slot.name || label) }
        else onMissing?.('这张没带图片：点「收编桌宠」，再点一下那只桌宠的画面。')
      }
      return h('div', {
        className: `ysn-slot ysn-slot-${role}${role === 'dragon' ? ' ysn-slot-hero' : ''}${menuOpen ? ' ysn-slot-open' : ''}${over ? ' ysn-drop' : ''}`,
        'data-role': role,
        style: { ...(height ? { '--ysn-h': `${Math.round(height * scale)}px` } : {}), '--ysn-zoom': zoom || 1 },
      },
        h('button', {
          type: 'button',
          className: `ysn-fig${hit ? ' ysn-fig-hit' : ''}`,
          onClick,
          onDoubleClick: onDouble,
          onKeyDown,
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: () => { stop(); press.current.moved = false; press.current.long = false; press.current.pending = false },
          onContextMenu: (e) => { e.preventDefault(); toggleMenu() },
          onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setOver(true) },
          onDragLeave: () => setOver(false),
          onDrop,
          'aria-label': `${label}：点一下冒个泡；双击进她的页面；长按或右键打开换形象、改名、恢复默认`,
          'aria-haspopup': 'menu',
          'aria-expanded': menuOpen ? 'true' : 'false',
        },
        bubble
          ? h('span', {
            className: 'ysn-bubble',
            ref: bubbleEl,
            'data-kind': bubble.kind,
            role: 'status',
            'aria-live': 'polite',
            style: {
              // 跟宠物一起放大：以前反向缩放，宠物越大、气泡越显小
              width: `${214 + bubbleM * 56}px`,
              transform: 'translateX(-50%)',
              transformOrigin: '50% 100%',
            },
            onClick: (e) => { e.stopPropagation(); setBubble(null) },
            onPointerDown: (e) => e.stopPropagation(),
            onDoubleClick: (e) => e.stopPropagation(),
          }, bubble.text)
          : null,
        h('span', { className: 'ysn-crown', 'data-role': role, title: `${rank?.label || org.rank} · 经验 ${xp?.xp ?? 0}/${xp?.cap ?? 2000}（本人完成 ${xp?.done ?? 0} 单，共同值守 ${xp?.fixed ?? 0} 件）` },
          h('span', { className: 'ysn-rank-chip' }, rank?.chip || org.rank),
          h('span', { className: 'ysn-xp', 'aria-hidden': 'true' },
            h('span', { className: 'ysn-xp-fill', style: { width: `${Math.round((xp?.progress || 0) * 100)}%` } })),
          h('span', { className: 'ysn-xp-num' }, `经验 ${xp?.xp ?? 0} / ${xp?.cap ?? 2000}`)),
        h('span', { className: 'ysn-art' },
          h('span', { className: 'ysn-shadow', 'aria-hidden': 'true' }),
          broken
            ? h('span', { className: 'ysn-broken' }, '图丢了', h('span', null, '点我换一张，或把图拖进来'))
            : h('img', {
              className: 'ysn-character',
              src: slot.url,
              alt: label,
              draggable: false,
              onError: () => setBroken(true),
            })),
        h('span', { className: 'ysn-name', title: `${label} · ${org.post || ''}${org.also ? `（${org.also}）` : ''}${org.rank ? ' · ' + org.rank : ''}` },
          h('span', { className: 'ysn-name-text' }, label),
          org.post ? h('span', { className: 'ysn-post', title: '对外身份，仅显示；实际能干的活和她们一样' }, `${org.post} · ${org.rank}`) : null)),
        menuOpen
          ? h(React.Fragment, null,
            h('div', { className: 'ysn-backdrop', onClick: () => setMenuOpen('') }),
            h('div', {
              className: 'ysn-menu',
              role: 'menu',
              'aria-label': `${label}的小菜单`,
              onKeyDown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen('') } },
            },
              h('button', { type: 'button', role: 'menuitem', autoFocus: true, onClick: () => { setMenuOpen(''); pickImage((file) => onAdopt(role, file)) } }, '换一张图'),
              h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenuOpen(''); onRename(role) } }, '改名字'),
              h('div', { className: 'ysn-menu-sep', 'aria-hidden': 'true' }),
              h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenuOpen(''); onZoom?.(role, 0.1) } }, '单独放大'),
              h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenuOpen(''); onZoom?.(role, -0.1) } }, '单独缩小'),
              h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenuOpen(''); onZoom?.(role, 0) } }, '恢复本人大小'),
              h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenuOpen(''); onRestore(role) } }, '恢复默认')))
          : null)
    }

    function Nest({ nest, error, onRetry, onPick, onAdopt, onAdoptSrc, onGuestRemove, onRename, onRestore, gearOpen, onGear, live }) {
      const [catcher, setCatcher] = React.useState(false)
      const [hint, setHint] = React.useState('')
      const [menuRole, setMenuRole] = React.useState('')
      const stageRef = React.useRef(null)
      const [stageSize, setStageSize] = React.useState({ w: 0, h: 0 })
      const [zoom, setZoom] = React.useState(() => {
        try {
          const v = Number(localStorage.getItem('yushen.nest.zoom'))
          return Number.isFinite(v) && v >= 0.75 && v <= 1.3 ? v : 1
        } catch { return 1 }
      })
      const zoomRef = React.useRef(zoom)
      zoomRef.current = zoom
      const zoomTo = (next) => {
        setZoom((prev) => {
          const target = Math.min(1.3, Math.max(0.75, Math.round((Number(next) || prev) * 100) / 100))
          try { localStorage.setItem('yushen.nest.zoom', String(target)) } catch { /* 存不了就只影响这次 */ }
          return target
        })
      }
      const nudgeZoom = (delta) => {
        const next = zoomRef.current + delta
        if (next < 0.75 - 1e-6 || next > 1.3 + 1e-6) {
          setHint(delta < 0 ? '已经缩到最小了（75%）。想再小就 Alt+滚轮单独调某一只' : '已经放到最大了（130%）。想更大就用 Alt+滚轮单独调')
          return
        }
        zoomTo(next)
      }
      const [roleZoom, setRoleZoom] = React.useState(() => {
        try {
          const raw = JSON.parse(localStorage.getItem('yushen.nest.roleZoom') || '{}')
          const out = {}
          for (const role of NEST_ROLES) {
            const v = Number(raw?.[role])
            if (Number.isFinite(v) && v >= 0.7 && v <= 1.4) out[role] = v
          }
          return out
        } catch { return {} }
      })
      const roleZoomRef = React.useRef(roleZoom)
      roleZoomRef.current = roleZoom
      const roleZoomTo = (role, next) => {
        setRoleZoom((prev) => {
          const target = Math.min(1.4, Math.max(0.7, Math.round((Number(next) || 1) * 100) / 100))
          const out = { ...prev, [role]: target }
          try { localStorage.setItem('yushen.nest.roleZoom', JSON.stringify(out)) } catch { /* 存不了就只影响这次 */ }
          return out
        })
      }
      const nudgeRoleZoom = (role, delta) => roleZoomTo(role, (roleZoomRef.current[role] || 1) + delta)
      const [rankInfo, setRankInfo] = React.useState(null)
      const [roleXp, setRoleXp] = React.useState({})
      React.useEffect(() => {
        let alive = true
        const safe = (url) => fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        const load = async () => {
          const [rank, jobData, incidentData] = await Promise.all([
            safe('/api/dayu/rank'),
            safe('/api/dayu/jobs?limit=100'),
            safe('/api/dayu/incidents?status=fixed&limit=500'),
          ])
          if (!alive) return
          if (rank?.ok) setRankInfo(rank)
          const jobs = Array.isArray(jobData?.jobs) ? jobData.jobs : []
          const fixed = Array.isArray(incidentData?.incidents) ? incidentData.incidents.length : 0
          const done = { dayu: 0, xiaoyu: 0, dragon: 0 }
          for (const job of jobs) {
            if (!done[job.role]) continue
            if (['done', 'verified', 'passed'].includes(String(job.status))) done[job.role] += 1
          }
          const base = {
            dayu: { L0: 0, L1: 100, L2: 300, L3: 600 }[rank?.roles?.dayu?.rank] ?? 600,
            xiaoyu: { L0: 0, L1: 100, L2: 300, L3: 600 }[rank?.roles?.xiaoyu?.rank] ?? 300,
            dragon: 1000,
          }
          const cap = 2000
          const out = {}
          for (const role of NEST_ROLES) {
            const xp = (base[role] || 0) + fixed * 10 + done[role] * 25
            out[role] = { xp, cap, fixed, done: done[role], progress: Math.min(1, xp / cap) }
          }
          setRoleXp(out)
        }
        load()
        const timer = setInterval(load, 30000)
        window.addEventListener('focus', load)
        return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load) }
      }, [])
      const rankOf = (role) => {
        const org = NEST_ORG[role] || {}
        if (role === 'dragon') return { chip: org.rank || '五境', label: rankInfo?.realm?.label || org.rank || '五境', rank: 'realm' }
        const row = rankInfo?.roles?.[role]
        const rank = row?.rank || (role === 'dayu' ? 'L3' : 'L2')
        return { chip: `${org.rank || ''}${rank ? ` · ${rank}` : ''}`, label: `${org.rank || ''} · ${rank}`, rank }
      }
      const slots = nest?.slots || {}
      const guests = nest?.guests || []

      React.useEffect(() => {
        const el = stageRef.current
        if (!el) return undefined
        const measure = () => {
          const r = el.getBoundingClientRect()
          setStageSize((prev) => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }))
        }
        measure()
        let observer
        if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(el) }
        window.addEventListener('resize', measure)
        return () => {
          if (observer) observer.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [Boolean(nest)])

      // 滚轮和 +/- 走同一个缩放状态；缩放只改视觉，不改站位数据。
      // 监听挂在 document 的捕获阶段：页面里别的层把 wheel 吞掉时，这里仍然先收到，
      // 只有指针确实在鱼窝舞台里才动手。
      React.useEffect(() => {
        const onWheel = (e) => {
          const stage = stageRef.current
          if (!stage) return
          const target = e.target
          if (!(target instanceof Node) || !stage.contains(target)) return
          e.preventDefault()
          const step = e.deltaY > 0 ? -0.05 : 0.05
          if (e.altKey) {
            const slot = target.closest?.('.ysn-slot')
            const role = slot?.getAttribute('data-role')
            if (role) { nudgeRoleZoom(role, step); return }
          }
          zoomTo(zoomRef.current + step)
        }
        document.addEventListener('wheel', onWheel, { passive: false, capture: true })
        return () => document.removeEventListener('wheel', onWheel, { capture: true })
      }, [Boolean(nest)])

      // 统一“站高”：最宽的那只按 1.5 倍槽宽封顶，三只都按这个基准再乘各自的 scale。
      const figureHeight = stageSize.w > 0
        ? Math.round(Math.min(stageSize.h * 0.88, (stageSize.w / 3) * 1.5))
        : 0

      React.useEffect(() => {
        if (!hint) return undefined
        const timer = setTimeout(() => setHint(''), 7000)
        return () => clearTimeout(timer)
      }, [hint])

      React.useEffect(() => {
        if (!catcher) return undefined
        const onDoc = (e) => {
          if (e.target?.closest?.('.ysn-root')) return // 自家界面照常点，收编按钮才能取消
          e.preventDefault()
          e.stopPropagation()
          const src = imageSrcAt(e.target)
          setCatcher(false)
          if (!src) { setHint('这一下没抓到图：再点一次「收编桌宠」，点那只桌宠的画面。'); return }
          setHint('')
          onAdoptSrc(null, src, '收编的桌宠')
        }
        const onKey = (e) => { if (e.key === 'Escape') setCatcher(false) }
        document.addEventListener('click', onDoc, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('click', onDoc, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [catcher, onAdoptSrc])

      return h(React.Fragment, null,
        h('div', { className: 'ysn-bg', 'aria-hidden': 'true' }),
        h('div', { className: `ysn-inner${catcher ? ' ysn-catching' : ''}` },
          h('header', { className: 'ysn-head' },
            h('div', null,
              h('div', { className: 'ysn-title-row' },
                h('div', { className: 'ysn-title' }, '鱼窝'),
                h('span', { className: 'ysn-crest' }, '内阁')),
              h('div', { className: 'ysn-sub' }, '点一下冒个泡 · 双击进页面 · 把图拖到她身上换形象 · 长按她打开小菜单')),
            h('div', { className: 'ysn-head-side' },
              h('div', { className: 'ysn-zoom', role: 'group', 'aria-label': '缩放', title: '滚轮整体缩放；Alt+滚轮单独缩放' },
                h('button', {
                  type: 'button', className: 'ysn-zoom-btn', title: '缩小（最小 75%）', 'aria-label': '缩小',
                  onClick: () => nudgeZoom(-0.1),
                }, '−'),
                h('button', {
                  type: 'button', className: 'ysn-zoom-btn', 'data-pct': '1', title: '恢复 100%',
                  onClick: () => zoomTo(1),
                }, `${Math.round(zoom * 100)}%`),
                h('button', {
                  type: 'button', className: 'ysn-zoom-btn', title: '放大（最大 130%）', 'aria-label': '放大',
                  onClick: () => nudgeZoom(0.1),
                }, '+')),
              h('button', {
                type: 'button',
                className: 'ysn-icon-btn',
                onClick: onGear,
                title: '设置',
                'aria-label': '设置',
                'aria-haspopup': 'menu',
                'aria-expanded': gearOpen ? 'true' : 'false',
              }, '⚙'))),
          !nest && !error
            ? h('div', { className: 'ysn-state' }, '正在回窝…')
            : error
              ? h('div', { className: 'ysn-state', role: 'alert' },
                '鱼窝没打开：' + error,
                h('div', null, h('button', { type: 'button', onClick: onRetry }, '再试一次')))
              : h('div', {
                className: 'ysn-stage',
                ref: stageRef,
                style: { '--ysn-zoom': zoom },
                onDragOver: (e) => { e.preventDefault() },
                onDrop: (e) => {
                  e.preventDefault()
                  const file = e.dataTransfer?.files?.[0]
                  if (file) { onAdopt(null, file); return }
                  const src = dropImageSrc(e.dataTransfer)
                  if (src) onAdoptSrc(null, src, '收编的桌宠')
                  else setHint('这张没带图片：把图片文件直接拖进来，或点「收编桌宠」。')
                },
              },
                // 2026-10-30：只画名册里真有的角色（出厂只有一个），别给不存在的角色留空位
                NEST_DISPLAY_ORDER.filter((role) => Boolean(slots[role])).map((role) => h(NestFigure, {
                  key: role,
                  role,
                  slot: slots[role],
                  scale: NEST_SCALE[role] || 0.9,
                  height: figureHeight,
                  zoom: zoom * (roleZoom[role] || 1),
                  rank: rankOf(role),
                  xp: roleXp[role] || { xp: 0, cap: 2000, progress: 0, done: 0, fixed: 0 },
                  catcher,
                  menuOpen: menuRole === role,
                  setMenuOpen: setMenuRole,
                  onPick,
                  onAdopt,
                  onAdoptSrc,
                  onMissing: setHint,
                  onRename,
                  onRestore,
                  live,
                  onZoom: (r, delta) => { if (delta === 0) roleZoomTo(r, 1); else nudgeRoleZoom(r, delta) },
                }))),
          guests.length
            ? h('div', { className: 'ysn-guests', 'aria-label': '收编来的客人' },
              h('span', { className: 'ysn-guests-label' }, '客人'),
              guests.map((g) => h('div', { key: g.id, className: 'ysn-guest', title: g.name },
                h('img', { src: g.url, alt: g.name, draggable: false }),
                h('span', { className: 'ysn-guest-name' }, g.name),
                h('button', {
                  type: 'button',
                  className: 'ysn-guest-x',
                  title: `把${g.name}送回去`,
                  'aria-label': `把${g.name}送回去`,
                  onClick: () => onGuestRemove(g.id),
                }, '×'))))
            : null,
          h('div', { className: `ysn-foot${catcher ? ' ysn-foot-catch' : ''}` },
            h('span', null, catcher ? '正在收编：点一下那只桌宠的画面' : '长按她可以换图 / 改名'),
            h('span', { className: 'ysn-hint-long' }, catcher ? ' · Esc 取消' : ' · 也可以把图片直接拖到她身上 · 滚轮整体缩放，Alt+滚轮单只'),
            h('button', {
              type: 'button',
              className: 'ysn-catch',
              'data-on': catcher ? '1' : '0',
              'aria-pressed': catcher ? 'true' : 'false',
              onClick: () => { setHint(''); setCatcher(!catcher) },
            }, catcher ? '取消收编 · Esc' : '收编桌宠')),
          hint ? h('div', { className: 'ysn-toast', role: 'status' }, hint) : null))
    }

    function AdoptDialog({ mode, role, file, nest, onClose, onDone }) {
      const [name, setName] = React.useState(role && mode === 'rename' ? (nest?.slots?.[role]?.name || '') : '')
      const [picked, setPicked] = React.useState(role || '')
      const [preview, setPreview] = React.useState('')
      const [dataUrl, setDataUrl] = React.useState('')
      const [err, setErr] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [cands, setCands] = React.useState([])
      const [cand, setCand] = React.useState(null)

      React.useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])

      React.useEffect(() => {
        if (mode !== 'adopt') return
        let alive = true
        fetch('/api/yushen/nest/candidates', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => { if (alive && d?.ok) setCands(d.candidates || []) })
          .catch(() => {})
        return () => { alive = false }
      }, [mode])

      React.useEffect(() => {
        if (mode !== 'adopt' || !file) return
        const base = String(file.name || '').replace(/\.[^.]+$/, '').slice(0, 24)
        setName(base)
        if (!role) setPicked(guessRole(base))
        if (!IMG_TYPES.includes(file.type)) {
          setErr('只收 png / jpg / webp / gif')
          return
        }
        if (file.size > IMG_MAX) {
          setErr('图太大，最多 8MB')
          return
        }
        readAsDataUrl(file)
          .then((url) => { setDataUrl(url); setPreview(url) })
          .catch((e) => setErr(String(e?.message || e)))
      }, [file, role, mode])

      const submit = async () => {
        if (busy) return
        if (mode === 'adopt') {
          if (!picked) return setErr('先选要使用的角色槽')
          if (!dataUrl && !cand) return setErr('图还没读进来')
        } else if (!name.trim()) {
          return setErr('名字不能空着')
        }
        setBusy(true)
        setErr('')
        try {
          const next = mode === 'adopt'
            ? (cand
              ? await nestPost('/adopt-file', { role: picked, name, plugin: cand.plugin, rel: cand.rel })
              : await nestPost('/adopt', { role: picked, name, dataUrl }))
            : await nestPost('/rename', { role, name })
          onDone(next)
        } catch (e) {
          setErr(String(e?.message || e))
          setBusy(false)
        }
      }

      // 2026-10-30：出厂带着三张形象，让对方自己挑一张，不用先去找图。
      const PRESET_IMGS = [['dayu', '大鱼'], ['xiaoyu', '小鱼'], ['dragon', '照微']]
      const pickPreset = async (id, label) => {
        try {
          setErr('')
          const res = await fetch(`/yushen-assets/avatar?who=${id}`, { credentials: 'same-origin' })
          if (!res.ok) throw new Error(`取不到（HTTP ${res.status}）`)
          const blob = await res.blob()
          const durl = await readAsDataUrl(blob)
          setCand(null)
          setDataUrl(durl)
          setPreview(durl)
          if (!name) setName(label)
          if (!role && !picked) setPicked(id)
        } catch (e) { setErr('取不到自带形象：' + String(e?.message || e)) }
      }

      const pickCand = (c) => {
        setCand(c)
        const base = String(c.rel || '').split('/').pop().replace(/\.[^.]+$/, '').slice(0, 24)
        if (base) setName(base)
        setPreview(`/yushen-assets/candidate?plugin=${encodeURIComponent(c.plugin)}&rel=${encodeURIComponent(c.rel)}`)
        if (!role && !picked) setPicked(guessRole(base))
      }

      return h('div', {
        style: css.overlay,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': mode === 'adopt' ? '收养一只' : '改个名字',
        onClick: (e) => { if (e.target === e.currentTarget) onClose() },
      },
        h('div', { style: css.modal },
          h('div', { style: css.modalTitle }, mode === 'adopt' ? '收养一只' : '改个名字'),
          mode === 'adopt'
            ? h('div', { style: css.previewBox }, preview ? h('img', { src: preview, style: css.previewImg, alt: '预览' }) : h('div', { style: css.muted }, '读图中…'))
            : h('div', { style: css.muted, marginBottom: '10px' }, `${nest?.slots?.[role]?.label || ''} 现在叫「${nest?.slots?.[role]?.name || ''}」`),
          mode === 'adopt' && cands.length
            ? h('div', { style: { marginTop: '10px' } },
              h('div', { style: css.muted }, `从已入职插件里挑（${cands.length}）`),
              h('div', { style: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '6px 0' } },
                cands.slice(0, 12).map((c) => h('button', {
                  key: c.id,
                  title: `${c.plugin} / ${c.rel}`,
                  style: {
                    ...css.roleCard, padding: 0, width: '64px', height: '64px', overflow: 'hidden', flex: '0 0 auto',
                    ...(cand && cand.id === c.id ? css.roleCardOn : null),
                  },
                  onClick: () => pickCand(c),
                }, h('img', {
                  src: `/yushen-assets/candidate?plugin=${encodeURIComponent(c.plugin)}&rel=${encodeURIComponent(c.rel)}`,
                  style: { width: '100%', height: '100%', objectFit: 'cover' },
                  alt: c.rel,
                })))))
            : null,
          h('div', { style: { ...css.muted, margin: '10px 0 6px' } }, '用自带的形象（不知道选什么就挑一张）'),
          h('div', { style: { display: 'flex', gap: '10px', padding: '2px 0 4px' } },
            PRESET_IMGS.map(([id, label]) => h('button', {
              key: id,
              type: 'button',
              title: label,
              style: { ...css.roleCard, padding: 0, width: '72px', overflow: 'hidden', background: 'transparent' },
              onClick: () => pickPreset(id, label),
            }, h('img', {
              src: `/yushen-assets/avatar?who=${id}`,
              alt: label,
              style: { width: '100%', height: '76px', objectFit: 'contain', display: 'block' },
            }), h('div', { style: { fontSize: '11px', opacity: 0.8 } }, label)))),
          h('div', { style: { ...css.muted, margin: '10px 0 6px' } }, '名字'),
          h('input', {
            style: { ...css.input, minHeight: '0', width: '100%', padding: '9px 12px', marginBottom: '6px' },
            value: name,
            maxLength: 24,
            autoFocus: true,
            placeholder: mode === 'adopt' ? '给她取个名' : '新名字',
            onChange: (e) => setName(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') submit() },
          }),
          mode === 'adopt' && !role
            ? h('div', { style: css.roleRow },
              NEST_ROLES.map((candidate) => h('button', {
                key: candidate,
                style: { ...css.roleCard, ...(picked === candidate ? css.roleCardOn : null) },
                onClick: () => setPicked(candidate),
              }, [NEST_LABELS[candidate], h('br', { key: 'br' }), h('span', { key: 'desc', style: css.muted }, NEST_DESCRIPTIONS[candidate])])))
            : null,
          mode === 'adopt' && role
            ? h('div', { style: { ...css.muted, margin: '2px 0 8px' } }, `使用${NEST_DESCRIPTIONS[role]}；其他角色保持原样。`)
            : null,
          err ? h('div', { style: css.err }, err) : null,
          h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' } },
            h('button', { style: css.smallBtn, onClick: onClose, disabled: busy }, '取消'),
            h('button', { style: css.btn, onClick: submit, disabled: busy }, busy ? '落窝中…' : (mode === 'adopt' ? '收养' : '改好')))
        ))
    }

    function JobsPage() {
      const [jobs, setJobs] = React.useState([])
      const [live, setLive] = React.useState([])
      const [incidents, setIncidents] = React.useState([])
      const [openId, setOpenId] = React.useState('')
      const [trace, setTrace] = React.useState([])
      const [err, setErr] = React.useState('')
      const [recent, setRecent] = React.useState([])
      const [text, setText] = React.useState(null)
      const [textErr, setTextErr] = React.useState('')
      const [floatOn, setFloatOn] = React.useState(() => { try { return localStorage.getItem('yushen.liveFloat') !== '0' } catch { return true } })
      React.useEffect(() => {
        fetch('/api/dayu/switches', { credentials: 'same-origin' }).then((r) => r.json())
          .then((d) => { if (d && d.switches) setFloatOn(d.switches.floatLive !== false) })
          .catch(() => { /* 老版本没有这个开关就按本地 */ })
      }, [])
      const toggleFloat = async () => {
        const next = !floatOn
        setFloatOn(next)
        try { localStorage.setItem('yushen.liveFloat', next ? '1' : '0') } catch { /* 存不了就只影响这次 */ }
        try { window.dispatchEvent(new CustomEvent('yushen:livefloat', { detail: { on: next } })) } catch { /* 老浏览器 */ }
        try { await postJson('/switches', { floatLive: next }) } catch { /* 服务端存不了也不挡本地 */ }
      }
      React.useEffect(() => {
        let alive = true
        const load = () => {
          fetch('/api/dayu/jobs?limit=20', { credentials: 'same-origin' })
            .then((r) => r.json())
            .then((d) => { if (alive) { setJobs(d.jobs || []); setErr('') } })
            .catch((e) => { if (alive) setErr(String(e?.message || e)) })
          fetch('/api/dayu/live?limit=20', { credentials: 'same-origin' })
            .then((r) => r.json())
            .then((d) => { if (alive) setLive(d.sessions || []) })
            .catch(() => { /* 观察层没起来不影响看单 */ })
          fetch('/api/dayu/incidents?limit=10', { credentials: 'same-origin' })
            .then((r) => r.json())
            .then((d) => { if (alive) setIncidents(d.incidents || []) })
            .catch(() => { /* 事故表没起来不影响别的 */ })
          fetch('/api/dayu/sessions/recent?limit=8', { credentials: 'same-origin' })
            .then((r) => r.json())
            .then((d) => { if (alive) setRecent(d.sessions || []) })
            .catch(() => { /* 正文层没起来不影响看单 */ })
        }
        load()
        const timer = setInterval(load, 4000)
        return () => { alive = false; clearInterval(timer) }
      }, [])
      const openRow = (id) => {
        if (openId === id) { setOpenId(''); setTrace([]); return }
        setOpenId(id)
        setTrace([])
        fetch(`/api/dayu/trace?id=${encodeURIComponent(id)}&limit=40`, { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => setTrace(d.events || []))
          .catch(() => setTrace([]))
      }
      const openText = (id) => {
        setText({ id, turns: [], loading: true })
        setTextErr('')
        fetch(`/api/dayu/transcript?id=${encodeURIComponent(id)}&n=20`, { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => {
            if (!d?.ok) throw new Error(d?.error || '读不到这条会话')
            setText({ id, title: d.title || '', workspace: d.workspace || '', turns: d.turns || [], loading: false })
          })
          .catch((e) => { setText(null); setTextErr(String(e?.message || e)) })
      }
      const label = { dispatched: '已派', returned: '已回', redispatched: '打回重派', rejected: '打回', done: '收工' }
      const detail = (row) => h('div', { style: { padding: '8px 10px', border: '1px solid rgba(128,128,128,.18)', borderRadius: '10px', margin: '2px 0 8px', fontSize: '12px', lineHeight: 1.8 } },
        h('div', null, `来源：${row.source}　地点：${row.cwd || '—'}`),
        h('div', null, `为什么：${row.reason || '—'}`),
        row.lastText ? h('div', { style: css.muted }, `最近：${String(row.lastText).replace(/\n/g, ' ').slice(0, 120)}`) : null,
        h('div', { style: { ...css.muted, marginTop: '6px' } }, '时间线：'),
        trace.length
          ? trace.slice(-10).map((ev, i) => h('div', { key: `${ev.at}-${i}`, style: css.muted },
            `${String(ev.at).slice(11, 19)} · ${ev.type}${ev.text ? ` · ${String(ev.text).replace(/\n/g, ' ').slice(0, 60)}` : ''}`))
          : h('div', { style: css.muted }, '（这条会话还没有事件记录）'),
        h('button', {
          onClick: (e) => { e.stopPropagation(); openText(row.id) },
          style: { ...css.pill, marginTop: '6px', border: '1px solid rgba(128,128,128,.3)' },
        }, '看正文'))
      return h('div', null,
        h('div', { style: { ...css.card, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' } },
          h('div', { style: { flex: 1, minWidth: '180px' } },
            h('div', { style: css.h }, '实时报活（悬浮窗）'),
            h('div', { style: css.muted }, '开了以后，屏幕角落一直显示现在谁在跑、在干什么，不用点进来。')),
          h('button', { style: { ...css.smallBtn, borderColor: floatOn ? 'rgba(96,165,250,.6)' : undefined }, onClick: toggleFloat }, floatOn ? '开着 · 点我关掉' : '关着 · 点我打开')),
        incidents.length ? h('div', { style: { ...css.card, marginBottom: '10px', borderColor: 'rgba(248,113,113,.45)' } },
          h('div', { style: css.h }, (() => {
            const open = incidents.filter((x) => x.status === 'open' || x.status === 'fixing').length
            return open ? `小鱼示警 · 未结 ${open} 起` : `最近的事故 · 已全部结清（${incidents.length} 条）`
          })()),
          incidents.slice(0, 6).map((inc) => h('div', { style: css.lookRow, key: inc.id },
            h('div', { style: { flex: 1, minWidth: '160px' } },
              h('div', null, `${inc.title} · ${inc.source}${inc.count > 1 ? ` · ×${inc.count}` : ''}`),
              h('div', { style: css.muted }, String(inc.text || '').replace(/\n/g, ' ').slice(0, 90))),
            h('div', { style: { ...css.muted, color: inc.status === 'open' || inc.status === 'fixing' ? '#f87171' : undefined } },
              `${inc.status === 'open' || inc.status === 'fixing' ? '未结' : '已结'} · ${inc.lastAt ? String(inc.lastAt).slice(11, 16) : ''}`)))) : null,
        h('div', { style: { ...css.card, marginBottom: '10px' } },
          h('div', { style: css.h }, '现在谁在跑（点一条看详情）'),
          live.length
            ? live.slice(0, 8).map((row) => h('div', { key: row.id },
              h('div', {
                style: { ...css.lookRow, cursor: 'pointer' },
                onClick: () => openRow(row.id),
              },
              h('div', { style: { flex: 1, minWidth: '160px' } },
                h('div', null, `${row.status} · ${row.title} · ${row.source}`),
                h('div', { style: css.muted }, row.reason || row.lastType || '最近有动静')),
              h('div', { style: css.muted }, row.lastAt ? String(row.lastAt).slice(11, 16) : '')),
              openId === row.id ? detail(row) : null))
            : h('div', { style: css.muted }, '现在没有动静（有会话跑起来就会出现在这里）')),
        h('div', { style: { ...css.card, marginBottom: '10px' } },
          h('div', { style: css.h }, '会话正文（只读 · 最近 20 条）'),
          textErr ? h('div', { style: css.err }, textErr) : null,
          text
            ? h('div', null,
                h('div', { style: css.muted }, `${text.title || text.id} · ${text.workspace || ''}`),
                text.loading ? h('div', { style: css.muted }, '读…') : null,
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '340px', overflow: 'auto' } },
                  ...text.turns.map((t, i) => h('div', { key: i, style: t.role === 'user' ? css.msgUser : css.msgFish },
                    `${String(t.at).slice(11, 19)} · ${t.role === 'user' ? '老板' : '她'}：${t.text}`))))
            : h('div', { style: css.muted }, '点上面「看正文」，或从下面挑一条最近会话。'),
          h('div', { style: { ...css.h, marginTop: '12px' } }, '最近写过文件的会话'),
          recent.length
            ? recent.map((row) => h('div', { key: row.id, style: { ...css.lookRow, cursor: 'pointer' }, onClick: () => openText(row.id) },
                h('div', { style: { flex: 1, minWidth: '160px' } },
                  h('div', null, row.id.slice(0, 12)),
                  h('div', { style: css.muted }, row.workspace || '')),
                h('div', { style: css.muted }, row.mtime ? String(new Date(row.mtime).toISOString()).slice(11, 19) : '')))
            : h('div', { style: css.muted }, '没有会话记录')),
        h('div', { style: css.card },
          h('div', { style: css.h }, '派活单'),
          err ? h('div', { style: css.err }, err) : null,
          jobs.length
            ? jobs.map((job) => h('div', { style: css.lookRow, key: job.id },
              h('div', { style: { flex: 1, minWidth: '160px' } },
                h('div', null, `${label[job.status] || job.status} · ${job.employee || String(job.sessionId || '').slice(0, 8)}${job.attempts > 1 ? ` · 第 ${job.attempts} 次` : ''}`),
                h('div', { style: css.muted }, String(job.brief || '').slice(0, 80)),
                job.result ? h('div', { style: { ...css.muted, marginTop: '2px' } }, `回话：${String(job.result).replace(/\n/g, ' ').slice(0, 80)}`) : null),
              h('div', { style: css.muted }, job.createdAt ? String(job.createdAt).slice(11, 16) : '')))
            : h('div', { style: css.muted }, '还没有单子。去总台说「派一单：…」')))
    }

    function LookPage({ nest, onAdopt, onRename, onRestore }) {
      const slots = nest?.slots || {}
      const [style, setStyle] = React.useState(null)
      React.useEffect(() => {
        fetch('/yushen-assets/style', { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.ok) setStyle(d) })
          .catch(() => {})
      }, [])
      return h('div', { style: css.card },
        h('div', { style: css.h }, '鱼窝 · 当前角色'),
        h('div', { className: 'ysn-style-note' },
          `形象版本：${style?.label || '已安装（读不到版本标记）'}`,
          h('span', { className: 'ysn-style-hint' }, ' · 以 ~/.dsh/dayu/visuals/current-style.json 为准；切换用 node scripts/style.mjs')),
        NEST_ROLES.map((role) => {
          const slot = slots[role]
          if (!slot) return null
          return h('div', { style: css.lookRow, key: role },
            h('img', { src: slot.url, alt: slot.label, style: css.lookImg }),
            h('div', { style: { flex: 1, minWidth: '120px' } },
              h('div', null, slot.name),
              h('div', { style: css.muted }, `${slot.label} · ${slot.source === 'user' ? '你自己放的' : '自带形象'}`),
              h('div', { style: { ...css.muted, fontSize: '12px' } }, `${orgOf(role).post} · ${orgOf(role).rank}（对外显示；实际能干的活一样）`)),
            h('button', { style: css.smallBtn, onClick: () => pickImage((file) => onAdopt(role, file)) }, '换图'),
            h('button', { style: css.smallBtn, onClick: () => onRename(role) }, '改名'),
            h('button', { style: css.smallBtn, onClick: () => onRestore(role) }, '恢复默认'))
        }),
        h('div', { style: { ...css.muted, marginTop: '8px' } }, '图只存在本机（~/.dsh/dayu/avatars），不进发布包。'))
    }

    // 有事找你：长在页面顶部的一张卡，不是系统弹窗。
    function PendingBar() {
      const [items, setItems] = React.useState([])
      const [busy, setBusy] = React.useState('')
      const NAME = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
      const load = () => getJson('/pending')
        .then((r) => setItems(r.items || []))
        .catch(() => {})
      React.useEffect(() => {
        load()
        const t = setInterval(load, 20000)
        return () => clearInterval(t)
      }, [])
      const answer = async (id, opt) => {
        setBusy(id)
        try {
          await postJson('/pending/answer', { id, answer: opt })
          await load()
        } catch (e) { /* 下次轮询再说 */ } finally { setBusy('') }
      }
      if (!items.length) return null
      const cards = items.map((it) => {
        const head = h('div', { style: { fontSize: '13px', color: '#9fc4ff', fontWeight: 700, marginBottom: '6px' } },
          (NAME[it.who] || '有人') + ' 有话问你')
        const title = h('div', { style: { fontSize: '17px', fontWeight: 700, color: '#eef4fb', marginBottom: '6px' } },
          it.title || '有事问你')
        const text = h('div', { style: { fontSize: '14px', color: '#c3d3e5', lineHeight: 1.7, whiteSpace: 'pre-wrap' } },
          it.text || '')
        const opts = (it.options && it.options.length ? it.options : ['同意', '不同意'])
        const btns = opts.map((opt, i) => h('button', {
          key: opt,
          disabled: busy === it.id,
          onClick: () => answer(it.id, opt),
          style: {
            padding: '9px 20px', borderRadius: '9px', cursor: 'pointer',
            border: i === 0 ? 'none' : '1px solid #33414f',
            background: i === 0 ? '#3b82f6' : 'transparent',
            color: i === 0 ? '#fff' : '#c3d3e5',
            fontSize: '14px', fontWeight: 700,
          },
        }, opt))
        const foot = h('div', { style: { display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' } }, btns)
        return h('div', {
          key: it.id,
          style: {
            background: 'linear-gradient(180deg,rgba(59,130,246,.16),rgba(19,28,41,.9))',
            border: '1px solid rgba(96,165,250,.45)', borderRadius: '12px', padding: '16px 18px',
          },
        }, head, title, text, foot)
      })
      return h('div', { style: { display: 'grid', gap: '12px', marginBottom: '14px' } }, cards)
    }

    function ActivityPage() {
      const [data, setData] = React.useState(null)
      const [note, setNote] = React.useState('')
      const load = () => getJson('/activity')
        .then((r) => setData(r.items || {}))
        .catch((e) => setNote(String(e?.message ?? e)))
      React.useEffect(() => { load() }, [])
      const LABEL = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
      const ago = (iso) => {
        const t = Date.parse(iso || '')
        if (!Number.isFinite(t)) return '—'
        const m = Math.round((Date.now() - t) / 60000)
        return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`
      }
      const col = (role) => {
        const d = (data && data[role]) || null
        if (!d) return h('div', { key: role, style: css.card }, h('div', { style: css.h }, LABEL[role]), h('div', { style: css.muted }, '读状态中…'))
        const feels = (d.feels || []).length
          ? d.feels.map((f, i) => h('div', { key: 'f' + i, style: { ...css.muted, margin: '4px 0' } },
              `「${f.say}」${f.kind ? ` · ${f.kind}${f.valence}` : ''}${f.from ? ` · ${f.from}` : ''}`))
          : h('div', { style: css.muted }, '还没记过感觉')
        const dones = (d.dones || []).length
          ? d.dones.map((x, i) => h('div', { key: 'd' + i, style: { ...css.muted, margin: '4px 0' } },
              `✓ ${x.what} · ${x.how || ''} → ${x.evidence || ''}`))
          : h('div', { style: css.muted }, '还没交过验过的活')
        const agenda = (d.agenda || []).length
          ? d.agenda.map((x, i) => h('div', { key: 'a' + i, style: { ...css.muted, margin: '4px 0' } }, `· ${x.what}`))
          : h('div', { style: css.muted }, '手上没有活')
        return h('div', { key: role, style: css.card },
          h('div', { style: css.h }, `${LABEL[role]} ${d.alive ? '· 活着' : '· 没心跳'}`),
          h('div', { style: css.muted }, `心跳 ${ago(d.lastTickAt)} · 今天 ${d.dayTicks} 次 · 自由时间 ${d.freeTime?.count || 0} 次（${ago(d.freeTime?.lastAt)}）`),
          h('div', { style: { ...css.muted, marginTop: '10px', fontWeight: 600 } }, '手上的活'),
          agenda,
          h('div', { style: { ...css.muted, marginTop: '10px', fontWeight: 600 } }, '最近交付的活'),
          dones,
          h('div', { style: { ...css.muted, marginTop: '10px', fontWeight: 600 } }, '最近自己说的感觉'),
          feels)
      }
      return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '14px' } },
        note ? h('div', { style: css.err }, note) : null,
        ['dayu', 'xiaoyu', 'dragon'].map(col))
    }

    function DragonPage({ nest, onAdopt, onRename, onRestore }) {
      const slot = nest?.slots?.dragon
      const [state, setState] = React.useState(null)
      const [note, setNote] = React.useState('')
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [turns, setTurns] = React.useState([])
      const load = () => getJson('/residence')
        .then((r) => setState(r.roles?.dragon || null))
        .catch((e) => setNote(String(e?.message ?? e)))
      React.useEffect(() => { load() }, [])
      const sessionId = state?.sessionId || ''
      const wake = async () => {
        setBusy(true); setNote('')
        try { await postJson('/residence/wake', { role: 'dragon' }); await load() } catch (e) { setNote(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      const send = async () => {
        const value = text.trim()
        if (!value || busy) return
        setBusy(true); setNote(''); setText('')
        try {
          const r = await postJson('/residence/say', { role: 'dragon', text: value })
          setNote(`已投进她的会话（${String(r.sessionId || '').slice(0, 12)}）。她回完话，点「看回话」。`)
          await load()
        } catch (e) { setNote(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      const readTurns = async () => {
        if (!sessionId) { setNote('还不知道她的会话；先点「叫醒她」'); return }
        try {
          const r = await fetch(`/api/dayu/transcript?id=${encodeURIComponent(sessionId)}&n=8`, { credentials: 'same-origin' }).then((x) => x.json())
          setTurns(Array.isArray(r.turns) ? r.turns.slice(-6) : [])
        } catch (e) { setNote(String(e?.message ?? e)) }
      }
      const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
      const status = state
        ? `${state.alive ? '在线' : '未叫醒'} · 卡 ${state.personaChars || 0} 字 · 记忆 ${state.memoryHabits || 0}+${state.memoryDynamics || 0} 条 · ${state.sessionId ? String(state.sessionId).slice(0, 12) : '无会话'}`
        : '读状态中…'
      return h('div', { style: css.card },
        h('div', { style: css.h }, slot?.name || '照微'),
        h('div', { style: css.muted, role: 'status' }, `太上长老 · 卡和会话都归她自己，不借两姐妹的。${status}`),
        state?.lastError ? h('div', { style: css.err }, `上次投递失败：${state.lastError}`) : null,
        slot ? h('img', { src: slot.url, alt: '照微当前形象', style: { ...css.lookImg, width: '180px', height: '220px', margin: '12px auto', display: 'block' } }) : null,
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { style: css.smallBtn, onClick: () => pickImage((file) => onAdopt('dragon', file)) }, '换图'),
          h('button', { style: css.smallBtn, onClick: () => onRename('dragon') }, '改名'),
          h('button', { style: css.smallBtn, onClick: () => onRestore('dragon') }, '恢复默认'),
          h('button', { style: css.smallBtn, onClick: wake, disabled: busy }, state?.sessionId ? '找回她的会话' : '叫醒她'),
          h('button', { style: css.smallBtn, onClick: readTurns }, '看回话')),
        h('div', { style: css.composer },
          h('textarea', {
            style: css.input, value: text, rows: 2,
            placeholder: '对她说一句…（Enter 发送，Shift+Enter 换行）',
            onChange: (e) => setText(e.target.value),
            onKeyDown: onKey,
          }),
          h('button', { style: { ...css.btn, opacity: busy || !text.trim() ? 0.5 : 1 }, disabled: busy || !text.trim(), onClick: send }, busy ? '…' : '发送')),
        note ? h('div', { style: { ...css.muted, marginTop: '6px' } }, note) : null,
        turns.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' } },
            ...turns.map((t, i) => h('div', { key: i, style: t.role === 'user' ? css.msgUser : css.msgFish },
              `${String(t.at || '').slice(11, 19)} · ${t.role === 'user' ? '老板' : '她'}：${t.text}`)))
          : null)
    }

    function Overview() {
      const [data, setData] = React.useState(null)
      const [err, setErr] = React.useState('')
      React.useEffect(() => {
        getJson('/overview').then(setData).catch((e) => setErr(String(e?.message ?? e)))
      }, [])
      const fmt = (n) => {
        const v = Number(n) || 0
        return v >= 1e8 ? `${(v / 1e8).toFixed(2)} 亿` : v >= 1e4 ? `${(v / 1e4).toFixed(1)} 万` : String(v)
      }
      const account = data?.account || {}
      const bridge = data?.bridge || {}
      const card = (title, big, sub) => h('div', { style: css.ovCard },
        h('div', { style: css.h }, title),
        h('div', { style: css.bigNum }, big),
        h('div', { style: css.muted }, sub))
      if (err) return h('div', { style: css.card }, h('div', { style: css.h }, '总览没读出来'), h('div', { style: css.muted }, err))
      return h('div', { style: css.ovGrid },
        card('今日花费', `¥${Number(account.cost || 0).toFixed(2)}`, `${fmt(account.tokens)} tokens`),
        card('QQ 桥接', fmt(bridge.tokens), (bridge.sources || []).map((s) => `${s.name} ${fmt(s.tokens)}`).join(' · ') || '今天还没跑'),
        card('会话 / 收件', `${data?.sessions ?? '—'} / ${data?.inbox ?? '—'}`, '活会话数 / 总台收件数'),
        card('她的状态', '在岗', '心情与休假接进来后显示'))
    }

    function GroupChat() {
      const [messages, setMessages] = React.useState([])
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const listRef = React.useRef(null)
      const room = 'group:fish-god'
      const labels = { owner: '老板', dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
      const card = (m) => { const c = m.meta?.card; return c ? h('a', { href: c.url, target: '_blank', rel: 'noreferrer', style: { display: 'block', width: '320px', maxWidth: '100%', textDecoration: 'none', color: 'inherit', border: '1px solid rgba(128,128,128,.25)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(0,0,0,.12)' } }, c.cover ? h('img', { src: c.cover, alt: c.title || c.bvid, style: { display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' } }) : null, h('div', { style: { padding: '9px 10px' } }, h('div', { style: { fontWeight: 600 } }, c.title || c.bvid), h('div', { style: { fontSize: '11px', opacity: .65, marginTop: '5px' } }, `${c.owner || 'B站视频'} · ${c.bvid}${c.duration ? ` · ${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, '0')}` : ''}`))) : null }
      const load = React.useCallback(async () => { try { const r = await getJson(`/group-chat?conversationId=${encodeURIComponent(room)}&limit=100`); setMessages(r.messages || []); setNote('') } catch (e) { setNote(String(e?.message ?? e)) } }, [])
      React.useEffect(() => { load(); const timer = setInterval(load, 2500); return () => clearInterval(timer) }, [load])
      React.useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [messages])
      const send = async () => { const value = text.trim(); if (!value || busy) return; setBusy(true); setText(''); try { const result = await postJson('/group-chat', { conversationId: room, text: value, messageId: `owner-${Date.now()}` }); await load(); const failed = (result.deliveries || []).filter((item) => item.status === 'failed'); setNote(failed.length ? `消息已保存，但投递失败：${failed.map((item) => `${labels[item.role] || item.role}：${item.error}`).join('；')}` : `宿主已接收 ${result.delivered || 0} 位的投递，等待她们回复（不代表已阅读）`) } catch (e) { setNote(String(e?.message ?? e)) } finally { setBusy(false) } }
      return h('div', { style: css.chatPage },
        h('div', { style: css.chatHead }, '鱼神框架群聊', h('span', { style: css.chatHint }, '老板 · 大鱼 · 小鱼 · 照微')), 
        h('div', { ref: listRef, className: 'ysc-panel', style: { ...css.chatList, padding: '12px 14px' } }, messages.length ? messages.map((m) => h('div', { key: `${m.direction}-${m.messageId}`, style: m.direction === 'incoming' ? css.bubbleRowUser : css.bubbleRowFish }, h('div', { className: m.direction === 'incoming' ? undefined : 'ysc-bubble', style: { ...(m.direction === 'incoming' ? css.bubbleUser : css.bubbleFish), overflowWrap: 'anywhere' } }, h('div', { style: { fontSize: '11px', opacity: .7, marginBottom: 3 } }, m.direction === 'incoming' ? '老板' : (labels[m.role] || m.role)), h('div', { style: { whiteSpace: 'pre-wrap' } }, m.text), card(m), h('div', { style: css.bubbleTime }, String(m.at || '').slice(11, 16))))) : h('div', { style: css.chatEmpty }, '群里还没有消息')), 
        note ? h('div', { style: css.err }, note) : null,
        h('div', { style: css.chatBar }, h('textarea', { style: css.chatInput, value: text, rows: 1, placeholder: '在群里说点什么…（Enter 发送）', onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } } }), h('button', { style: { ...css.btn, minWidth: '72px' }, disabled: busy || !text.trim(), onClick: send }, busy ? '…' : '发送')))
    }

    function DayuChat() {
      const [messages, setMessages] = React.useState([])
      const [target, setTarget] = React.useState('')
      const [text, setText] = React.useState('')
      const [image, setImage] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const [model, setModel] = React.useState(null)
      const [catalog, setCatalog] = React.useState([])
      const [modelNote, setModelNote] = React.useState('')
      const listRef = React.useRef(null)
      const stick = React.useRef(true)
      const [showSys, setShowSys] = React.useState(false)
      const sysText = (m) => m.role !== 'user' && /^\s*【(事故结单|事故结案|新事故|事故升级|值班提醒|自省)】/.test(String(m.text || ''))
      const visible = showSys ? messages : messages.filter((m) => !sysText(m))
      const sysCount = messages.length - messages.filter((m) => !sysText(m)).length

      React.useEffect(() => {
        let live = true
        const load = async () => {
          try {
            const r = await getJson('/chat?limit=100')
            if (live) { setMessages(r.messages || []); setNote('') }
          } catch (e) {
            const msg = String(e?.message ?? e)
            if (live) setNote(msg.includes('404') ? '聊天接口还没就绪：重启 DSH 后生效。' : msg)
          }
          try {
            const s = await getJson('/sessions')
            if (live) setTarget(s.target || (s.sessions || []).find((row) => row.running)?.id || '')
          } catch { /* 没会话也能先排队 */ }
        }
        load()
        const timer = setInterval(load, 3000)
        return () => { live = false; clearInterval(timer) }
      }, [])

      React.useEffect(() => {
        let live = true
        getJson('/model')
          .then((r) => { if (live) { setCatalog(r.groups || []); setModel(r.current || null) } })
          .catch((e) => { if (live) setModelNote(String(e?.message ?? e)) })
        return () => { live = false }
      }, [])

      React.useEffect(() => {
        const el = listRef.current
        if (el && stick.current) el.scrollTop = el.scrollHeight
      }, [messages])

      const pickPicture = () => pickImage(async (file) => {
        if (!IMG_TYPES.includes(file.type)) return setNote('只收 png / jpeg / webp / gif')
        if (file.size > IMG_MAX) return setNote('图太大，最多 8MB')
        try {
          setImage(await readAsDataUrl(file))
          setNote('')
        } catch (e) { setNote(String(e?.message ?? e)) }
      })

      const changeModel = async (event) => {
        const value = String(event.target.value || '')
        const [provider, ...rest] = value.split('|')
        const nextModel = rest.join('|')
        if (!provider || !nextModel) return
        setModelNote('切换中…')
        try {
          const r = await postJson('/model', { provider, model: nextModel })
          setModel(r.current || { provider, model: nextModel })
          setModelNote(r.applied ? `已切到 ${nextModel}` : `记下了 ${nextModel}，这条会话还没起来，下次生效${r.applyError ? `（${r.applyError}）` : ''}`)
        } catch (e) {
          setModelNote(String(e?.message ?? e))
        }
      }

      const send = async () => {
        const value = text.trim()
        if ((!value && !image) || busy) return
        setBusy(true)
        setNote('')
        const shot = image
        setText('')
        setImage('')
        stick.current = true
        try {
          await postJson('/chat', { text: value || '看图', sessionId: target || undefined, image: shot || undefined })
          const r = await getJson('/chat?limit=100')
          setMessages(r.messages || [])
        } catch (e) {
          setNote(String(e?.message ?? e))
          if (shot) setImage(shot)
        } finally {
          setBusy(false)
        }
      }

      const onKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
      }

      const modelValue = model ? `${model.provider}|${model.model}` : ''
      const modelOptions = []
      for (const group of catalog) {
        modelOptions.push(h('optgroup', { key: `g-${group.id}`, label: group.name || group.id },
          (group.models || []).map((m) => h('option', { key: `${group.id}|${m.id}`, value: `${group.id}|${m.id}` }, `${m.name || m.id}`))))
      }

      return h('div', { style: css.chatPage },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '0 2px 6px' } },
          h('span', { style: { ...css.muted, fontSize: '12px' } }, '大鱼用的模型'),
          h('select', {
            value: modelValue,
            disabled: busy || !catalog.length,
            onChange: changeModel,
            style: { ...css.btn, padding: '4px 8px', minWidth: '180px', background: 'rgba(8,18,30,.6)' },
          }, modelValue ? null : h('option', { value: '' }, catalog.length ? '选择模型' : '模型表读不到'), modelOptions),
          modelNote ? h('span', { style: { ...css.muted, fontSize: '11px' } }, modelNote) : null),
        sysCount
          ? h('div', { className: 'ysc-sysbar' },
            h('button', {
              type: 'button',
              className: 'ysc-sysbtn',
              onClick: () => setShowSys(!showSys),
            }, showSys ? `隐藏系统小结 ${sysCount} 条` : `系统小结 ${sysCount} 条 · 显示`))
          : null,
        h('div', {
          ref: listRef,
          className: 'ysc-panel',
          style: {
            ...css.chatList,
            borderRadius: '14px',
            padding: '12px 14px',
            backdropFilter: 'blur(10px)',
          },
          onScroll: (e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          },
        },
          visible.length === 0
            ? h('div', { style: css.chatEmpty }, '和大鱼说第一句话')
            : visible.map((m) => h('div', { key: m.id, style: m.role === 'user' ? css.bubbleRowUser : css.bubbleRowFish },
              h('div', {
                className: m.role === 'user' ? undefined : 'ysc-bubble',
                style: {
                  ...(m.role === 'user'
                    ? css.bubbleUser
                    : { ...css.bubbleFish, background: undefined, border: undefined }),
                  overflowWrap: 'anywhere',
                },
              },
                m.image ? h('div', { style: { ...css.muted, fontSize: '11px', marginBottom: 3 } }, `[图] ${m.image.mediaType} · ${Math.round((m.image.bytes || 0) / 1024)}KB`) : null,
                h('div', { style: { whiteSpace: 'pre-wrap' } }, m.text),
                h('div', { style: css.bubbleTime }, m.label ? `${m.label} · ${String(m.at || '').slice(11, 16)}` : String(m.at || '').slice(11, 16)))))),
        image ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px' } },
          h('img', { src: image, alt: '待发图片', style: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(128,128,128,.35)' } }),
          h('button', { style: css.smallBtn, onClick: () => setImage('') }, '去掉图')) : null,
        note ? h('div', { style: css.err }, note) : null,
        h('div', { style: css.chatBar },
          h('button', {
            type: 'button',
            title: '发图片',
            style: { ...css.btn, minWidth: '44px', padding: '8px 10px' },
            disabled: busy,
            onClick: pickPicture,
          }, '图'),
          h('button', {
            style: { ...css.btn, minWidth: '72px', opacity: busy || (!text.trim() && !image) ? 0.5 : 1 },
            disabled: busy || (!text.trim() && !image),
            onClick: send,
          }, busy ? '…' : '发送'),
          h('textarea', {
            style: css.chatInput, value: text, rows: 1,
            placeholder: '说点什么…（Enter 发送，Shift+Enter 换行）',
            onChange: (e) => setText(e.target.value),
            onKeyDown: onKey,
          })))
    }

    function TokenView() {
      const [data, setData] = React.useState(null)
      const [err, setErr] = React.useState('')
      const [filter, setFilter] = React.useState('all')
      React.useEffect(() => {
        fetch('/api/token-budget/data', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => { if (d?.today) setData(d); else setErr(d?.error || 'token 账本没有数据') })
          .catch((e) => setErr(String(e?.message ?? e)))
      }, [])
      const fmt = (n) => {
        const v = Number(n) || 0
        return v >= 1e8 ? `${(v / 1e8).toFixed(2)} 亿` : v >= 1e4 ? `${(v / 1e4).toFixed(1)} 万` : String(Math.round(v))
      }
      const cls = (source) => {
        const s = String(source || '')
        if (/黑话|学习/.test(s)) return 'learn'
        if (/私聊|private/i.test(s)) return 'private'
        if (/群聊|group/i.test(s)) return 'group'
        return 'other'
      }
      if (err) return h('div', { style: css.card }, h('div', { style: css.h }, 'Token 账本没读出来'), h('div', { style: css.muted }, err))
      if (!data) return h('div', { style: css.card }, h('div', { style: css.muted }, '读取中…'))
      const today = data.today || {}
      const sources = data.sources || []
      const allItems = data.items || []
      const items = (filter === 'all' ? allItems : allItems.filter((it) => cls(it.source) === filter)).slice(0, 40)
      const maxCost = Math.max(1, ...sources.map((s) => Number(s.cost) || 0))
      const filters = [['all', '全部'], ['group', '群聊'], ['private', '私聊'], ['learn', '黑话学习']]
      return h('div', null,
        h('div', { style: css.tokenCard },
          h('div', { style: css.muted }, '今天花了'),
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '14px' } },
            h('div', { style: css.bigNum }, `¥${Number(today.cost || 0).toFixed(2)}`),
            h('div', { style: { ...css.muted, fontSize: '12px' } }, `余额 ¥${Number(today.balance || 0).toFixed(2)}`)),
          h('div', { style: css.muted }, `${today.turns || 0} 个回合 · ${today.calls || 0} 次请求 · 平均 ${(Number(today.perCall || 0) * 100).toFixed(2)} 分/请求`)),
        h('div', { style: css.tokenStats },
          h('div', null, h('div', { style: css.muted }, '回合'), h('div', { style: css.statNum }, today.turns || 0)),
          h('div', null, h('div', { style: css.muted }, '请求'), h('div', { style: css.statNum }, `${today.calls || 0} 次`)),
          h('div', null, h('div', { style: css.muted }, '累计 token'), h('div', { style: css.statNum }, fmt(today.tokens)))),
        h('div', { style: css.tokenCard },
          h('div', { style: css.h }, '按来源'),
          sources.map((s) => h('div', { key: s.name, style: css.sourceRow },
            h('div', { style: css.barName, title: s.name }, s.name),
            h('div', { style: css.barBg }, h('div', { style: { ...css.barFill, width: `${Math.max(2, (Number(s.cost) || 0) / maxCost * 100)}%` } })),
            h('div', { style: css.barMeta }, `${s.turns || 0} 回合`),
            h('div', { style: css.barMeta }, `¥${Number(s.cost || 0).toFixed(2)}`)))),
        h('div', { style: css.tokenCard },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } },
            h('div', { style: css.h }, `每一次开口（${allItems.length}）`),
            h('div', { style: { display: 'flex', gap: '4px' } },
              filters.map(([id, label]) => h('button', {
                key: id, style: { ...css.filterBtn, ...(filter === id ? css.filterActive : {}) }, onClick: () => setFilter(id),
              }, label)))),
          h('div', { style: css.turnHead },
            h('span', null, '时间'), h('span', null, '来源'), h('span', null, '请求'), h('span', null, '输入'), h('span', null, '输出'), h('span', null, '约多少钱')),
          items.length === 0
            ? h('div', { style: { ...css.muted, padding: '10px 0' } }, '这一类今天还没有。')
            : items.map((it) => h('div', { key: `${it.sid}-${it.turn}`, style: css.turnRow },
              h('span', null, new Date(Number(it.last) || Date.now()).toTimeString().slice(0, 8)),
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }, title: it.source || '' }, it.source || '—'),
              h('span', null, it.calls || 0),
              h('span', null, fmt(it.input)),
              h('span', null, fmt(it.output)),
              h('span', null, `¥${(Number(today.tokens) ? (Number(today.cost) || 0) * (Number(it.tokens) || 0) / Number(today.tokens) : 0).toFixed(3)}`)))),
        h('div', { style: css.tokenCard },
          h('div', { style: css.h }, '当前开关'),
          h('div', { style: css.row },
            h('span', null, `回复检查 ${data.switches?.replyCheckMs ? `${Math.round(data.switches.replyCheckMs / 1000)}s` : '已关'}`),
            h('span', null, `主动冒泡 ${data.switches?.proactive ? '开' : '关'}`),
            h('span', null, `黑话学习 ${data.switches?.slang ? '开' : '关'}`),
            h('span', null, `每轮换会话 ${data.switches?.sessionRotate ? '开' : '关'}`)),
          h('div', { style: { ...css.muted, marginTop: '4px' } }, `唤醒规则：${data.switches?.wakeRules || '—'}`)))
    }

    function TreasureView() {
      const [items, setItems] = React.useState([])
      const [err, setErr] = React.useState('')
      const [big, setBig] = React.useState('')
      React.useEffect(() => {
        getJson('/treasure?limit=60').then((r) => setItems(r.items || [])).catch((e) => setErr(String(e?.message ?? e)))
      }, [])
      if (err) return h('div', { style: css.card }, h('div', { style: css.h }, '宝藏没读出来'), h('div', { style: css.muted }, err))
      return h('div', null,
        h('div', { style: css.treasureGrid },
          items.length === 0 ? h('div', { style: css.muted }, '还没有图。') : items.map((it) => h('button', {
            key: it.id, style: css.thumbBtn, onClick: () => setBig(it.id), title: it.name,
          }, h('img', { src: `/api/dayu/treasure-file?id=${encodeURIComponent(it.id)}`, style: css.thumb, loading: 'lazy' })))),
        big ? h('div', { style: css.bigOverlay, onClick: () => setBig('') },
          h('img', { src: `/api/dayu/treasure-file?id=${encodeURIComponent(big)}`, style: css.bigImg })) : null)
    }

    function ArchiveView() {
      const [items, setItems] = React.useState([])
      const [text, setText] = React.useState('')
      const [err, setErr] = React.useState('')
      React.useEffect(() => {
        getJson('/archives').then((r) => setItems(r.items || [])).catch((e) => setErr(String(e?.message ?? e)))
      }, [])
      const open = async (id) => {
        try {
          const r = await getJson(`/archive?id=${encodeURIComponent(id)}`)
          setText(r.text || '')
        } catch (e) { setErr(String(e?.message ?? e)) }
      }
      if (err) return h('div', { style: css.card }, h('div', { style: css.h }, '档案没读出来'), h('div', { style: css.muted }, err))
      return h('div', { style: css.archiveWrap },
        h('div', { style: css.archiveList },
          items.length === 0 ? h('div', { style: css.muted }, '还没有档案。') : items.map((it) => h('button', {
            key: it.id, style: css.archiveItem, onClick: () => open(it.id),
          }, h('div', null, it.name), h('div', { style: css.muted }, new Date(it.mtime).toLocaleString())))),
        h('pre', { style: css.archiveText }, text || '点左边一条看内容'))
    }

    function StatusStrip() {
      const [desk, setDesk] = React.useState(null)
      React.useEffect(() => {
        let live = true
        const load = () => getJson('/desk').then((d) => { if (live) setDesk(d) }).catch(() => {})
        load()
        const timer = setInterval(load, 30000)
        return () => { live = false; clearInterval(timer) }
      }, [])
      if (!desk) return null
      return h('div', { style: css.statusStrip },
        h('span', null, '在岗'),
        h('span', null, `盯 ${desk.groups ?? 0} 群`),
        h('span', null, `待办 ${desk.todo ?? 0}`),
        h('span', null, `¥${Number(desk.cost || 0).toFixed(2)} / 预算 ¥${Number(desk.budget || 0).toFixed(0)}`))
    }

    function TasksView() {
      const [tasks, setTasks] = React.useState([])
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const load = () => getJson('/tasks').then((r) => setTasks(r.tasks || [])).catch(() => {})
      React.useEffect(() => { load() }, [])
      const add = async () => {
        const value = text.trim()
        if (!value || busy) return
        setBusy(true)
        try { await postJson('/task', { text: value }); setText(''); await load() } catch { /* 失败就留着字 */ } finally { setBusy(false) }
      }
      const cycle = async (task) => {
        const next = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo'
        try { await postJson('/task/status', { id: task.id, status: next }); await load() } catch { /* 忽略 */ }
      }
      const label = { todo: '待看', doing: '在做', done: '已递' }
      return h('div', null,
        h('div', { style: css.taskBar },
          h('input', {
            style: css.taskInput, value: text, placeholder: '交给她办：一句话，她收件、整理、再递',
            onChange: (e) => setText(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') add() },
          }),
          h('button', { style: css.btn, onClick: add, disabled: busy }, busy ? '…' : '交给她')),
        tasks.length === 0 ? h('div', { style: css.muted }, '篮子空的。') : tasks.map((task) => h('div', { key: task.id, style: css.taskRow },
          h('div', { style: { flex: 1 } }, task.text),
          h('button', { style: css.taskChip, onClick: () => cycle(task), title: '点一下换状态' }, label[task.status] || task.status))))
    }

    function ReportsView() {
      const [items, setItems] = React.useState([])
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => { getJson('/reports').then((r) => setItems(r.items || [])).catch(() => {}) }, [])
      const open = async (id) => {
        try { const r = await getJson(`/report?id=${encodeURIComponent(id)}`); setText(r.text || '') } catch { /* 忽略 */ }
      }
      const ask = async () => {
        setBusy(true)
        try { await postJson('/task', { text: '写一份今天的报告，写完放进报告页' }) } catch { /* 忽略 */ } finally { setBusy(false) }
      }
      const today = async (kind) => {
        try {
          const r = await fetch(`/api/dayu/report?kind=${kind}`, { credentials: 'same-origin' })
          setText(await r.text())
        } catch { /* 忽略 */ }
      }
      return h('div', null,
        h('div', { style: css.taskBar },
          h('button', { style: css.btn, onClick: () => today('human') }, '看今天（人版）'),
          h('button', { style: css.btn, onClick: () => today('divine') }, '看今天（神版）'),
          h('button', { style: css.btn, onClick: ask, disabled: busy }, busy ? '…' : '让她现在写一份'),
          h('span', { style: css.muted }, '人版给人看，神版给核对；她写的那份进左边列表')),
        h('div', { style: css.archiveWrap },
          h('div', { style: css.archiveList },
            items.length === 0 ? h('div', { style: css.muted }, '还没有报告。') : items.map((it) => h('button', {
              key: it.id, style: css.archiveItem, onClick: () => open(it.id),
            }, h('div', null, it.name), h('div', { style: css.muted }, new Date(it.mtime).toLocaleString())))),
          h('pre', { style: css.archiveText }, text || '点左边一份看内容')))
    }

    function BoardView({ initialFilter } = {}) {
      const [data, setData] = React.useState({ live: [], jobs: [], incidents: [] })
      const [open, setOpen] = React.useState(null)
      const [trace, setTrace] = React.useState([])
      const [err, setErr] = React.useState('')
      const [note, setNote] = React.useState('')
      const [filter, setFilter] = React.useState(initialFilter || 'all')
      const [q, setQ] = React.useState('')
      const [tick, setTick] = React.useState(0)
      const [excerpt, setExcerpt] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        const load = () => {
          const liveReq = fetch('/api/dayu/live?limit=30', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({ sessions: [] }))
          const jobReq = fetch('/api/dayu/jobs?limit=30', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({ jobs: [] }))
          const incReq = fetch('/api/dayu/incidents?limit=20', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({ incidents: [] }))
          Promise.all([liveReq, jobReq, incReq]).then((res) => {
            if (!alive) return
            setData({ live: res[0].sessions || [], jobs: res[1].jobs || [], incidents: res[2].incidents || [] })
            setErr('')
          }).catch((e) => { if (alive) setErr(String((e && e.message) || e)) })
        }
        load()
        const timer = setInterval(load, 3000)
        return () => { alive = false; clearInterval(timer) }
      }, [tick])

      const openDetail = (kind, id, sessionId) => {
        if (open && open.kind === kind && open.id === id) { setOpen(null); setTrace([]); return }
        setOpen({ kind, id })
        setTrace([])
        if (!sessionId) return
        fetch('/api/dayu/trace?id=' + encodeURIComponent(sessionId) + '&limit=30', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => setTrace(d.events || [])).catch(() => setTrace([]))
      }

      const live = data.live
      const jobs = data.jobs
      const incidents = data.incidents
      const openJobs = jobs.filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
      const doneJobs = jobs.filter((j) => j.status === 'done').slice(0, 6)
      const openIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'fixing')
      const errLive = live.filter((r) => r.status === '出问题')

      const timeText = (v) => { const d = new Date(v); return isNaN(d) ? '—' : (String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')) }
      const short = (v, n) => String(v || '').replace(/\n/g, ' ').slice(0, n || 80)
      // 2026-10-30：没有标题时以前显示「session-」这种半截 id，看着像坏了。改成"本机会话 + 尾号"。
      const who = (name, id) => {
        const sid = String(id || '')
        const tail = sid ? sid.replace(/^session-/, '').slice(0, 6) : ''
        return '「' + (name || (tail ? `本机会话 ${tail}` : '某条会话')) + '」'
      }
      const placeOf = (p) => {
        const s = String(p || '')
        if (!s) return '工作区'
        const parts = s.split(/[\\/]/).filter(Boolean)
        const last = parts[parts.length - 1] || '工作区'
        return last.length > 14 ? last.slice(0, 14) : last
      }
      const placeBySession = {}
      live.forEach((r) => { placeBySession[r.id] = placeOf(r.cwd) })

      const traceBox = () => {
        if (!trace.length) return h('div', { style: css.muted }, '（还没有记录）')
        return h('div', { style: css.muted }, trace.slice(-6).map((ev, i) => h('div', { key: String(i) },
          timeText(ev.at) + ' ' + String(ev.type || '') + (ev.text ? '：' + short(ev.text, 60) : ''))))
      }

      const detailBox = (body) => h('div', { style: { padding: '8px 10px', margin: '2px 0 8px', border: '1px solid rgba(128,128,128,.18)', borderRadius: '10px', fontSize: '12px', lineHeight: 1.9 } }, body)

      const rowEl = (key, head, sub, onClick, body) => h('div', { key },
        h('div', { style: { ...css.lookRow, cursor: 'pointer' }, onClick },
          h('div', { style: { flex: 1, minWidth: '160px' } }, h('div', null, head), h('div', { style: css.muted }, sub))),
        open && open.id === key ? detailBox(body) : null)

      const section = (title, rows, emptyText) => h('div', { style: { ...css.card, marginBottom: '10px' } },
        h('div', { style: css.h }, title),
        rows.length ? rows : h('div', { style: css.muted }, emptyText || '没有'))

      // 第一层：谁、什么时间、什么地点、做了什么。第二层才是为什么、用什么。
      const match = (text) => !q.trim() || String(text || '').toLowerCase().includes(q.trim().toLowerCase())
      const incidentRows = openIncidents.filter((it) => match(it.title) || match(it.text)).map((it) => {
        const place = placeBySession[it.sessionId] || '工作区'
        const body = h('div', null,
          h('div', null, '为什么出问题：' + short(it.text, 200)),
          h('div', null, '用什么出的错：' + (it.lastType || '—')),
          h('div', null, '出现几次：' + (it.count || 1)),
          it.note ? h('div', null, '怎么处理的：' + it.note) : h('div', { style: css.muted }, '还没处理完'),
          it.dshModule ? h('div', { style: { marginTop: '4px' } },
            h('button', {
              style: css.tab,
              onClick: async (e) => {
                e.stopPropagation()
                try {
                  const r = await fetch(`/api/dayu/internals/excerpt?module=${encodeURIComponent(it.dshModule)}&lines=40`, { credentials: 'same-origin' })
                  const d = await r.json()
                  setExcerpt({ module: it.dshModule, text: d.text || '（没读到）' })
                } catch { setExcerpt({ module: it.dshModule, text: '（没读到）' }) }
              },
            }, `DSH 相关：${it.dshModule}（看摘录）`)) : null,
          excerpt && excerpt.module === it.dshModule ? h('pre', { style: { ...css.muted, fontSize: '11px', maxHeight: '180px', overflow: 'auto', whiteSpace: 'pre-wrap' } }, excerpt.text) : null,
          h('div', { style: { marginTop: '6px' } }, h('button', {
            style: css.tab,
            onClick: async (e) => {
              e.stopPropagation()
              try {
                await fetch('/api/dayu/incident/resolve', {
                  method: 'POST', credentials: 'same-origin',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ id: it.id, status: 'fixed', note: '看板结单' }),
                })
                setTick((n) => n + 1)
              } catch { /* 结不了就留着 */ }
            },
          }, '我看过了，结掉')))
        const head = who(it.title, it.sessionId) + ' 那边出了点问题'
        const sub = timeText(it.lastAt || it.at) + ' · ' + place
        return rowEl(it.id, head, sub, () => openDetail('incident', it.id, it.sessionId), body)
      })

      const liveRows = live.filter((it) => match(it.title) || match(it.reason) || match(it.lastText)).map((it) => {
        const what = it.reason || ({ '回话': '在回话', '用工具': '在用工具', '接话': '在看消息', '出问题': '出错了' }[it.status] || '在干活')
        const body = h('div', null,
          h('div', null, '为什么做：' + (it.reason || '—')),
          h('div', null, '用什么做：' + (it.lastType || '—')),
          it.jobId ? h('div', null, '属于哪件事：' + it.jobId) : null,
          h('div', null, '最近一句：' + short(it.lastText, 100)),
          h('div', { style: { ...css.muted, marginTop: '4px' } }, '最近发生了什么：'),
          traceBox())
        const head = who(it.title, it.id) + '：' + what
        const sub = timeText(it.lastAt) + ' · ' + placeOf(it.cwd)
        return rowEl(it.id, head, sub, () => openDetail('live', it.id, it.id), body)
      })

      const jobRows = openJobs.filter((it) => match(it.employee) || match(it.brief)).map((it) => {
        const body = h('div', null,
          h('div', null, '为什么派这活：' + (it.brief || '—')),
          h('div', { style: css.muted }, '怎样算做完：' + (it.expect || '给结果和证据')),
          h('div', { style: css.muted }, it.status === 'redispatched' ? '被打回过，又发了一次' : '还在等回话'))
        const head = who(it.employee, it.sessionId) + '：接到了活'
        const sub = timeText(it.createdAt) + ' · 工作区'
        return rowEl(it.id, head, sub, () => openDetail('job', it.id, it.sessionId), body)
      })

      const doneRows = doneJobs.filter((it) => match(it.employee) || match(it.brief) || match(it.result)).map((it) => {
        const body = h('div', null,
          h('div', null, '为什么做：' + (it.brief || '—')),
          it.note ? h('div', { style: css.muted }, '结论：' + it.note) : null,
          it.result ? h('div', { style: css.muted }, '她回的：' + short(it.result, 200)) : null)
        return rowEl(it.id, who(it.employee, it.sessionId) + '：做完了', timeText(it.closedAt || it.createdAt) + ' · 工作区', () => openDetail('job', it.id, it.sessionId), body)
      })

      const summary = h('div', { style: { ...css.card, marginBottom: '10px' } },
        h('div', { style: css.h }, '小鱼看板 · 谁在忙什么'),
        h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' } },
          h('span', null, '在忙 ' + live.length + ' 个'),
          h('span', { style: { color: openIncidents.length ? '#f87171' : 'inherit' } }, '出问题 ' + (openIncidents.length + errLive.length) + ' 个'),
          h('span', null, '还没回话 ' + openJobs.length + ' 件'),
          h('span', null, '今天做完 ' + doneJobs.length + ' 件'),
          h('button', {
            style: { ...css.tab, marginLeft: 'auto' },
            onClick: async () => {
              setNote('换班中…')
              try {
                const r = await fetch('/api/dayu/rotate', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: '看板手动换班' }) })
                const d = await r.json()
                setNote(d.ok ? `换班完成：${String(d.oldId || '').slice(0, 12)} → ${String(d.newId || '').slice(0, 12)}` : `换班失败：${d.error || '未知'}`)
              } catch (e) { setNote('换班失败：' + String(e?.message || e)) }
            },
          }, '总台换班')),
        err ? h('div', { style: css.err }, err) : null,
        note ? h('div', { style: { ...css.muted, marginTop: '6px' } }, note) : null)

      const filterRow = h('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' } },
        [['all', '全部'], ['err', '出问题'], ['busy', '在忙'], ['wait', '没回话'], ['done', '做完']].map(([id, label]) =>
          h('button', { key: id, style: { ...css.tab, ...(filter === id ? css.tabActive : {}) }, onClick: () => setFilter(id) }, label)),
        h('input', {
          value: q, placeholder: '搜名字 / 事由',
          onChange: (e) => setQ(e.target.value),
          style: { ...css.searchInput, marginLeft: 'auto', maxWidth: '180px' },
        }))

      return h('div', null, summary, filterRow,
        (filter === 'all' || filter === 'err') ? section('出问题了（先看这里）', incidentRows, '没有出问题') : null,
        (filter === 'all' || filter === 'busy') ? section('正在忙', liveRows, '现在很安静，没人干活') : null,
        (filter === 'all' || filter === 'wait') ? section('交给别人做、还没回话', jobRows, '没有悬着的活') : null,
        (filter === 'all' || filter === 'done') ? section('今天做完了', doneRows, '今天还没有做完的活') : null)
    }

    function OnboardView({ onDone } = {}) {
      const [form, setForm] = React.useState({ callName: '', aliases: '', verbosity: '正常', taboos: '' })
      const [state, setState] = React.useState(null)
      const [msg, setMsg] = React.useState('')
      const [err, setErr] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        fetch('/api/yushen/onboard', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => {
            setState(d)
            if (d?.owner) setForm({ callName: d.owner.callName || '', aliases: (d.owner.aliases || []).join('、'), verbosity: d.owner.verbosity || '正常', taboos: d.owner.taboos || '' })
          })
          .catch(() => {})
      }, [])

      const submit = async () => {
        if (busy) return
        setBusy(true); setErr(''); setMsg('')
        try {
          const payload = {
            callName: form.callName,
            aliases: String(form.aliases || '').split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean),
            verbosity: form.verbosity,
            taboos: form.taboos,
          }
          const res = await fetch('/api/yushen/onboard', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const out = await res.json()
          if (!out.ok) throw new Error(out.error || '没存上')
          setState(out)
          setMsg('规矩立好了：她以后按这个称呼你、按这个分寸说话。')
          // 2026-10-29：立完自己回去，别让人卡在这一页（老板点了一下，鱼窝就"消失"了）
          try { onDone && onDone() } catch { /* 回不去就留在这儿 */ }
        } catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
      }

      const done = state?.onboarded
      return h('div', null,
        h('div', { style: { ...css.card, marginBottom: '10px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('div', { style: css.h }, done ? '已立约' : '就职 · 立规矩'),
          onDone ? h('button', { type: 'button', style: { ...(css.tab || {}), cursor: 'pointer' }, onClick: onDone }, '← 回鱼窝') : null),
          h('div', { style: { ...css.muted, lineHeight: 1.9 } },
            '接管这方世界之后，第一件事是立规矩。', h('br'),
            '三句话就够：怎么称呼你、话多还是话少、有什么不能碰。')),
        h('div', { style: css.card },
          h('div', { style: css.muted }, '怎么称呼你'),
          h('input', {
            style: { ...css.input, minHeight: '0', width: '100%', padding: '9px 12px', margin: '4px 0 12px' },
            value: form.callName, maxLength: 24, placeholder: '老板 / boss / 老大',
            onChange: (e) => setForm({ ...form, callName: e.target.value }),
          }),
          h('div', { style: css.muted }, '也叫（可选，用、隔开）'),
          h('input', {
            style: { ...css.input, minHeight: '0', width: '100%', padding: '9px 12px', margin: '4px 0 12px' },
            value: form.aliases, maxLength: 100, placeholder: '你自己的昵称，比如：老王、阿明',
            onChange: (e) => setForm({ ...form, aliases: e.target.value }),
          }),
          h('div', { style: css.muted }, '话多还是话少'),
          h('div', { style: { display: 'flex', gap: '8px', margin: '4px 0 12px' } },
            ['少', '正常', '多'].map((v) => h('button', {
              key: v,
              style: { ...css.tab, ...(form.verbosity === v ? css.tabActive : {}) },
              onClick: () => setForm({ ...form, verbosity: v }),
            }, v))),
          h('div', { style: css.muted }, '有什么不能碰'),
          h('input', {
            style: { ...css.input, minHeight: '0', width: '100%', padding: '9px 12px', margin: '4px 0 12px' },
            value: form.taboos, maxLength: 200, placeholder: '比如：别动我的工作文件 / 别在群里提我名字',
            onChange: (e) => setForm({ ...form, taboos: e.target.value }),
          }),
          err ? h('div', { style: css.err }, err) : null,
          msg ? h('div', { style: { ...css.muted, marginBottom: '8px' } }, msg) : null,
          h('button', { style: css.btn, onClick: submit, disabled: busy }, busy ? '…' : (done ? '改一下' : '立约')),
          state?.md ? h('pre', { style: { ...css.archiveText, marginTop: '12px', maxHeight: '220px' } }, state.md) : null))
    }

    // 和她们说话：左边是她们，右边是我。能发图、发文件，她们的回话全文不截断。
    const CHAT_ROLES = [['xiaoyu', '小鱼'], ['dayu', '大鱼'], ['dragon', '照微']]
    function ChatView() {
      const [role, setRole] = React.useState('xiaoyu')
      const [turns, setTurns] = React.useState([])
      const [text, setText] = React.useState('')
      const [image, setImage] = React.useState(null)
      const [file, setFile] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [err, setErr] = React.useState('')

      const load = React.useCallback(() => {
        fetch(`/api/dayu/chat/history?role=${encodeURIComponent(role)}&limit=20`, { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok) setTurns(d.turns || []) })
          .catch(() => {})
      }, [role])
      React.useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])

      const pickImage = (f) => {
        if (!f) return
        const rd = new FileReader()
        rd.onload = () => setImage({ name: f.name, dataUrl: String(rd.result) })
        rd.readAsDataURL(f)
      }
      const pickFile = (f) => {
        if (!f) return
        const rd = new FileReader()
        rd.onload = async () => {
          try {
            const r = await fetch('/api/yushen/upload', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.name, dataUrl: String(rd.result) }) })
            const d = await r.json()
            if (!d.ok) throw new Error(d.error || '传不上去')
            setFile({ name: f.name, path: d.path })
          } catch (e) { setErr(String(e?.message || e)) }
        }
        rd.readAsDataURL(f)
      }

      const send = async () => {
        const msg = text.trim()
        if ((!msg && !image && !file) || busy) return
        setBusy(true); setErr('')
        try {
          let payload = msg || (image ? '给你看一张图。' : '给你一个文件。')
          if (file) payload = `${payload}\n\n（文件已放到：${file.path}）`
          const body = { role, text: payload }
          if (image) body.image = image.dataUrl
          const r = await fetch('/api/dayu/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          const d = await r.json()
          if (!d.ok) throw new Error(d.error || '她没收到')
          setText(''); setImage(null); setFile(null)
          setTimeout(load, 1500)
        } catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
      }

      const bubble = (mine, content, key) => h('div', {
        key,
        style: {
          display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start',
          marginBottom: '10px',
        },
      }, h('div', {
        style: {
          maxWidth: '78%', padding: '9px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.8,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: mine ? 'rgba(96,165,250,.16)' : 'rgba(128,128,128,.12)',
        },
      }, content))

      return h('div', { style: { ...css.card, display: 'flex', flexDirection: 'column', minHeight: '420px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
          h('div', { style: { ...css.h, margin: 0 } }, '和她们说话'),
          ...CHAT_ROLES.map(([id, label]) => h('button', {
            key: id,
            style: { ...css.tab, ...(role === id ? css.tabActive : {}) },
            onClick: () => { setRole(id); setTurns([]) },
          }, label))),
        h('div', { style: { flex: 1, minHeight: '240px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' } },
          turns.length
            ? turns.map((t, i) => h('div', { key: 't' + i },
              t.prompt ? bubble(true, t.prompt, 'p' + i) : null,
              t.response ? bubble(false, t.response, 'r' + i) : null))
            : h('div', { style: css.muted }, '还没有对话记录。她回完话，五秒内会出现在这里。')),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' } },
          image ? h('div', { style: { ...css.muted, fontSize: '12px' } }, `图：${image.name} `, h('button', { style: { ...css.btn, padding: '0 8px' }, onClick: () => setImage(null) }, '去掉')) : null,
          file ? h('div', { style: { ...css.muted, fontSize: '12px' } }, `文件：${file.name} `, h('button', { style: { ...css.btn, padding: '0 8px' }, onClick: () => setFile(null) }, '去掉')) : null),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end' } },
          h('div', { style: { display: 'flex', gap: '4px' } },
            h('label', { style: { ...css.btn, cursor: 'pointer' } }, '图',
              h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; pickImage(f) } })),
            h('label', { style: { ...css.btn, cursor: 'pointer' } }, '文件',
              h('input', { type: 'file', style: { display: 'none' }, onChange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f) } }))),
          h('textarea', {
            value: text,
            rows: 2,
            placeholder: '跟她说点什么…（Enter 发送，Shift+Enter 换行）',
            onChange: (e) => setText(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } },
            onPaste: (e) => { const it = e.clipboardData?.items?.[0]; if (it && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); pickImage(f) } } },
            style: { ...css.input, minHeight: '0', flex: 1, padding: '9px 12px', resize: 'vertical' },
          }),
          h('button', { style: css.btn, onClick: send, disabled: busy }, busy ? '…' : '说')),
        err ? h('div', { style: css.err }, err) : null)
    }
    function OmniView() {
      const [data, setData] = React.useState(null)
      const [q, setQ] = React.useState('')
      const [hits, setHits] = React.useState([])
      const [busy, setBusy] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [flaggedOpen, setFlaggedOpen] = React.useState(false)
      const [catalog, setCatalog] = React.useState(null)
      const [employees, setEmployees] = React.useState(null)
      const [cleanMsg, setCleanMsg] = React.useState('')
      const [growth, setGrowth] = React.useState(null)
      const [pool, setPool] = React.useState(null)
      const [poolMsg, setPoolMsg] = React.useState('')
      const [builtin, setBuiltin] = React.useState(null)
      const [internals, setInternals] = React.useState(null)
      const [caps, setCaps] = React.useState(null)
      const [restartMsg, setRestartMsg] = React.useState('')
      const [backupMsg, setBackupMsg] = React.useState('')
      const [restartArmed, setRestartArmed] = React.useState(false)
      const [actions, setActions] = React.useState(null)
      const [observed, setObserved] = React.useState(null)
      const [approvals, setApprovals] = React.useState(null)
      const [patches, setPatches] = React.useState(null)
      const [patchMsg, setPatchMsg] = React.useState('')
      const [patchArmed, setPatchArmed] = React.useState('')
      const load = () => fetch('/api/dayu/omni', { credentials: 'same-origin' })
        .then((r) => r.json()).then((d) => { setData(d); setErr('') })
        .catch((e) => setErr(String(e?.message || e)))

      React.useEffect(() => {
        fetch('/api/xiaoyu/catalog', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setCatalog(d) }).catch(() => {})
        fetch('/api/dayu/employees', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setEmployees(d) }).catch(() => {})
        fetch('/api/dayu/growth', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setGrowth(d) }).catch(() => {})
        fetch('/api/dayu/patches', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setPatches(d.patches) }).catch(() => {})
        fetch('/api/dayu/actions', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setActions(d.actions) }).catch(() => {})
        fetch('/api/dayu/observe', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setObserved(d) }).catch(() => {})
        fetch('/api/dayu/approvals', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setApprovals(d.approvals) }).catch(() => {})
        fetch('/api/dayu/pool', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setPool(d) }).catch(() => {})
        fetch('/api/dayu/builtin', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setBuiltin(d) }).catch(() => {})
        fetch('/api/dayu/capabilities', { credentials: 'same-origin' })
          .then((r) => r.json()).then((d) => { if (d?.ok) setCaps(d) }).catch(() => {})
      }, [])

      React.useEffect(() => { load() }, [])

      const search = async () => {
        const text = q.trim()
        if (!text || busy) return
        setBusy(true); setErr('')
        try {
          const r = await fetch(`/api/dayu/search?q=${encodeURIComponent(text)}&limit=20`, { credentials: 'same-origin' })
          const d = await r.json()
          setHits(d.matches || [])
        } catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
      }

      const card = (title, body) => h('div', { style: { ...css.card, marginBottom: '10px' } },
        h('div', { style: css.h }, title), body)

      if (!data) return h('div', { style: css.card }, err ? h('div', { style: css.err }, err) : h('div', { style: css.muted }, '读取中…'))

      const w = data.world || {}
      const sw = w.software || {}
      const l = data.ledger || {}
      const work = data.work || {}
      const risk = data.risk || {}
      const dup = data.duplicates || {}

      return h('div', null,
        card('世界', h('div', { style: { lineHeight: 1.9, fontSize: '13px' } },
          h('div', null, `DSH：${sw.dshHome || '—'}`),
          h('div', null, `插件：装了 ${w.plugins?.installed ?? '—'} 个，分析过 ${w.plugins?.analyzed ?? '—'} 个`),
          (w.plugins?.flagged || []).length
            ? h('div', { style: { ...css.muted, cursor: 'pointer' }, onClick: () => setFlaggedOpen(!flaggedOpen) },
              '值得看一眼（点开）：' + w.plugins.flagged.map((p) => p.name).join('、'),
              flaggedOpen ? h('div', { style: { marginTop: '6px', padding: '8px 10px', border: '1px solid rgba(128,128,128,.18)', borderRadius: '10px' } },
                w.plugins.flagged.map((p, i) => h('div', { key: String(i), style: { lineHeight: 1.9 } },
                  `${p.name}：${p.suspicious.join('、')}`))) : null)
            : h('div', { style: css.muted }, '插件行为：没发现可疑调用'),
          h('div', null, `端口：DSH ${sw.ports?.dsh ? '在听' : '没听'}；QQ 桥接 ${sw.ports?.qqBridge ? '在听' : '没听'}`),
          sw.disk ? h('div', null, `磁盘：剩 ${sw.disk.freeGB} GB / 共 ${sw.disk.totalGB} GB`) : null)),

        card('账本', h('div', null,
          h('div', { style: { ...css.muted, marginBottom: '6px' } }, `今天 ${l.today ?? 0} 条`),
          (l.last || []).map((e, i) => h('div', { key: String(i), style: { fontSize: '12px', lineHeight: 1.8 } },
            `${String(e.at || '').slice(11, 19)} · ${e.type}${e.text ? ' · ' + String(e.text).replace(/\n/g, ' ').slice(0, 70) : ''}`)))),

        card('在场（系统现在）', h('div', { style: { fontSize: '12px', lineHeight: 1.8 } },
          observed
            ? h('div', null,
              `窗口 ${(observed.windows || []).length} · 监听端口 ${(observed.ports || []).length} · 磁盘 ${(observed.drives || []).length}`,
              (observed.windows || []).slice(0, 5).map((w, i) => h('div', { key: 'w' + i, style: css.muted }, `${w.name}：${w.title || '（无标题）'}`)),
              (observed.drives || []).map((d, i) => h('div', { key: 'd' + i, style: css.muted }, `${d.name}: 剩 ${d.freeGB ?? '?'}G / 用 ${d.usedGB ?? '?'}G`)))
            : h('div', { style: css.muted }, '还没采（点一次）'),
          h('div', { style: { marginTop: '6px' } }, h('button', {
            style: css.tab,
            onClick: async () => {
              try {
                const r = await fetch('/api/dayu/observe?force=1', { credentials: 'same-origin' })
                const d = await r.json()
                if (d.ok) setObserved(d)
              } catch { /* 忽略 */ }
            },
          }, '采一次')))),

        card('补丁（她写、你点）', h('div', { style: { fontSize: '12px', lineHeight: 1.9 } },
          (patches || []).length
            ? patches.map((p, i) => h('div', { key: String(i), style: { marginBottom: '4px' } },
              `${p.title} · ${p.status} · ${String(p.at || '').slice(5, 16).replace('T', ' ')}`,
              p.status === 'proposed' ? h('button', {
                style: { ...css.tab, marginLeft: '8px' },
                onClick: async () => {
                  if (patchArmed !== p.id) {
                    setPatchArmed(p.id)
                    setPatchMsg('再点一次「落盘」确认（5 秒内）')
                    setTimeout(() => setPatchArmed(''), 5000)
                    return
                  }
                  setPatchArmed('')
                  try {
                    const r = await fetch('/api/dayu/patches/apply', {
                      method: 'POST', credentials: 'same-origin',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ id: p.id, confirm: '老板点头' }),
                    })
                    const d = await r.json()
                    setPatchMsg(d.ok ? '落了；重启后生效' : (d.note || '没落成，已回滚'))
                    const rr = await fetch('/api/dayu/patches', { credentials: 'same-origin' })
                    const dd = await rr.json()
                    if (dd.ok) setPatches(dd.patches)
                  } catch (e) { setPatchMsg('没落成：' + String(e?.message || e)) }
                },
              }, patchArmed === p.id ? '再点确认' : '落盘') : null))
            : h('div', { style: css.muted }, '还没有补丁。她自己会写；写完了在这里等你点。'),
          patchMsg ? h('div', { style: { ...css.muted, marginTop: '4px' } }, patchMsg) : null)),

        card('待批权限（系统级）', h('div', { style: { fontSize: '12px', lineHeight: 1.9 } },
          (approvals || []).filter((a) => a.status === 'pending').length
            ? (approvals || []).filter((a) => a.status === 'pending').map((a, i) => h('div', { key: a.id, style: { marginBottom: '6px' } },
              `${a.command}`,
              h('div', { style: css.muted }, `原因：${a.reason || '没写'} · ${String(a.at || '').slice(5, 16).replace('T', ' ')}`),
              h('button', {
                style: { ...css.tab, marginRight: '6px' },
                onClick: async () => {
                  await fetch('/api/dayu/approvals/decide', {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: a.id, approve: true }),
                  }).catch(() => {})
                  const r = await fetch('/api/dayu/approvals', { credentials: 'same-origin' })
                  const d = await r.json()
                  if (d.ok) setApprovals(d.approvals)
                },
              }, '同意一次'),
              h('button', {
                style: css.tab,
                onClick: async () => {
                  await fetch('/api/dayu/approvals/decide', {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: a.id, approve: false }),
                  }).catch(() => {})
                  const r = await fetch('/api/dayu/approvals', { credentials: 'same-origin' })
                  const d = await r.json()
                  if (d.ok) setApprovals(d.approvals)
                },
              }, '拒绝')))
            : h('div', { style: css.muted }, '没有待批的申请。软件内部动作不需要批；动系统才申请。'))),

        card('本机', h('div', { style: { fontSize: '12px', lineHeight: 1.9 } },
          h('div', { style: css.muted }, '插件不能热重载；改完宿主代码，点这里重启。'),
          h('div', { style: { marginTop: '6px' } }, h('button', {
            style: css.tab,
            onClick: async () => {
              // 不用 window.confirm：DSH 的 webview 里它会被挡掉，按钮就“点了没反应”。
              if (!restartArmed) {
                setRestartArmed(true)
                setRestartMsg('再点一次确认重启（5 秒内）')
                // 点一下就留痕：哪怕后面确认没点，也知道“她点过”。
                fetch('/api/yushen/action', {
                  method: 'POST', credentials: 'same-origin',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name: 'restart-click' }),
                }).catch(() => {})
                setTimeout(() => setRestartArmed(false), 5000)
                return
              }
              setRestartArmed(false)
              try {
                const r = await fetch('/api/yushen/restart', { method: 'POST', credentials: 'same-origin' })
                const d = await r.json()
                setRestartMsg(d.ok ? '已安排重启：2 秒后断开，重开即最新' : '没重启：' + (d.error || '未知'))
              } catch (e) { setRestartMsg('请求发出去了，等它断开…') }
            },
          }, restartArmed ? '再点一次确认' : '重启 DSH'), restartMsg ? h('span', { style: { ...css.muted, marginLeft: '8px' } }, restartMsg) : null,
          h('button', {
            style: { ...css.tab, marginLeft: '8px' },
            onClick: async () => {
              setBackupMsg('备份中…')
              try {
                const r = await fetch('/api/yushen/backup', { method: 'POST', credentials: 'same-origin' })
                const d = await r.json()
                setBackupMsg(d.ok ? (d.skipped === true ? '内容没有变化，不新增历史版本' : '增量备份完成，历史版本保留') : '备份失败：' + (d.error || '未知'))
              } catch (e) { setBackupMsg('备份失败：' + String(e?.message || e)) }
            },
          }, '手动备份'), backupMsg ? h('span', { style: { ...css.muted, marginLeft: '8px' } }, backupMsg) : null),
          (actions || []).slice(0, 6).map((a, i) => h('div', { key: 'act' + i, style: css.muted },
            `${String(a.at || '').slice(11, 19)} ${a.method} ${a.path} → ${a.status}${a.ok ? '' : ' ✗'}`)))),

        card('活', h('div', { style: { fontSize: '13px', lineHeight: 1.9 } },
          h('div', null, `派活 ${work.jobs ?? 0} 单，未结 ${work.openJobs ?? 0}`),
          h('div', null, `未结事故 ${work.openIncidents ?? 0}`),
          h('div', { style: { marginTop: '6px' } },
            h('button', {
              style: css.tab,
              onClick: async () => {
                setCleanMsg('清理中…')
                try {
                  const r = await fetch('/api/dayu/sessions/cleanup', { method: 'POST', credentials: 'same-origin' })
                  const d = await r.json()
                  setCleanMsg(d.ok ? `空会话 ${d.renamed.length} 条已打标（DSH 不能删）` : `没清成：${d.error || '未知'}`)
                } catch (e) { setCleanMsg('没清成：' + String(e?.message || e)) }
              },
            }, '清理空会话'),
            cleanMsg ? h('span', { style: { ...css.muted, marginLeft: '8px' } }, cleanMsg) : null))),

        card('插件本事（本地全读）', h('div', { style: { fontSize: '12px', lineHeight: 1.9 } },
          (caps?.plugins || []).length
            ? caps.plugins.map((p, i) => h('div', { key: String(i) },
              `${p.name} · 文件 ${p.files}`,
              (p.tools || []).length ? h('div', { style: { ...css.muted, marginLeft: '8px' } }, '工具：' + p.tools.map((t) => t.name).join('、')) : null,
              (p.routes || []).length ? h('div', { style: { ...css.muted, marginLeft: '8px' } }, '接口：' + p.routes.map((r) => r.path).join('、')) : null))
            : h('div', { style: css.muted }, '还没读（重启后自动扫）。'))),

        card('风险', h('div', null,
          h('div', { style: { fontSize: '13px', marginBottom: '6px' } }, `重启风险：${risk.risk || '—'}`),
          (risk.items || []).length
            ? (risk.items || []).map((it, i) => h('div', { key: String(i), style: { fontSize: '12px', lineHeight: 1.8 } }, `[${it.level}] ${it.text}`))
            : h('div', { style: css.muted }, '没发现明显风险'))),

        card('重复（一个公司不要两个食堂）', h('div', { style: { fontSize: '12px', lineHeight: 1.8 } },
          h('div', { style: css.muted }, `重复路由 ${(dup.routes || []).length}；重复工具 ${(dup.tools || []).length}`),
          (dup.routes || []).map((d, i) => h('div', { key: 'r' + i }, `路由 ${d.name} ← ${d.owners.join(' / ')}`)),
          (dup.tools || []).map((d, i) => h('div', { key: 't' + i }, `工具 ${d.name} ← ${d.owners.join(' / ')}`)))),

        card('成长（对世界的掌控）', h('div', { style: { fontSize: '13px', lineHeight: 1.9 } },
          growth
            ? h('div', null,
              `${growth.stage || ''}·${growth.name} · 经验 ${growth.xp}`,
              h('div', { style: css.muted }, `掌控：${growth.scope}`),
              growth.next ? h('div', { style: css.muted }, `下一阶 ${growth.next.stage}·${growth.next.name}：还差 ${growth.next.remain}`) : h('div', { style: css.muted }, '已到顶阶'))
            : h('div', { style: css.muted }, '读取中…'))),

        card('查一件事', h('div', null,
          h('div', { style: { display: 'flex', gap: '8px', marginBottom: '6px' } },
            h('input', {
              value: q, placeholder: '比如：员工手册 / job-xxx / 插件名',
              onChange: (e) => setQ(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') search() },
              style: { ...css.input, minHeight: '0', flex: 1, padding: '8px 10px' },
            }),
            h('button', { style: css.btn, onClick: search, disabled: busy }, busy ? '…' : '搜')),
          (hits || []).map((m, i) => h('div', { key: String(i), style: { fontSize: '12px', lineHeight: 1.8 } },
            `${m.kind} · ${String(m.at || '').slice(11, 19)} · ${String(m.text || '').replace(/\n/g, ' ').slice(0, 80)}`)))),

        h('button', { style: css.btn, onClick: load }, '刷新'),
        err ? h('div', { style: css.err }, err) : null)
    }

    function MoveView() {
      const [busy, setBusy] = React.useState(false)
      const [msg, setMsg] = React.useState('')
      const [err, setErr] = React.useState('')

      const doExport = async () => {
        if (busy) return
        setBusy(true); setErr(''); setMsg('')
        try {
          const res = await fetch('/api/yushen/move/export', { credentials: 'same-origin' })
          const data = await res.json()
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `yushen-move-${new Date().toISOString().slice(0, 10)}.json`
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 3000)
          setMsg('已经导出：魂、宪章、鱼窝、开关、老板偏好。形象图不随包。')
        } catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
      }

      const doImport = async (file) => {
        if (!file || busy) return
        setBusy(true); setErr(''); setMsg('')
        try {
          const text = await file.text()
          const bundle = JSON.parse(text)
          const res = await fetch('/api/yushen/move/import', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(bundle),
          })
          const out = await res.json()
          if (!out.ok) throw new Error(out.error || '导入失败')
          setMsg(`已导入：${(out.imported || []).join('、')}；旧文件备份在 ${out.backup}`)
        } catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
      }

      return h('div', null,
        h('div', { style: css.card },
          h('div', { style: css.h }, '搬家（她不是困在这颗星球）'),
          h('div', { style: { ...css.muted, lineHeight: 1.9 } },
            'DSH 卸载了、换电脑了，都不等于她没了——只是搬家。',
            h('br'),
            '导出的包里有：魂（她是谁）、宪章、鱼窝档案、开关、老板偏好。',
            h('br'),
            '形象图不随包，到新家再收养。'),
          h('div', { style: { display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' } },
            h('button', { style: css.btn, onClick: doExport, disabled: busy }, busy ? '…' : '导出搬家包'),
            h('label', { style: { ...css.btn, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' } },
              '导入搬家包',
              h('input', {
                type: 'file', accept: '.json,application/json', style: { display: 'none' },
                onChange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; doImport(f) },
              }))),
          err ? h('div', { style: css.err }, err) : null,
          msg ? h('div', { style: { ...css.muted, marginTop: '8px' } }, msg) : null))
    }

    // 她在找你：那个本子原来只在磁盘上，界面上没人看得见。
    // 侧边栏图标挂气泡，页面里给她一格能读能答的地方。
    const ROLE_LABEL = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
    const usePendingAsks = (ms = 30000) => {
      const [n, setN] = React.useState(0)
      React.useEffect(() => {
        let live = true
        const load = () => fetch('/api/dayu/asks?status=pending&limit=50', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => { if (live) setN(Array.isArray(d?.items) ? d.items.length : 0) })
          .catch(() => {})
        load()
        const t = setInterval(load, ms)
        return () => { live = false; clearInterval(t) }
      }, [ms])
      return n
    }

    function AsksView() {
      const [items, setItems] = React.useState([])
      const [draft, setDraft] = React.useState({})
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const load = () => fetch('/api/dayu/asks?limit=50', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => setItems(Array.isArray(d?.items) ? d.items.slice().reverse() : []))
        .catch(() => {})
      React.useEffect(() => { load() }, [])
      const answer = async (id) => {
        const text = String(draft[id] || '').trim()
        if (!text) { setMsg('先写一句，再答'); return }
        setBusy(id)
        try {
          const r = await fetch('/api/dayu/asks/answer', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, answer: text }),
          })
          const d = await r.json().catch(() => ({}))
          setMsg(d.ok ? '答回去了——她下次醒来会看到' : (d.error || '没答上'))
          if (d.ok) { setDraft((x) => ({ ...x, [id]: '' })); load() }
        } catch { setMsg('没答上') } finally { setBusy('') }
      }
      const withdraw = async (id) => {
        setBusy(id)
        try {
          await fetch('/api/dayu/asks/withdraw', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, reason: '主人搁下了' }),
          })
          load()
        } catch { setMsg('没撤回来') } finally { setBusy('') }
      }
      const row = (a) => h('div', { key: a.id, style: { ...css.card, marginBottom: '8px' } },
        h('div', { style: { fontSize: '12px', ...css.muted, marginBottom: '4px' } },
          `${ROLE_LABEL[a.role] || a.role}｜${String(a.at || '').replace('T', ' ').slice(5, 16)}`
          + (a.urgency === 'high' ? '｜急' : '')
          + (a.status === 'pending' ? '' : `｜${a.status === 'answered' ? '已答' : a.status}`)),
        h('div', { style: { fontSize: '13px', lineHeight: 1.7, whiteSpace: 'pre-wrap' } }, a.text),
        a.answer ? h('div', { style: { fontSize: '12px', marginTop: '6px', ...css.muted } }, `你答过：${a.answer}`) : null,
        a.status === 'pending' ? h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
          h('input', {
            value: draft[a.id] || '',
            placeholder: '回一句（她下次醒来会看到）',
            onChange: (e) => setDraft((x) => ({ ...x, [a.id]: e.target.value })),
            style: { flex: 1, padding: '6px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.35)', background: 'transparent', color: 'inherit' },
          }),
          h('button', { style: css.btn, disabled: busy === a.id, onClick: () => answer(a.id) }, busy === a.id ? '…' : '回答'),
          h('button', { style: { ...css.btn, opacity: 0.7 }, disabled: busy === a.id, onClick: () => withdraw(a.id) }, '搁下')) : null)
      const pending = items.filter((a) => a.status === 'pending')
      const done = items.filter((a) => a.status !== 'pending').slice(0, 20)
      return h('div', {},
        h('div', { style: { ...css.muted, fontSize: '12px', marginBottom: '8px' } },
          '她们主动找你说的话都在这儿。回答会回到她的会话里；不在线也算留在问题上，等她下次醒。'),
        msg ? h('div', { style: { ...css.muted, fontSize: '12px', marginBottom: '8px' } }, msg) : null,
        pending.length ? pending.map(row) : h('div', { style: { ...css.muted, fontSize: '13px', padding: '12px 0' } }, '现在没有谁在找你。'),
        done.length ? h('div', { style: { fontSize: '12px', ...css.muted, margin: '14px 0 6px' } }, '以前问过的') : null,
        done.map(row))
    }


    /**
     * 账：三个人各自的额度，可以改、有保存、有记录。
     * 2026-10-29 从桌面气泡搬进来（老板：「算账的放到后台，小鱼里面界面可以填空那种」）。
     */
function MoneyView() {
      const [data, setData] = React.useState(null)
      const [pool, setPool] = React.useState('60')
      const [period, setPeriod] = React.useState('week')
      const [shares, setShares] = React.useState({})
      const [extras, setExtras] = React.useState({})
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const DAYS = { day: 1, week: 7, month: 30 }
      const load = async () => {
        try {
          const d = await fetch('/api/dayu/budget', { credentials: 'same-origin' }).then((r) => r.json())
          setData(d)
          const sp = {}, ex = {}
          ;(d.rows || []).forEach((r) => { sp[r.role] = String(r.total); ex[r.role] = '0' })
          setShares(sp); setExtras(ex); setPool(String((d.sum?.total || 0).toFixed(2)))
        } catch { setMsg('读不到账本') }
      }
      React.useEffect(() => { load() }, [])
      const days = DAYS[period]
      const roles = (data?.rows || []).map((r) => r.role)
      const shareNum = (r) => Number(shares[r] || 0) || 0
      const extraNum = (r) => Number(extras[r] || 0) || 0
      const totalShare = roles.reduce((a, r) => a + shareNum(r), 0)
      const totalAll = roles.reduce((a, r) => a + shareNum(r) + extraNum(r), 0)
      const poolNum = Number(pool || 0) || 0
      const evenSplit = () => {
        const each = poolNum / Math.max(1, roles.length)
        const next = {}
        roles.forEach((r) => { next[r] = each.toFixed(2) })
        setShares(next)
      }
      const saveAll = async () => {
        setBusy(true); setMsg('')
        try {
          for (const r of roles) {
            const total = shareNum(r) + extraNum(r)
            const out = await fetch('/api/dayu/budget', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ role: r, total, days }),
            }).then((x) => x.json())
            if (!out.ok) throw new Error(out.error || '没存上')
          }
          setMsg(`存好了：一共 ${totalAll.toFixed(2)} 元，按 ${days} 天算，每天约 ${(totalAll / days).toFixed(2)} 元`)
          load()
        } catch (e) { setMsg(String(e?.message || e)) } finally { setBusy(false) }
      }
      if (!data) return h('div', { style: css.muted }, '正在读账本…')
      return h('div', null,
        h('div', { style: css.card },
          h('div', { style: css.h }, '① 一共给多少'),
          h('div', { style: { ...css.muted, fontSize: '12px', marginBottom: '8px' } }, '这是这段时间你们能花的全部钱，下面按人分。'),
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
            h('div', null,
              h('div', { style: css.muted }, '总预算（元）'),
              h('input', { value: pool, onChange: (e) => setPool(e.target.value), style: { width: '110px', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' } })),
            h('div', null,
              h('div', { style: css.muted }, '按什么周期'),
              h('div', { style: { display: 'flex', gap: '6px' } },
                [['day', '按天'], ['week', '按周'], ['month', '按月']].map(([id, label]) =>
                  h('button', { key: id, type: 'button', style: { ...css.tab, ...(period === id ? css.tabActive : {}) }, onClick: () => setPeriod(id) }, label)))),
            h('button', { type: 'button', style: css.btn, onClick: evenSplit }, '平均分'))),
        h('div', { style: css.card },
          h('div', { style: css.h }, '② 谁分多少'),
          h('div', { style: { ...css.muted, fontSize: '12px', marginBottom: '8px' } }, '左边是分给她的，右边是老板额外补的（比如小鱼的 QQ 聊天钱）；右边不从左边扣。'),
          (data.rows || []).map((r) => h('div', {
            key: r.role,
            style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: '1px solid rgba(127,127,127,.12)' },
          },
          h('div', { style: { flex: 1 } },
            h('div', null, r.name || r.role),
            h('div', { style: { ...css.muted, fontSize: '11px' } }, `已用 ${r.used.toFixed(2)}　每天约 ${((shareNum(r.role) + extraNum(r.role)) / days).toFixed(2)}`)),
          h('div', null,
            h('div', { style: { ...css.muted, fontSize: '11px' } }, '分给她'),
            h('input', { value: shares[r.role] ?? '', onChange: (e) => setShares({ ...shares, [r.role]: e.target.value }), style: { width: '80px', padding: '5px 7px', borderRadius: '6px', fontSize: '13px' } })),
          h('div', null,
            h('div', { style: { ...css.muted, fontSize: '11px' } }, '额外补'),
            h('input', { value: extras[r.role] ?? '0', onChange: (e) => setExtras({ ...extras, [r.role]: e.target.value }), style: { width: '70px', padding: '5px 7px', borderRadius: '6px', fontSize: '13px' } }))))),
        h('div', { style: css.card },
          h('div', { style: css.h }, '③ 算出来是这样'),
          h('div', { style: { ...css.muted, fontSize: '12px', marginBottom: '6px' } }, '改上面任何一个空，这里马上跟着变；不满意再改，不用先保存。'),
          h('div', null, `一共给：${poolNum.toFixed(2)} 元`),
          h('div', null, `分出去：${totalShare.toFixed(2)} 元` + (Math.abs(totalShare - poolNum) > 0.01 ? `（和总预算差 ${(totalShare - poolNum).toFixed(2)}）` : '（正好）')),
          h('div', null, `加上补贴：${totalAll.toFixed(2)} 元`),
          h('div', null, `按 ${days} 天：每天约 ${(totalAll / days).toFixed(2)} 元`),
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
            h('button', { type: 'button', style: css.btn, disabled: busy, onClick: saveAll }, busy ? '保存中…' : '保存这套分配'),
            h('button', { type: 'button', style: css.tab, onClick: load }, '还原')),
          msg ? h('div', { style: { ...css.muted, fontSize: '12px', marginTop: '8px' } }, msg) : null))
    }


    // 2026-10-30：页面级错误边界。以前某个 tab 崩了整页就是白的，看不出为什么。
    class ViewBoundary extends React.Component {
      constructor(props) { super(props); this.state = { err: '' } }
      static getDerivedStateFromError(e) { return { err: String((e && e.message) || e) } }
      componentDidCatch(e) { try { console.error('[ysn] view crashed', e) } catch { /* 忽略 */ } }
      render() {
        if (this.state.err) {
          return h('div', { style: { padding: '18px', color: '#f3c0bb', fontSize: '13px', lineHeight: 1.8 } },
            h('b', null, '这个页面出错了'),
            h('div', { style: { marginTop: '6px', opacity: 0.85 } }, this.state.err),
            h('div', { style: { marginTop: '8px', opacity: 0.7 } }, '把这句话告诉老板，他去修。'))
        }
        return this.props.children
      }
    }

    function XiaoyuPage({ initialTab } = {}) {
      const [tab, setTab] = React.useState(initialTab || 'board')
      const pendingAsks = usePendingAsks(30000)
      const [alerts, setAlerts] = React.useState(0)
      const [alertData, setAlertData] = React.useState(null)
      const [alertOpen, setAlertOpen] = React.useState(false)
      const [autoRepair, setAutoRepair] = React.useState(true)
      const [selfApply, setSelfApply] = React.useState(false)
      const [allowDanger, setAllowDanger] = React.useState(false)
      const [swMsg, setSwMsg] = React.useState('')
      const tabs = [['board', '任务总览'], ['asks', '她找你'], ['omni', '全知'], ['chat', '和她们说'], ['onboard', '就职'], ['tasks', '待办'], ['money', '账'], ['token', 'Token回'], ['treasure', '小鱼的宝藏'], ['reports', '报告'], ['archive', '档案'], ['move', '搬家']]
      React.useEffect(() => {
        fetch('/api/xiaoyu/alerts', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => { setAlerts(Number(d.count) || 0); setAlertData(d) })
          .catch(() => {})
        fetch('/api/dayu/switches', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((d) => { if (d?.ok) { setAutoRepair(d.switches.autoRepair !== false); setSelfApply(d.switches.selfApply === true); setAllowDanger(d.switches.allowDanger === true) } })
          .catch(() => {})
      }, [])
      const saveAutoRepair = async (on) => {
        setAutoRepair(on)
        try {
          const r = await fetch('/api/dayu/switches', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ autoRepair: on }),
          })
          const d = await r.json()
          setSwMsg(d.ok ? (on ? '自省发现缺口会自动派单修' : '只报缺口，不自动派单') : '没存上')
        } catch { setSwMsg('没存上') }
      }
      const saveSelfApply = async (on) => {
        setSelfApply(on)
        try {
          const r = await fetch('/api/dayu/switches', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ selfApply: on }),
          })
          const d = await r.json()
          setSwMsg(d.ok ? (on ? '她自己修：开（会真改自己）' : '她自己修：关') : '没存上')
        } catch { setSwMsg('没存上') }
      }
      const saveAllowDanger = async (on) => {
        setAllowDanger(on)
        try {
          const r = await fetch('/api/dayu/switches', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ allowDanger: on }),
          })
          const d = await r.json()
          setSwMsg(d.ok ? (on ? '危险命令：开（仍需每次点头）' : '危险命令：关（默认拒绝）') : '没存上')
        } catch { setSwMsg('没存上') }
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
        h(StatusStrip),
        h('div', { style: { ...css.card, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' } },
            h('input', { type: 'checkbox', checked: autoRepair, onChange: (e) => saveAutoRepair(e.target.checked) }),
            '自省自动维修（默认开）'),
          h('span', { style: { ...css.muted, fontSize: '12px' } }, '缺口 → 自动派单写补丁草案；落地仍要你点'),
          h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginLeft: '10px' } },
            h('input', { type: 'checkbox', checked: selfApply, onChange: (e) => saveSelfApply(e.target.checked) }),
            '她自己修（默认关）'),
          h('span', { style: { ...css.muted, fontSize: '12px' } }, '写完当场落盘：备份 + smoke，不过自动回滚'),
          h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginLeft: '10px' } },
            h('input', { type: 'checkbox', checked: allowDanger, onChange: (e) => saveAllowDanger(e.target.checked) }),
            '危险命令（默认关）'),
          h('span', { style: { ...css.muted, fontSize: '12px' } }, '开了也要每次点头；删/装/改系统才走它'),
          swMsg ? h('span', { style: { ...css.muted, fontSize: '12px' } }, swMsg) : null),
        alerts ? h('div', {
          style: { ...css.card, background: 'rgba(248,113,113,.08)', marginBottom: '8px', cursor: 'pointer' },
          onClick: () => setAlertOpen(!alertOpen),
        },
        `小鱼示警：有 ${alerts} 件事没结，点${alertOpen ? '收起' : '开'}看是哪几件`,
        alertOpen && alertData ? h('div', { style: { marginTop: '8px', fontSize: '12px', lineHeight: 1.9 } },
          (alertData.incidents || []).map((i, n) => h('div', { key: 'i' + n }, `⚠ ${i.title}：${String(i.text || '').slice(0, 60)}（${String(i.at || '').slice(5, 16)}）`)),
          (alertData.jobs || []).map((j, n) => h('div', { key: 'j' + n }, `⏳ 交给 ${j.employee || '新会话'}：${String(j.brief || '').slice(0, 50)}（还没回话）`))) : null) : null,
        pendingAsks ? h('div', {
          style: { ...css.card, background: 'rgba(96,165,250,.10)', marginBottom: '8px', cursor: 'pointer' },
          onClick: () => setTab('asks'),
        }, `她们在找你：${pendingAsks} 条没回，点开看`) : null,
        h('div', { style: { ...css.tabbar, marginBottom: '10px' } },
          tabs.map(([id, label]) => h('button', {
            key: id, style: { ...css.tab, ...(tab === id ? css.tabActive : {}) }, onClick: () => setTab(id),
          }, id === 'asks' && pendingAsks ? `${label} (${pendingAsks})` : label))),
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } },
          tab === 'board' ? h(BoardView)
            : tab === 'asks' ? h(AsksView)
            : tab === 'omni' ? h(ViewBoundary, null, h(OmniView))
              : tab === 'chat' ? h(ChatView)
                : tab === 'onboard' ? h(OnboardView, { onDone: () => setView('board') })
              : tab === 'tasks' ? h(TasksView)
              : tab === 'money' ? h(MoneyView)
            : tab === 'token' ? h(TokenView)
              : tab === 'treasure' ? h(TreasureView)
                : tab === 'reports' ? h(ReportsView)
                  : tab === 'move' ? h(MoveView)
                    : h(ArchiveView)))
    }


    /**
     * 悬浮球：放在界面里，不放在桌面上（2026-10-29 老板要求）。
     *
     * 为什么这样更好：
     *   · 在界面里 = 跟着窗口走，切屏换显示器它都在，不用管置顶
     *   · 直接读接口拿"有几件事"，有事变红点
     *   · 不会像桌面上那个 Tk 窗口那样抢焦点、被浏览器盖住
     */
    function FloatingBall({ onOpen }) {
      const [count, setCount] = React.useState(0)
      const [pos, setPos] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('ysn.ball.pos') || 'null') || { right: 24, bottom: 96 } }
        catch { return { right: 24, bottom: 96 } }
      })
      const [open, setOpen] = React.useState(false)
      const [items, setItems] = React.useState([])

      React.useEffect(() => {
        let live = true
        const load = async () => {
          try {
            const d = await fetch('/api/dayu/incidents', { credentials: 'same-origin' }).then((r) => r.json())
            if (!live) return
            const list = (d.incidents || []).filter((i) => i.status === 'open')
            setItems(list)
            setCount(list.length)
          } catch { /* 拿不到就当没有 */ }
        }
        load()
        const t = setInterval(load, 60000)
        return () => { live = false; clearInterval(t) }
      }, [])

      const drag = React.useRef(null)
      const onDown = (e) => {
        drag.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false }
      }
      const onMove = (e) => {
        if (!drag.current) return
        const dx = e.clientX - drag.current.x
        const dy = e.clientY - drag.current.y
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true
        setPos({ right: Math.max(8, drag.current.right - dx), bottom: Math.max(8, drag.current.bottom - dy) })
      }
      const onUp = () => {
        const moved = drag.current?.moved
        drag.current = null
        try { localStorage.setItem('ysn.ball.pos', JSON.stringify(pos)) } catch {}
        if (!moved) setOpen((v) => !v)
      }

      return h(React.Fragment, null,
        open ? h('div', {
          style: {
            position: 'fixed', right: pos.right + 56, bottom: pos.bottom, width: '300px',
            background: 'var(--ds-bg-elevated, #151b23)', color: 'inherit', borderRadius: '12px',
            border: '1px solid rgba(127,127,127,.25)', boxShadow: '0 8px 28px rgba(0,0,0,.35)',
            padding: '12px', zIndex: 50, fontSize: '13px',
          },
        },
        h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, count ? `有 ${count} 件想让你看一眼` : '现在没什么事'),
        items.slice(0, 3).map((it) => h('div', { key: it.id, style: { marginBottom: '6px' } },
          h('div', null, String(it.text || '').slice(0, 60)),
          h('div', { style: { opacity: 0.6, fontSize: '11px' } }, `出现 ${it.count || 1} 次`))),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
          h('button', { type: 'button', onClick: () => { setOpen(false); onOpen && onOpen() } }, '打开看板'),
          h('button', { type: 'button', onClick: () => setOpen(false) }, '关掉'))) : null,
        h('div', {
          onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp,
          title: count ? `${count} 件要你看一眼` : '没什么事',
          style: {
            position: 'fixed', right: pos.right, bottom: pos.bottom, width: '44px', height: '44px',
            borderRadius: '50%', background: 'var(--ds-bg-elevated, #151b23)',
            border: '1px solid rgba(127,127,127,.3)', boxShadow: '0 4px 14px rgba(0,0,0,.35)',
            cursor: 'pointer', zIndex: 51, display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none', fontSize: '18px',
          },
        }, '🐟',
        count ? h('span', {
          style: {
            position: 'absolute', top: '-3px', right: '-3px', minWidth: '16px', height: '16px',
            borderRadius: '8px', background: '#e0564a', color: '#fff', fontSize: '10px',
            lineHeight: '16px', textAlign: 'center', padding: '0 4px',
          },
        }, String(count)) : null))
    }

    function Root({ hostKit, sessions }) {
      const [view, setView] = React.useState('home')
      const [menu, setMenu] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const [health, setHealth] = React.useState(null)
      const [roster, setRoster] = React.useState(null)
      const [days, setDays] = React.useState(null)
      const [nest, setNest] = React.useState(null)
      const [nestError, setNestError] = React.useState('')
      const [reloadTick, setReloadTick] = React.useState(0)
      const [dialog, setDialog] = React.useState(null)
      const [error, setError] = React.useState('')
      const [onboarded, setOnboarded] = React.useState(null)
      const [roleScan, setRoleScan] = React.useState(null)
      const [createPicker, setCreatePicker] = React.useState(false)
      // 2026-10-30：新手引导放进插件里（装的人不一定看安装包里的文档）
      const [help, setHelp] = React.useState(false)
      // 装前认人：本机已经有哪些角色（只读）
      React.useEffect(() => {
        let alive = true
        fetch('/api/yushen/roles/detect', { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (alive) setRoleScan(d) })
          .catch(() => {})
        return () => { alive = false }
      }, [])
      const [live, setLive] = React.useState(null)
      // 桌宠气泡的实时状态：1.5 秒一次，很小的一包；拿不到就按“没事”处理
      React.useEffect(() => {
        let alive = true
        const tick = async () => {
          const d = await fetch('/api/yushen/live', { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
          if (alive && d?.ok) setLive(d)
        }
        tick()
        const timer = setInterval(tick, 1500)
        return () => { alive = false; clearInterval(timer) }
      }, [])
      const [notice, setNotice] = React.useState(() => {
        try {
          return localStorage.getItem(NOTICE_KEY) !== '1'
            && sessionStorage.getItem(NOTICE_KEY + '.session') !== '1'
        } catch { return true }
      })

      React.useEffect(() => {
        if (!menu) return undefined
        const onKey = (e) => { if (e.key === 'Escape') setMenu(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [menu])

      React.useEffect(() => {
        let live = true
        const load = async () => {
          const st = await fetch('/api/yushen/status', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null)
          const hl = await getJson('/health').catch(() => null)
          const rs = await getJson('/roster').catch(() => null)
          const xy = await fetch('/api/xiaoyu/health', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null)
          const nestFail = []
          const ns = await fetch(NEST_API, { credentials: 'same-origin' })
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
              return r.json()
            })
            .catch((e) => { nestFail.push(String(e?.message || e)); return null })
          const ob = await fetch('/api/yushen/onboard', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null)
          if (!live) return
          setStatus(st)
          setHealth(hl)
          setRoster(rs)
          setDays(xy)
          if (ns?.ok) { setNest(ns); setNestError('') }
          else if (nestFail.length) setNestError(nestFail[0] === 'HTTP 401' ? '没有权限（登录可能过期了）' : nestFail[0])
          if (ob?.ok) setOnboarded(Boolean(ob.onboarded))
          setError(hl ? '' : '大鱼的接口没应答（可能被总开关关了，或还没重启）')
        }
        load()
        const timer = setInterval(load, 15000)
        return () => { live = false; clearInterval(timer) }
      }, [reloadTick])

      const master = status?.switches?.master !== false
      const off = h('div', { style: css.card }, h('div', { style: css.h }, '全体休假中'), h('div', { style: css.muted }, '去「调试」页叫她们回来，重启 DSH 后生效。'))

      // 2026-10-29：还没立约就在顶上提示一句。陌生人装完看到的是运维台，不知道该去哪。
      const onboardHint = onboarded === false
        ? h('div', {
            style: {
              ...css.card, display: 'flex', alignItems: 'center', gap: '12px',
              borderLeft: '3px solid #f0c062', background: 'rgba(240,192,98,0.08)',
            },
          },
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontWeight: 600, marginBottom: '2px' } }, '还没立约'),
            h('div', { style: css.muted }, '先告诉它怎么叫你——两分钟，点下面的按钮。')),
          h('button', {
            type: 'button',
            style: { ...(css.btn || {}), cursor: 'pointer' },
            onClick: () => { setView('onboard'); setMenu(false) },
          }, '去立约'))
        : null

      const openAdopt = (role, file) => {
        setMenu(false)
        setDialog({ mode: 'adopt', role: role || null, file: file || null, key: Date.now() })
      }
      const doAdoptSrc = async (role, src, name) => {
        try {
          let payload = src
          if (/^https?:/i.test(src)) {
            try {
              const res = await fetch(src, { credentials: 'include' })
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const blob = await res.blob()
              if (!IMG_TYPES.includes(blob.type)) throw new Error('不是图片')
              payload = await readAsDataUrl(blob)
            } catch {
              payload = src // 取不到就交给主机再试一次
            }
          }
          setNest(await nestPost('/adopt-url', { role: role || '', name: name || '收编的桌宠', src: payload }))
        } catch (e) {
          window.alert(String(e?.message || e))
        }
      }
      const doGuestRemove = async (id) => {
        try { setNest(await nestPost('/guest/remove', { id })) } catch { /* 送不走就留着 */ }
      }
      const openRename = (role) => {
        setMenu(false)
        setDialog({ mode: 'rename', role, key: Date.now() })
      }
      const doRestore = async (role) => {
        const label = nest?.slots?.[role]?.name || ''
        if (!window.confirm(`把「${label}」送走、换回自带形象？`)) return
        try {
          setNest(await nestPost('/restore', { role }))
        } catch (e) {
          window.alert(String(e?.message || e))
        }
      }
      const dialogEl = dialog
        ? h(AdoptDialog, {
          key: dialog.key,
          mode: dialog.mode,
          role: dialog.role,
          file: dialog.file,
          nest,
          onClose: () => setDialog(null),
          onDone: (next) => { setNest(next); setDialog(null) },
        })
        : null

      const scanRoles = async () => {
        const d = await fetch('/api/yushen/roles/detect', { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        if (d) setRoleScan(d)
        return d
      }
      const startNewRole = async () => {
        const d = await scanRoles()
        if (d && d.count > 0) {
          const names = d.roles.map((r) => r.name).slice(0, 6).join('、')
          const go = window.confirm(`本机已经有 ${d.count} 个角色：${names}。\n\n要先去接入吗？\n点「确定」看扫描结果；点「取消」继续新建一个。`)
          if (go) {
            window.alert(d.roles.map((r) => `· ${r.name}（${r.source}）`).join('\n'))
            return
          }
        }
        openAdopt('dayu', null)
      }

      const [welcome, setWelcome] = React.useState(() => { try { return localStorage.getItem('ysn.welcome.v1') !== '1' } catch { return true } })
      const closeWelcome = () => { try { localStorage.setItem('ysn.welcome.v1', '1') } catch { /* 存不了就每次弹 */ } setWelcome(false) }

      const pickerEl = createPicker
        ? h('div', { className: 'ysn-fr-mask', onClick: (e) => { if (e.target === e.currentTarget) setCreatePicker(false) } },
          h('div', { className: 'ysn-fr-modal', role: 'dialog', 'aria-modal': 'true' },
            h('div', { className: 'ysn-fr-title' }, '新建一个角色'),
            h('div', { className: 'ysn-fr-sub' }, '先扫一下本机有没有现成的；没有，就直接开始。'),
            h('div', { className: 'ysn-fr-cards' },
              h('button', {
                type: 'button', className: 'ysn-fr-card',
                onClick: () => scanRoles().then((d) => {
                  if (!d) return
                  window.alert(d.count
                    ? `认到 ${d.count} 个：\n` + d.roles.map((r) => `· ${r.name}（${r.source}）`).join('\n')
                    : '本机还没认到角色，可以直接新建。')
                }),
              },
              h('b', null, '扫描本地角色卡'),
              h('span', null, '看看这台机器上已经有哪些')),
              h('button', {
                type: 'button', className: 'ysn-fr-card',
                onClick: () => { setCreatePicker(false); openAdopt('dayu', null) },
              },
              h('b', null, '直接新建'),
              h('span', null, '不扫了，从现在开始'))),
            h('button', { type: 'button', className: 'ysn-fr-cancel', onClick: () => setCreatePicker(false) }, '取消')))
        : null

      const welcomeEl = welcome
        ? h('div', { className: 'ysn-fr-mask', onClick: (e) => { if (e.target === e.currentTarget) closeWelcome() } },
          h('div', { className: 'ysn-fr-modal ysn-welcome', role: 'dialog', 'aria-modal': 'true' },
            h('div', { className: 'ysn-fr-kicker' }, 'DSH 插件'),
            h('div', { className: 'ysn-fr-title', style: { fontSize: '30px', letterSpacing: '2px' } }, '鱼神'),
            h('div', { className: 'ysn-fr-sub', style: { marginTop: '2px' } }, '你好，欢迎使用鱼神插件。'),
            h('div', { className: 'ysn-w-list', style: { margin: '12px 0 6px' } },
              h('div', null, h('b', null, '一台电脑里，可以住一个角色，也可以住几个。'), '各自有独立的形象、角色卡和记忆，互不干扰。')),
            h('div', { className: 'ysn-w-steps', style: { margin: '10px 0 6px' } }, '核心就两件事'),
            h('div', { className: 'ysn-w-list' },
              h('div', null, h('b', null, '一、角色自主。'), '角色卡是心脏，模型是大脑；本插件给她的是一具「躯体」——让她凭自己的意志做事。'),
              h('div', null, h('b', null, '二、管理这个软件。'), '工具与手册按需发放，做过的事能审计、能验收，也能对接别的插件。')),
            h('div', { className: 'ysn-w-steps', style: { margin: '12px 0 6px' } }, '我们给她的'),
            h('div', { className: 'ysn-w-list', style: { fontSize: '12.5px' } },
              h('div', null, '· 时间自主：自己排议程、自己定什么时候做'),
              h('div', null, '· 起步引导：新角色带着一张「你在哪儿、先做什么」的卡'),
              h('div', null, '· 手册与工具：按岗位和任务发，不整本塞'),
              h('div', null, '· 审计与验收：做过什么、花了多少，都留痕'),
              h('div', null, '· 对接插件：别的插件能做的事，她也能用'),
              h('div', null, '· 桌宠：角色可以变成桌宠待在桌面上——点一下看余额，说句话就能对话')),
            h('div', { className: 'ysn-w-steps', style: { margin: '12px 0 6px' } }, '怎么开始'),
            h('div', { className: 'ysn-w-steps', style: { textAlign: 'left', lineHeight: 1.9 } },
              h('div', null, '① 点「＋ 新建角色卡」'),
              h('div', null, '② 挑一张自带形象，或导入你的图片，起个名字'),
              h('div', null, '③ 回主界面点她一下，说第一句话')),
            h('div', { className: 'ysn-w-license' },
              h('div', null, '本软件由 从零开始 独立制作。'),
              h('div', null, h('span', { className: 'ysn-ok' }, '可以'), '：自己用、自己改、接着扩展。'),
              h('div', null, h('span', { className: 'ysn-no' }, '请不要'), '：二次分发、拿去商用。')),
            h('button', { type: 'button', className: 'ysn-fr-cancel ysn-w-start', onClick: closeWelcome }, '开始使用')))
        : null

      // 2026-10-30：内置新手引导（一页，不写长手册）。
      // 老板的意思：能改的产品，出问题让用户带着 DSH 自己修；这里只讲"先做什么"和"卡住了怎么办"。
      const helpEl = help
        ? h('div', { className: 'ysn-fr-mask', onClick: (e) => { if (e.target === e.currentTarget) setHelp(false) } },
          h('div', { className: 'ysn-fr-modal ysn-welcome', role: 'dialog', 'aria-modal': 'true' },
            h('div', { className: 'ysn-fr-title' }, '怎么用'),
            h('div', { className: 'ysn-w-steps', style: { textAlign: 'left', lineHeight: 1.9, margin: '10px 0' } },
              h('div', null, '① 点「＋ 新建角色卡」'),
              h('div', null, '② 挑一张自带形象，起个名字'),
              h('div', null, '③ 回主界面点她一下，说第一句话')),
            h('div', { className: 'ysn-w-list', style: { fontSize: '12.5px' } },
              h('div', null, h('b', null, '点了没反应：'), '界面改过要重启一次 DSH。'),
              h('div', null, h('b', null, '桌宠不见了：'), '你在鱼窝页，那边她隐身；回主聊天页就出来。'),
              h('div', null, h('b', null, '其它问题：'), '把报错原文发给 DSH——它能读代码、能自己改。')),
            h('button', { type: 'button', className: 'ysn-fr-cancel ysn-w-start', onClick: () => setHelp(false) }, '知道了')))
        : null

      if (view === 'home' && roleScan && roleScan.ok && roleScan.count === 0) {
        return h('div', { className: 'ysn-root' },
          h('div', { className: 'ysn-firstrun' },
            // 2026-10-30：新装的人可能一张图都没有。先给一个自带的看板娘占位，别让这页空着。
            h('img', {
              src: '/yushen-assets/avatar?who=xiaoyu',
              alt: '看板娘',
              className: 'ysn-fr-mascot',
              onError: (e) => { try { e.currentTarget.style.display = 'none' } catch { /* 忽略 */ } },
            }),
            h('div', { className: 'ysn-fr-title' }, '先有一个角色'),
            h('div', { className: 'ysn-fr-sub' }, '起个名字、放张图，她就能住进来。'),
            h('div', { className: 'ysn-fr-cards' },
              h('button', { type: 'button', className: 'ysn-fr-card', onClick: () => setCreatePicker(true) },
                h('b', null, '＋ 新建角色卡'),
                h('span', null, '本机已经有角色的，也可以先扫描再接入'))),
            h('div', { className: 'ysn-fr-note' }, '不会覆盖已有的卡。')),
          pickerEl,
          welcomeEl)
      }

      if (view === 'home') {
        return h(React.Fragment, null,
          h('div', { className: 'ysn-root' },
            onboardHint,
            h(FloatingBall, { onOpen: () => { setView('xiaoyu'); setMenu(false) } }),
            h(Nest, {
              nest,
              error: nestError,
              onRetry: () => setReloadTick((v) => v + 1),
              onPick: (next) => { setView(next); setMenu(false) },
              onAdopt: openAdopt,
              onAdoptSrc: doAdoptSrc,
              onGuestRemove: doGuestRemove,
              onRename: openRename,
              onRestore: doRestore,
              gearOpen: menu,
              onGear: () => setMenu(!menu),
              live,
            }),
            menu
              ? h(React.Fragment, null,
                h('div', { className: 'ysn-backdrop', onClick: () => setMenu(false) }),
                h('div', { className: 'ysn-gear', role: 'menu', 'aria-label': '鱼窝设置' },
                  [['group', '框架群聊'], ['look', '形象'], ['jobs', '单子'], ['base', '家底'], ['switch', '调试']].map(([id, label]) =>
                    h('button', {
                      key: id, type: 'button', role: 'menuitem',
                      onClick: () => { setView(id); setMenu(false) },
                    }, label))))
              : null),
          h('button', { type: 'button', className: 'ysn-add-role', title: '添加角色', onClick: () => setCreatePicker(true) }, '＋ 添加角色'),
          h('button', { type: 'button', className: 'ysn-help-btn', title: '怎么用', onClick: () => setHelp(true) }, '？'),
          notice ? h(Notice, { onClose: () => setNotice(false) }) : null,
          dialogEl,
          pickerEl,
          welcomeEl,
          helpEl)
      }

      const title = view === 'group' ? '框架群聊' : NEST_LABELS[view] || (view === 'base' ? '家底' : view === 'look' ? '形象' : view === 'jobs' ? '单子' : view === 'activity' ? '做过什么' : '调试')
      const body = view === 'group' ? h(GroupChat) : view === 'dayu'
        ? (!master ? off : status?.switches?.dayu === false
          ? h('div', { style: css.card }, h('div', { style: css.h }, '大鱼休假中'), h('div', { style: css.muted }, '去「调试」页叫她回来。'))
          : h(DayuChat))
        : view === 'xiaoyu' ? h(XiaoyuPage, { initialTab: onboarded === false ? 'onboard' : 'board' })
           : view === 'dragon' ? h(DragonPage, { nest, onAdopt: openAdopt, onRename: openRename, onRestore: doRestore })
          : view === 'base' ? h(BasePage, { health, roster, days, error, status })
            : view === 'look' ? h(LookPage, { nest, onAdopt: openAdopt, onRename: openRename, onRestore: doRestore })
              : view === 'activity' ? h(ActivityPage)
              : view === 'jobs' ? h(JobsPage)
                : h(SwitchPage, { status, setStatus })

      const pair = nest ? h('div', { style: css.pair },
        NEST_ROLES.map((role) => {
          const slot = nest.slots?.[role]
          return h('img', {
            key: role,
            src: slot?.url || `/yushen-assets/avatar?who=${role}`,
            alt: slot?.label || NEST_LABELS[role],
            title: slot?.name || NEST_LABELS[role],
            style: { ...css.pairImg, ...(view === role ? css.pairImgOn : null) },
            onClick: () => { setView(role); setMenu(false) },
          })
        })) : null

      return h(React.Fragment, null,
        h('div', { className: 'ysn-subpage', style: css.subPage },
          h('div', { style: css.subHead },
            h('button', { style: css.backBtn, onClick: () => setView('home') }, '←'),
            h('button', { style: { ...css.smallBtn, marginLeft: 'auto' }, onClick: () => setView('activity') }, '做过什么'),
            h('button', { style: css.smallBtn, onClick: () => setView('group') }, '群聊'),
            pair,
            h('span', { style: css.subTitle }, title),
            orgOf(view).post
              ? h('span', { style: { ...css.muted, fontSize: '12px' } }, `${orgOf(view).post} · ${orgOf(view).rank}`)
              : null),
          h(PendingBar), body),
        notice ? h(Notice, { onClose: () => setNotice(false) }) : null,
        dialogEl)
    }

    function Glyph() {
      // 她在找你的时候，侧边栏挂个气泡——不用点进来也知道。
      const pending = usePendingAsks(30000)
      return h('span', {
        style: { position: 'relative', display: 'inline-flex' },
        title: pending ? `她们在找你：${pending} 条` : '鱼神双子星',
      },
      h('span', {
        style: {
          width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff',
          background: 'linear-gradient(140deg,#60a5fa,#2563eb)',
        },
      }, '鲲'),
      pending ? h('span', {
        style: {
          position: 'absolute', top: '-5px', right: '-6px', minWidth: '15px', height: '15px',
          padding: '0 4px', borderRadius: '999px', background: '#ef4444', color: '#fff',
          fontSize: '9px', lineHeight: '15px', textAlign: 'center', fontWeight: 700,
          boxShadow: '0 0 0 2px rgba(20,20,20,.85)',
        },
      }, pending > 9 ? '9+' : String(pending)) : null)
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-yushen-twins')
        style.textContent = '[data-ys-composer] textarea::placeholder{color:rgba(255,255,255,.32)}[data-ys-composer] select{appearance:none;background:transparent;border:0;color:inherit;cursor:pointer}[data-ys-composer] select option{color:#111;background:#fff}' + NEST_STYLE
        document.head.appendChild(style)
        if (typeof ctx.effect === 'function') ctx.effect(() => () => style.remove(), 'yushen: composer styles')

        const slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : undefined)
        if (!slots || typeof slots.inject !== 'function') return
        const wrap = (name, factory) => {
          const run = () => slots.inject(name, factory)
          if (typeof ctx.effect === 'function') ctx.effect(run)
          else run()
        }
        wrap('sidebar.panellist', () => slots.register(
          { name: 'sidebar.panellist', id: 'dsh-yushen-twins', order: 21, label: '鱼神双子星' },
          Glyph,
        ))
        wrap('main', () => slots.register(
          {
            name: 'main', key: 'dsh-yushen-twins', id: 'dsh-yushen-twins', label: '鱼神双子星',
            children: { 'yushen.dayu.session': { kind: 'single', scope: 'session' } },
          },
          (props) => h(Root, {
            hostKit: props?.hostKit,
            sessions: ctx.sessions || (typeof ctx.get === 'function' ? ctx.get('sessions') : undefined),
          }),
        ))
      },
    }
  },
})

// 右上角固定「重启 DSH」：插件碰不到原生标题栏，只能画在内容区右上角。
// 只在这台机器上出现；点了先确认，再走 /api/yushen/restart。
if (typeof document !== 'undefined') {
  const mount = () => {
    if (document.getElementById('yushen-restart-fab')) return
    const btn = document.createElement('button')
    btn.id = 'yushen-restart-fab'
    btn.textContent = '重启 DSH'
    btn.title = '重启 DSH（重载插件；页面会断开几秒）'
    Object.assign(btn.style, {
      position: 'fixed', top: '6px', right: '150px', zIndex: '1050',
      padding: '3px 10px', fontSize: '12px', borderRadius: '8px',
      border: '1px solid rgba(127,127,127,.35)', background: 'rgba(30,30,30,.65)',
      color: '#ddd', cursor: 'pointer',
    })
    btn.onmouseenter = () => { btn.style.background = 'rgba(60,60,60,.9)' }
    btn.onmouseleave = () => { btn.style.background = 'rgba(30,30,30,.65)' }
    btn.onclick = async () => {
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1'
        btn.textContent = '再点一次确认'
        fetch('/api/yushen/action', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'restart-click-fab' }),
        }).catch(() => {})
        setTimeout(() => { delete btn.dataset.armed; btn.textContent = '重启 DSH' }, 5000)
        return
      }
      delete btn.dataset.armed
      btn.textContent = '重启中…'
      btn.disabled = true
      try {
        await fetch('/api/yushen/restart', { method: 'POST', credentials: 'same-origin' })
      } catch { /* 会断开 */ }
      btn.textContent = '等它断开…'
    }
    document.body.appendChild(btn)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 1200))
  else setTimeout(mount, 1200)
}

// 开机就出来的桌面小桌宠：不只站在鱼窝里，主界面右下角也有一个（像小鲸鱼那样跟着软件一起出来）。
// 能拖、能点（点一下冒泡）、有声音，跑任务/花钱会自己冒一句；进了鱼窝就自动隐身，免得两个她打架。
if (typeof document !== 'undefined') {
  const FP_KEY = 'yushen.floatPet'
  const FP_POS = 'yushen.floatPet.pos'
  const FP_ROLE = 'yushen.floatPet.role'
  const fpRoles = ['dayu', 'xiaoyu', 'dragon']
  const fpName = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
  // 2026-10-30：早先那版“先收起来”会把开关写死成 0，结果再也回不来。
  // 现在桌宠默认永远在；想藏就藏这一页（刷新即回），不再读那个旧开关。
  const fpOn = () => true
  const fpPick = () => {
    try {
      const saved = localStorage.getItem(FP_ROLE)
      if (fpRoles.includes(saved)) return saved
    } catch { /* 读不到就随机 */ }
    return fpRoles[Math.floor(Math.random() * fpRoles.length)]
  }

  const fpTone = ({ f0, f1, dur = 0.08, gain = 0.16 }) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!window.__ysnFloatAudio) window.__ysnFloatAudio = new AC()
      const c = window.__ysnFloatAudio
      if (c.state === 'suspended') c.resume().catch(() => {})
      const t0 = c.currentTime
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      g.connect(c.destination)
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f0, t0)
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
      o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02)
    } catch { /* 没声音不影响用 */ }
  }

  const mountFloatPet = () => {
    if (!fpOn() || document.getElementById('yushen-float-pet')) return
    const box = document.createElement('div')
    box.id = 'yushen-float-pet'
    const geo = (() => { try { return JSON.parse(localStorage.getItem(FP_POS) || '{}') || {} } catch { return {} } })()
    Object.assign(box.style, {
      position: 'fixed', zIndex: '2147481800',
      left: geo.left != null ? geo.left + 'px' : (window.innerWidth - 150) + 'px',
      top: geo.top != null ? geo.top + 'px' : (window.innerHeight - 230) + 'px',
      width: '128px', height: '160px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      cursor: 'pointer', userSelect: 'none', touchAction: 'none',
      transition: 'filter .2s ease',
    })

    const img = document.createElement('img')
    img.alt = '她'
    img.draggable = false
    Object.assign(img.style, {
      width: '120px', height: 'auto', maxHeight: '158px', objectFit: 'contain',
      pointerEvents: 'none', filter: 'drop-shadow(0 12px 16px rgba(0,0,0,.5))',
      transition: 'transform .18s cubic-bezier(.22,1.4,.4,1)',
      transformOrigin: '50% 100%',
    })

    const bubble = document.createElement('div')
    Object.assign(bubble.style, {
      position: 'absolute', left: '50%', bottom: 'calc(100% - 16px)',
      // 绝对定位在 128px 的盒子里，宽度 auto 会被压成一条窄柱；
      // 这里给死宽度（再按屏幕收），字和行距不动。
      transform: 'translateX(-50%)', width: 'max-content', maxWidth: 'min(340px, calc(100vw - 24px))', minWidth: '0',
      padding: '10px 15px', boxSizing: 'border-box', display: 'none',
      background: 'rgba(255,255,255,.97)', color: '#15578f',
      border: '1px solid rgba(40,100,160,.4)', borderRadius: '22px',
      fontSize: '12.5px', lineHeight: '1.55', textAlign: 'center', whiteSpace: 'pre-line',
      boxShadow: '0 14px 30px rgba(0,0,0,.45)', pointerEvents: 'auto',
    })

    img.addEventListener('error', () => { img.style.display = 'none' })
    box.append(bubble, img)
    document.body.appendChild(box)

    let hideTimer = 0
    // 老板怎么称呼：契约里写的名字（叫「阿林」就显示阿林），读不到就「老板」
    let ownerName = '老板'
    fetch('/api/yushen/onboard', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.callName === 'string' && d.callName.trim()) ownerName = d.callName.trim().slice(0, 12) })
      .catch(() => {})
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    // 形状：日常说话是圆角卡；看账用椭圆（跟小鲸鱼那样，看着舒服）
    const setShape = (mode) => {
      if (mode === 'oval') {
        bubble.style.borderRadius = '50% / 45%'
        bubble.style.padding = '16px 22px'
        bubble.style.maxWidth = '250px'
        bubble.style.minWidth = '190px'
      } else {
        bubble.style.borderRadius = '22px'
        bubble.style.padding = '10px 15px'
        bubble.style.maxWidth = 'min(340px, calc(100vw - 24px))'
        bubble.style.minWidth = '0'
      }
    }

    const say = (text, ms, prefix) => {
      if (!text) return
      // 名字单独上色（橙），跟正文区分开
      const head = prefix ? `<span style="color:#c2410c;font-weight:600">${esc(prefix)}</span>，` : ''
      setShape('card')
      bubble.innerHTML = head + esc(text).replace(/\n/g, '<br>')
      bubble.style.display = 'block'
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => { bubble.style.display = 'none'; hideTimer = 0 }, ms || 5500)
    }
    // 已经拼好颜色的一段 HTML（状态泡用，别再过 esc，否则标签会被当文字）
    const sayHtml = (html, ms) => {
      if (!html) return
      setShape('oval')
      bubble.innerHTML = html
      bubble.style.display = 'block'
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => { bubble.style.display = 'none'; hideTimer = 0 }, ms || 5500)
    }

    let role = fpPick()

    // 头像：优先用鱼窝里这只现在那张，读不到就用默认
    const loadAvatar = () => {
      fetch('/api/yushen/nest', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const url = d?.slots?.[role]?.url
          if (url && img.getAttribute('src') !== url) img.src = url
        })
        .catch(() => {})
    }
    const applyRole = () => {
      img.style.display = ''
      img.src = `/yushen-assets/avatar?who=${encodeURIComponent(role)}`
      img.alt = fpName[role] || '她'
      loadAvatar()
    }
    applyRole()

    // 滚轮缩放：主界面这只也能放大缩小（跟鱼窝里那套的手感一致）
    let fpScale = Number(localStorage.getItem('yushen.floatPet.scale')) || 1
    if (!(fpScale >= 0.6 && fpScale <= 2)) fpScale = 1
    const applyScale = () => {
      img.style.width = Math.round(120 * fpScale) + 'px'
      img.style.maxHeight = Math.round(158 * fpScale) + 'px'
      box.style.width = Math.round(128 * fpScale) + 'px'
      box.style.height = Math.round(160 * fpScale) + 'px'
      // 气泡跟着她一起变：放大她的时候，字也放大；宽度按内容走（短句不再拉成长条）
      const s = Math.max(0.8, Math.min(1.5, fpScale))
      bubble.style.fontSize = (14 * s).toFixed(1) + 'px'
    }
    applyScale()
    box.addEventListener('wheel', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const next = Math.min(2, Math.max(0.6, fpScale + (e.deltaY > 0 ? -0.08 : 0.08)))
      if (Math.abs(next - fpScale) < 1e-6) return
      fpScale = Math.round(next * 100) / 100
      applyScale()
      try { localStorage.setItem('yushen.floatPet.scale', String(fpScale)) } catch { /* 存不了就只影响这次 */ }
    }, { passive: false })

    // 点一下：冒泡 / 收起来；按下松开有声音，角色轻轻压一下
    let dragging = false
    let dragStart = null
    let moved = false
    let pressT = 0

    const down = (e) => {
      if (e.button !== 0) return
      moved = false
      pressT = Date.now()
      dragging = true
      dragStart = { x: e.clientX, y: e.clientY, left: box.offsetLeft, top: box.offsetTop }
      img.style.transform = 'translateY(2px) scale(1.03,.97)'
      fpTone({ f0: 330, f1: 170, gain: 0.14 })
      box.setPointerCapture?.(e.pointerId)
    }
    const move = (e) => {
      if (!dragging || !dragStart) return
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true
      box.style.left = Math.max(4, Math.min(window.innerWidth - box.offsetWidth - 6, dragStart.left + dx)) + 'px'
      box.style.top = Math.max(4, Math.min(window.innerHeight - box.offsetHeight - 6, dragStart.top + dy)) + 'px'
    }
    const up = () => {
      if (!dragging) return
      dragging = false
      img.style.transform = ''
      fpTone({ f0: 210, f1: 300, gain: 0.11 })
      if (moved) {
        try { localStorage.setItem(FP_POS, JSON.stringify({ left: box.offsetLeft, top: box.offsetTop })) } catch { /* 存不了就只影响这次 */ }
        return
      }
      if (Date.now() - pressT < 700 && bubble.style.display === 'block') {
        bubble.style.display = 'none'
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0 }
      } else {
        showStatus()
      }
    }

    // 点一下看账：余额 / 今天花了多少 / 现在峰时还是谷时，还剩多久
    // 颜色照小鲸鱼那套：峰时标红（贵、要留意），谷时转绿（便宜、放松）
    const peakInfo = () => {
      const d = new Date()
      const day = d.getDay()
      const mins = d.getHours() * 60 + d.getMinutes()
      const windows = (day === 0 || day === 6) ? [] : [[540, 720], [840, 1080]]
      const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`)
      const inWin = windows.find(([a, b]) => mins >= a && mins < b)
      if (inWin) return { peak: true, rest: `还有 ${fmt(inWin[1] - mins)}` }
      const next = windows.find(([a]) => mins < a)
      if (!next) return { peak: false, rest: (day === 0 || day === 6) ? '周末 · 全天谷时' : '今天没有峰时了' }
      return { peak: false, rest: `${fmt(next[0] - mins)}后到峰时` }
    }
    let statusBusy = false
    const showStatus = async () => {
      if (statusBusy) return
      statusBusy = true
      try {
        const [ov, wh] = await Promise.all([
          fetch('/api/dayu/overview', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/dsh-whale/balance.json', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ])
        const cost = Number(ov?.account?.cost || 0)
        const bal = Number(wh?.totalBalance ?? wh?.balance ?? NaN)
        const parts = []
        // 2026-10-30：照鲸鱼那个层级重排——标签小、金额大；峰时那行最小。
        if (Number.isFinite(bal)) {
          parts.push(`<div style="line-height:1.1"><span style="font-size:11px;color:#4a7ba6;letter-spacing:.08em">余额</span><div style="font-size:31px;font-weight:800;color:#0f3d63;letter-spacing:-.5px">¥${bal.toFixed(2)}</div></div>`)
        }
        if (cost > 0) parts.push(`<div style="margin-top:4px;font-size:15px;color:#b45309;font-weight:600">今天花了 ¥${cost.toFixed(2)}</div>`)
        if (!parts.length) parts.push('<div style="color:#64748b;font-size:13px">账还没读到</div>')
        const pi = peakInfo()
        const tone = pi.peak ? '#d9483f' : '#2f9e6b'
        const badge = `<span style="display:inline-block;padding:0 5px;border-radius:4px;background:${tone};color:#fff;font-size:10px;font-weight:700;margin-right:5px">${pi.peak ? '峰' : '谷'}</span>`
        parts.push(`<div style="margin-top:5px;font-size:12.5px;color:#2a6ea3">${badge}${pi.rest}</div>`)
        sayHtml(parts.join(''), 7500)
      } finally {
        statusBusy = false
      }
    }

    // 2026-10-30：现在正在跑什么——直接冒在气泡里。
    // 老板的原话：重启时提示"有后台任务"，但不知道是什么；气泡说出来就不用猜。
    let liveLine = ''
    const liveLabel = (s) => {
      const t = String(s?.title || '').trim()
      if (t && !/^session-?$/.test(t)) return t
      if (s?.source && s.source !== '本机会话') return s.source
      return '本机'
    }
    const liveWhat = (s) => {
      const r = String(s?.reason || s?.lastType || '').trim()
      return r ? r.slice(0, 18) : '在忙'
    }
    const pollLiveNow = async () => {
      try {
        const d = await fetch('/api/dayu/live', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        const rows = (Array.isArray(d?.sessions) ? d.sessions : [])
          .filter((s) => s && s.lastAt && Date.now() - Date.parse(s.lastAt) < 3 * 60 * 1000)
        const next = rows.length === 0
          ? ''
          : rows.length === 1
            ? `${liveLabel(rows[0])}：${liveWhat(rows[0])}`
            : `${rows.length} 条在跑 · ${liveLabel(rows[0])}：${liveWhat(rows[0])}`
        if (next === liveLine) return
        const had = Boolean(liveLine)
        liveLine = next
        if (!next) { if (had && bubble.style.display !== 'block') say('都忙完了。', 3500); return }
        if (bubble.style.display === 'block') return // 正在跟她说话，不抢
        say(next, 6000)
      } catch { /* 拉不到就算了 */ }
    }
    setTimeout(() => { void pollLiveNow() }, 8000)
    setInterval(() => { void pollLiveNow() }, 15000)
    box.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    bubble.addEventListener('click', (e) => {
      e.stopPropagation()
      bubble.style.display = 'none'
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0 }
    })

    // 右键：弹一个小菜单，三个角色随便点
    const picker = document.createElement('div')
    Object.assign(picker.style, {
      position: 'fixed', display: 'none', zIndex: '2147481801', padding: '4px',
      flexDirection: 'column', gap: '2px', minWidth: '96px',
      borderRadius: '10px', background: 'rgba(16,26,40,.97)',
      border: '1px solid rgba(255,255,255,.2)', boxShadow: '0 12px 30px rgba(0,0,0,.5)',
    })
    const chooseRole = (next) => {
      if (!fpRoles.includes(next)) return
      role = next
      try { localStorage.setItem(FP_ROLE, role) } catch { /* 存不了就只影响这次 */ }
      applyRole()
      say(`${fpName[role] || '她'}来了。右键还能换。`, 4200)
    }
    for (const r of fpRoles) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = fpName[r] || r
      Object.assign(b.style, {
        border: 0, background: 'transparent', color: '#eef5ff', textAlign: 'left',
        padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
      })
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(96,165,250,.24)' })
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent' })
      b.addEventListener('click', (e) => { e.stopPropagation(); picker.style.display = 'none'; chooseRole(r) })
      picker.appendChild(b)
    }
    document.body.appendChild(picker)
    // 右键菜单：换人之外，常用的几样也放进来（别只留换人）
    const div = document.createElement('div')
    Object.assign(div.style, { height: '1px', margin: '3px 6px', background: 'rgba(255,255,255,.14)' })
    picker.appendChild(div)
    const item = (label, fn) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      Object.assign(b.style, {
        border: 0, background: 'transparent', color: '#eef5ff', textAlign: 'left',
        padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
      })
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(96,165,250,.24)' })
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent' })
      b.addEventListener('click', (e) => { e.stopPropagation(); picker.style.display = 'none'; fn() })
      picker.appendChild(b)
    }
    item('说一句…', () => { try { openCard() } catch { /* 面板还没好就算了 */ } })
    item('打开鱼窝', () => {
      const nodes = [...document.querySelectorAll('button, a, [role="button"], li, div')]
      const hit = nodes.find((n) => (n.textContent || '').trim() === '鱼神双子星' && n.offsetParent !== null)
      if (hit) hit.click()
      else say('去左边侧边栏点「鱼神双子星」就能进来。', 5000)
    })
    item('先收起来', () => {
      // 只收这次：不写 localStorage，刷新一下就回来，免得关了就找不着
      say('好，我先回去。刷新一下我就回来。', 3000)
      setTimeout(() => { box.style.display = 'none' }, 1200)
    })
    let pickerOpenAt = 0
    box.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (picker.style.display === 'flex' && Date.now() - pickerOpenAt < 3000) { picker.style.display = 'none'; return }
      const r = box.getBoundingClientRect()
      picker.style.left = Math.max(4, Math.min(window.innerWidth - 130, r.left + 6)) + 'px'
      picker.style.top = Math.max(4, r.top - 8 - (fpRoles.length * 30 + 110)) + 'px'
      picker.style.display = 'flex'
      pickerOpenAt = Date.now()
    })
    const closePicker = (e) => {
      if (picker.style.display !== 'flex') return
      if (e && (picker.contains(e.target) || box.contains(e.target))) return
      picker.style.display = 'none'
    }
    window.addEventListener('pointerdown', closePicker)
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') picker.style.display = 'none' })

    // —— 快捷面板：常用的东西直接放桌宠身上（说一句 / 今天花了多少 / 她在忙什么） ——
    // 设置那些不常用的仍然在鱼窝里点进去改，这只身上只放“抬手就能用”的。
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.textContent = '…'
    chip.title = '快捷：说一句 / 看花费'
    Object.assign(chip.style, {
      position: 'absolute', right: '-2px', top: '28px', width: '22px', height: '22px',
      borderRadius: '50%', border: '1px solid rgba(40,100,160,.45)',
      background: 'rgba(255,255,255,.92)', color: '#15578f', fontSize: '13px', lineHeight: '1',
      cursor: 'pointer', padding: 0, opacity: '0.55', transition: 'opacity .15s ease',
    })
    chip.addEventListener('mouseenter', () => { chip.style.opacity = '1' })
    chip.addEventListener('mouseleave', () => { chip.style.opacity = '0.55' })
    box.appendChild(chip)

    const card = document.createElement('div')
    Object.assign(card.style, {
      position: 'absolute', left: '50%', bottom: 'calc(100% + 6px)', transform: 'translateX(-50%)',
      width: '236px', padding: '10px 12px', display: 'none', boxSizing: 'border-box',
      background: 'rgba(255,255,255,.97)', color: '#15578f',
      border: '1px solid rgba(40,100,160,.4)', borderRadius: '14px',
      boxShadow: '0 16px 34px rgba(0,0,0,.45)', fontSize: '12.5px', lineHeight: '1.6',
      pointerEvents: 'auto', cursor: 'default',
    })
    const cardTitle = document.createElement('div')
    cardTitle.style.cssText = 'font-weight:600;margin-bottom:6px'
    const ta = document.createElement('textarea')
    ta.rows = 2
    ta.placeholder = '跟她说一句…（Enter 发送）'
    ta.style.cssText = 'width:100%;box-sizing:border-box;resize:none;padding:7px 9px;border-radius:9px;border:1px solid rgba(40,100,160,.35);background:#fff;color:#123;font:inherit;line-height:1.5;outline:none'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:6px'
    const sendBtn = document.createElement('button')
    sendBtn.type = 'button'
    sendBtn.textContent = '发送'
    sendBtn.style.cssText = 'padding:5px 14px;border-radius:9px;border:1px solid #2563eb;background:#2563eb;color:#fff;font:inherit;cursor:pointer'
    const info = document.createElement('div')
    info.style.cssText = 'margin-top:7px;font-size:12.5px;color:#2a6ea3;opacity:.9;min-height:1.2em'
    // 发图：选一张本地图片，存进她的收件目录，再把路径递给她（她自己 read_image 看）
    const imgBtn = document.createElement('button')
    imgBtn.type = 'button'
    imgBtn.textContent = '发图'
    imgBtn.title = '发一张图给她看'
    imgBtn.style.cssText = 'padding:5px 12px;border-radius:9px;border:1px solid rgba(40,100,160,.45);background:#fff;color:#15578f;font:inherit;cursor:pointer'
    const imgInput = document.createElement('input')
    imgInput.type = 'file'
    imgInput.accept = 'image/png,image/jpeg,image/webp,image/gif'
    imgInput.style.display = 'none'
    imgBtn.addEventListener('click', () => imgInput.click())
    // 发图：按钮选、输入框粘贴、拖进来，都走这一条
    const sendImageFile = async (file) => {
      if (!file) return
      if (!/^image\//i.test(file.type || '')) { info.textContent = '只收图片（png / jpg / webp / gif）'; return }
      if (file.size > 8 * 1024 * 1024) { info.textContent = '图太大了（最大 8MB）'; return }
      imgBtn.disabled = true
      imgBtn.textContent = '…'
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const fr = new FileReader()
          fr.onload = () => resolve(String(fr.result || ''))
          fr.onerror = () => reject(new Error('读图片失败'))
          fr.readAsDataURL(file)
        })
        const r = await fetch('/api/dayu/residence/image', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role, dataUrl, text: ta.value.trim() }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`)
        ta.value = ''
        info.textContent = '图发过去了，她看完会说。'
      } catch (e) {
        info.textContent = '没发出去：' + String(e?.message || e)
      } finally {
        imgBtn.disabled = false
        imgBtn.textContent = '发图'
      }
    }
    imgInput.addEventListener('change', () => {
      const file = imgInput.files && imgInput.files[0]
      imgInput.value = ''
      sendImageFile(file)
    })
    // 直接 Ctrl+V 粘贴图片
    ta.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items ? [...e.clipboardData.items] : []
      const hit = items.find((it) => it.kind === 'file' && /^image\//i.test(it.type || ''))
      if (!hit) return
      const file = hit.getAsFile()
      if (!file) return
      e.preventDefault()
      sendImageFile(file)
    })
    // 拖图进来也收
    card.addEventListener('dragover', (e) => { e.preventDefault() })
    card.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
      if (!file) return
      e.preventDefault()
      e.stopPropagation()
      sendImageFile(file)
    })
    row.append(sendBtn, imgBtn, imgInput)
    card.append(cardTitle, ta, row, info)
    box.appendChild(card)

    let cardOn = false
    const refreshInfo = () => {
      cardTitle.textContent = `跟${fpName[role] || '她'}说一句`
      info.textContent = '查账中…'
      Promise.all([
        fetch('/api/yushen/live', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/dayu/overview', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([live, ov]) => {
        const cost = Number(ov?.account?.cost || 0)
        const busy = live?.active ? (live.tool || '正在忙') : '闲着'
        info.textContent = `今天花了 ¥${cost.toFixed(2)} · ${busy}`
      }).catch(() => { info.textContent = '' })
    }
    const openCard = () => {
      cardOn = !cardOn
      card.style.display = cardOn ? 'block' : 'none'
      if (cardOn) { refreshInfo(); setTimeout(() => ta.focus(), 30) }
    }
    chip.addEventListener('pointerdown', (e) => e.stopPropagation())
    chip.addEventListener('click', (e) => { e.stopPropagation(); openCard() })
    card.addEventListener('pointerdown', (e) => e.stopPropagation())
    card.addEventListener('click', (e) => e.stopPropagation())
    const sendToHer = async () => {
      const text = ta.value.trim()
      if (!text) { ta.focus(); return }
      sendBtn.disabled = true
      sendBtn.textContent = '…'
      try {
        const r = await fetch('/api/dayu/residence/say', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role, text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`)
        ta.value = ''
        info.textContent = '发过去了，她醒来会看到。'
      } catch (e) {
        info.textContent = '没发出去：' + String(e?.message || e)
      } finally {
        sendBtn.disabled = false
        sendBtn.textContent = '发送'
      }
    }
    sendBtn.addEventListener('click', sendToHer)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToHer() }
      if (e.key === 'Escape') { e.stopPropagation(); cardOn = false; card.style.display = 'none' }
    })
    window.addEventListener('pointerdown', (e) => {
      if (!cardOn) return
      if (card.contains(e.target) || chip.contains(e.target)) return
      cardOn = false
      card.style.display = 'none'
    })

    // 在跑 / 花钱：跟鱼窝里那套一个口径
    let wasActive = false
    let seenSeq = 0
    const poll = () => {
      fetch('/api/yushen/live', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !d.ok) return
          if (d.active && !wasActive) say(d.tool || '正在处理手头的事情…', 6000)
          wasActive = Boolean(d.active)
          if (Number(d.lastTurnSeq) > seenSeq) {
            const first = seenSeq === 0
            seenSeq = Number(d.lastTurnSeq)
            if (!first && Number(d.lastTurn?.cost) > 0) say(`这轮花了 ¥${Number(d.lastTurn.cost).toFixed(2)}`, 6000)
          }
        })
        .catch(() => {})
    }
    poll()
    setInterval(poll, 2500)

    // 没事的时候嘀咕一句（解压用）：按时间/场景挑，隔几分钟一次，不打扰
    const pickIdle = () => {
      const h = new Date().getHours()
      const late = ['这么晚了还在忙？早点睡。', '夜里安静，正好干活，别熬太狠。']
      const noon = ['中午了，先吃点东西。', '饭点到了，吃完再干。']
      const tired = ['写累了就歇会儿，我在这儿。', '腰酸了吧？起来走两步。', '眼睛歇一下，看看远处。', '这一会儿没动，喝口水吧。']
      const common = ['嗯…让我想想。', '我在。', '有事情就点我一下。', '今天也要好好干活。', '摸鱼被我看到了。', '点我一下，能看余额。']
      const pool = (h >= 23 || h < 6) ? [...late, ...tired, ...common]
        : (h >= 11 && h < 13) ? [...noon, ...tired, ...common]
          : [...tired, ...common]
      return pool[Math.floor(Math.random() * pool.length)]
    }
    const scheduleIdle = () => {
      setTimeout(() => {
        try {
          if (!document.hidden && bubble.style.display !== 'block' && !wasActive) say(pickIdle(), 4500, ownerName)
        } catch { /* 忽略 */ }
        scheduleIdle()
      }, 180000 + Math.random() * 240000)
    }
    scheduleIdle()

    // 整点报时：到点轻轻说一句（饭点/深夜会换说法），不打扰干活
    const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二', '二十三']
    const clockLine = () => {
      const h = new Date().getHours()
      const t = `${CN[h] || h} 点`
      if (h >= 11 && h < 13) return `${t}了，饭点，先吃。`
      if (h >= 17 && h < 19) return `${t}了，晚饭。`
      if (h >= 23 || h < 6) return `${t}了，该睡了。`
      return `${t}了。${['起来动一下。', '喝口水。', '这段干得挺久了，歇会儿。'][Math.floor(Math.random() * 3)]}`
    }
    const scheduleClock = () => {
      const now = new Date()
      const next = new Date(now)
      next.setMinutes(60, 0, 0)
      const wait = Math.max(5000, next.getTime() - now.getTime() + 800)
      setTimeout(() => {
        try {
          if (!document.hidden && !wasActive && bubble.style.display !== 'block') say(clockLine(), 4500, ownerName)
        } catch { /* 忽略 */ }
        scheduleClock()
      }, wait)
    }
    scheduleClock()

    // 进了鱼窝就隐身（那边有真的她，不要两个）
    const syncVisible = () => {
      const inNest = Boolean(document.querySelector('.ysn-root'))
      box.style.display = inNest ? 'none' : 'flex'
    }
    syncVisible()
    setInterval(syncVisible, 1200)
    window.addEventListener('resize', () => {
      box.style.left = Math.min(box.offsetLeft, window.innerWidth - box.offsetWidth - 6) + 'px'
      box.style.top = Math.min(box.offsetTop, window.innerHeight - box.offsetHeight - 6) + 'px'
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mountFloatPet, 1600))
  else setTimeout(mountFloatPet, 1600)
}

// 右下角「小鱼报活」：实时显示 正在跑 / 刚做完 / 没做 / 出错 / 重复。
// 开关在单子页（小鱼示警上方），也可以点这个窗的标题栏；状态存 localStorage + 服务端 switches.floatLive。
if (typeof document !== 'undefined') {
  const KEY = 'yushen.liveFloat'
  const COLLAPSE = 'yushen.liveFloat.collapsed'
  const COLORS = { running: '#60a5fa', done: '#34d399', pending: '#fbbf24', error: '#f87171', duplicate: '#a78bfa' }
  const LABELS = { running: '正在跑', done: '刚做完', pending: '没做', error: '出错', duplicate: '重复' }
  const KIND_LABEL = { session: '会话', job: '派活', incident: '事故', patch: '补丁' }
  const enabled = () => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } }

  const mount = () => {
    if (document.getElementById('yushen-live-float')) return
    const box = document.createElement('div')
    box.id = 'yushen-live-float'
    const geo = (() => { try { return JSON.parse(localStorage.getItem('yushen.liveFloat.geo') || '{}') || {} } catch { return {} } })()
    Object.assign(box.style, {
      position: 'fixed',
      left: geo.left || 'auto', top: geo.top || 'auto',
      right: geo.left ? 'auto' : '12px', bottom: geo.top ? 'auto' : '12px',
      width: geo.width ? `${geo.width}px` : '320px',
      height: geo.height ? `${geo.height}px` : 'auto',
      minWidth: '260px', minHeight: '120px', maxWidth: '92vw', maxHeight: '86vh',
      display: 'none', flexDirection: 'column', zIndex: '2147482000',
      background: 'rgba(17,24,39,.94)', color: '#e5e7eb', border: '1px solid rgba(148,163,184,.35)',
      borderRadius: '12px', boxShadow: '0 12px 36px rgba(0,0,0,.45)', font: '12px/1.5 system-ui, sans-serif',
      overflow: 'hidden', resize: 'both',
    })
    const head = document.createElement('div')
    Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,.25)', background: 'rgba(30,41,59,.9)' })
    const title = document.createElement('div')
    title.textContent = '小鱼报活'
    Object.assign(title.style, { flex: '1', fontWeight: '600', letterSpacing: '.03em' })
    const summary = document.createElement('span')
    Object.assign(summary.style, { opacity: '.85' })
    const toggle = document.createElement('button')
    toggle.textContent = '关'
    Object.assign(toggle.style, { border: '1px solid rgba(148,163,184,.4)', background: 'transparent', color: 'inherit', borderRadius: '6px', padding: '1px 7px', cursor: 'pointer', fontSize: '11px' })
    const expandBtn = document.createElement('button')
    expandBtn.textContent = '⤢'
    expandBtn.title = '完全展开 / 收回'
    Object.assign(expandBtn.style, { border: '1px solid rgba(148,163,184,.4)', background: 'transparent', color: 'inherit', borderRadius: '6px', padding: '1px 6px', cursor: 'pointer', fontSize: '11px' })
    const foldBtn = document.createElement('button')
    foldBtn.textContent = '−'
    foldBtn.title = '折成几行 / 展开'
    Object.assign(foldBtn.style, { border: '1px solid rgba(148,163,184,.4)', background: 'transparent', color: 'inherit', borderRadius: '6px', padding: '1px 6px', cursor: 'pointer', fontSize: '11px' })
    head.append(title, summary, expandBtn, foldBtn, toggle)
    const body = document.createElement('div')
    Object.assign(body.style, { padding: '8px 10px', overflow: 'auto', flex: '1 1 auto', minHeight: '0' })
    const bar = document.createElement('div')
    Object.assign(bar.style, { padding: '6px 10px', borderBottom: '1px solid rgba(148,163,184,.25)' })
    const search = document.createElement('input')
    search.type = 'search'
    search.placeholder = '搜：谁在干什么 / 派活 / 事故 / 补丁'
    Object.assign(search.style, {
      width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: '12px',
      borderRadius: '7px', border: '1px solid rgba(148,163,184,.35)', background: 'rgba(15,23,42,.6)', color: 'inherit',
    })
    bar.appendChild(search)
    box.append(head, bar, body)
    document.body.appendChild(box)

    let collapsed = false
    try { collapsed = localStorage.getItem(COLLAPSE) === '1' } catch { /* 忽略 */ }
    let last = null
    let timer = null
    let query = ''
    let searchTimer = null
    let expanded = false
    let compact = false
    try {
      expanded = localStorage.getItem('yushen.liveFloat.expanded') === '1'
      compact = localStorage.getItem('yushen.liveFloat.compact') === '1'
    } catch { /* 忽略 */ }
    const perPage = () => (expanded ? 24 : compact ? 3 : 6)

    const ago = (s) => (s === null || s === undefined ? '' : s < 60 ? `${s} 秒前` : s < 3600 ? `${Math.round(s / 60)} 分前` : `${Math.round(s / 3600)} 小时前`)
    const line = (item) => {
      const row = document.createElement('div')
      Object.assign(row.style, { padding: '4px 0', borderTop: '1px solid rgba(148,163,184,.12)' })
      const t = document.createElement('div')
      t.textContent = `${item.title || '(无标题)'}${item.id ? ` · ${item.id}` : ''}${item.age !== null && item.age !== undefined ? ` · ${ago(item.age)}` : ''}`
      Object.assign(t.style, { fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
      const d = document.createElement('div')
      d.textContent = item.doing || item.status || ''
      Object.assign(d.style, { opacity: '.6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
      row.append(t, d)
      const prov = `${item.provenance || ''}${item.role ? ` · ${item.role}` : ''}`.trim()
      if (prov) {
        const p = document.createElement('div')
        p.textContent = prov
        Object.assign(p.style, { opacity: '.42', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
        row.append(p)
      }
      return row
    }
    const treeRow = (node, depth) => {
      const wrap = document.createElement('div')
      wrap.style.marginTop = depth ? '5px' : '7px'
      if (depth) wrap.style.paddingLeft = '12px'
      const t = document.createElement('div')
      const kids = Array.isArray(node.children) ? node.children.length : 0
      t.textContent = `${depth ? '↳ ' : '● '}${node.title} · ${node.id}${node.age !== null && node.age !== undefined ? ` · ${ago(node.age)}` : ''}${kids ? ` · ${kids} 个子窗口` : ''}`
      Object.assign(t.style, { fontWeight: depth ? '400' : '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
      const d = document.createElement('div')
      d.textContent = node.doing || node.status || ''
      Object.assign(d.style, { opacity: '.62', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: depth ? '8px' : '0' })
      const p = document.createElement('div')
      p.textContent = `${node.provenance || ''}${node.role ? ` · ${node.role}` : ''}`
      Object.assign(p.style, { opacity: '.42', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: depth ? '8px' : '0' })
      wrap.append(t, d)
      if (p.textContent.trim()) wrap.append(p)
      for (const child of (node.children || []).slice(0, expanded ? 12 : compact ? 1 : 4)) wrap.appendChild(treeRow(child, depth + 1))
      const rest = (node.children || []).length - (expanded ? 12 : compact ? 1 : 4)
      if (rest > 0) {
        const more = document.createElement('div')
        more.textContent = `↳ 还有 ${rest} 个子窗口 · 点开全部`
        Object.assign(more.style, { opacity: '.5', paddingLeft: '20px', cursor: 'pointer' })
        more.onclick = () => { expanded = true; try { localStorage.setItem('yushen.liveFloat.expanded', '1') } catch { /* 忽略 */ } render(last) }
        wrap.appendChild(more)
      }
      return wrap
    }
    const render = (data) => {
      body.textContent = ''
      if (!data || !data.ok) {
        body.textContent = '读不到报活（宿主可能刚重载）'
        return
      }
      const terms = String(data.q || '')
      const asks = Array.isArray(data.asks) ? data.asks : []
      if (asks.length) {
        const h = document.createElement('div')
        h.textContent = `她在问你 · ${asks.length}`
        Object.assign(h.style, { color: '#fbbf24', fontWeight: '600', marginTop: '4px' })
        body.appendChild(h)
        for (const a of asks.slice(0, 4)) {
          const row = document.createElement('div')
          Object.assign(row.style, { padding: '4px 0', borderTop: '1px solid rgba(148,163,184,.12)' })
          const t = document.createElement('div')
          t.textContent = a.text
          Object.assign(t.style, { whiteSpace: 'normal' })
          const btn = document.createElement('button')
          btn.textContent = '回复'
          Object.assign(btn.style, { marginTop: '3px', border: '1px solid rgba(148,163,184,.4)', background: 'transparent', color: 'inherit', borderRadius: '6px', padding: '1px 8px', cursor: 'pointer', fontSize: '11px' })
          btn.onclick = async () => {
            const answer = window.prompt(`回复 ${a.role || '她'}：`, '')
            if (!answer) return
            try {
              await fetch('/api/dayu/asks/answer', {
                method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: a.id, answer }),
              })
              poll()
            } catch { /* 答不上就留着 */ }
          }
          row.append(t, btn)
          body.appendChild(row)
        }
      }
      if (terms) {
        const rows = Array.isArray(data.search) ? data.search : []
        summary.textContent = `搜「${terms}」· ${rows.length}`
        const h = document.createElement('div')
        h.textContent = `搜索结果 · ${rows.length}`
        Object.assign(h.style, { color: '#93c5fd', fontWeight: '600', marginTop: '4px' })
        body.appendChild(h)
        for (const item of rows.slice(0, 12)) body.appendChild(line({ ...item, title: `[${KIND_LABEL[item.kind] || item.kind}] ${item.title}` }))
        if (rows.length > 12) {
          const more = document.createElement('div')
          more.textContent = `还有 ${rows.length - 12} 条 · 点开全部`
          Object.assign(more.style, { opacity: '.55', cursor: 'pointer', marginTop: '4px', textDecoration: 'underline' })
          more.onclick = () => { expanded = true; try { localStorage.setItem('yushen.liveFloat.expanded', '1') } catch { /* 忽略 */ } render(last) }
          body.appendChild(more)
        }
        if (!rows.length) {
          const empty = document.createElement('div')
          empty.textContent = `没有匹配「${terms}」的（会话/派活/事故/补丁都找过了）`
          Object.assign(empty.style, { opacity: '.6', marginTop: '6px' })
          body.appendChild(empty)
        }
        if (collapsed && last) body.style.display = 'none'
        return
      }
      const counts = data.counts || {}
      summary.textContent = `跑 ${counts.running || 0} · 做 ${counts.done || 0} · 待 ${counts.pending || 0} · 错 ${counts.error || 0} · 重 ${counts.duplicate || 0}`
      const trees = Array.isArray(data.tree) ? data.tree : []
      if (trees.length) {
        const h = document.createElement('div')
        h.textContent = '谁在跑 · 窗口树'
        Object.assign(h.style, { color: '#60a5fa', fontWeight: '600', marginTop: '4px' })
        body.appendChild(h)
        for (const node of trees) body.appendChild(treeRow(node, 0))
      }
      let any = trees.length > 0
      for (const key of ['error', 'pending', 'duplicate', 'done', 'running']) {
        if (key === 'running' && trees.length) continue
        const rows = Array.isArray(data[key]) ? data[key] : []
        if (!rows.length) continue
        any = true
        const h = document.createElement('div')
        h.textContent = `${LABELS[key]} · ${rows.length}`
        Object.assign(h.style, { color: COLORS[key], fontWeight: '600', marginTop: '6px' })
        body.appendChild(h)
        for (const item of rows.slice(0, perPage())) body.appendChild(line(item))
        if (rows.length > perPage()) {
          const more = document.createElement('div')
          more.textContent = `还有 ${rows.length - perPage()} 条 · 点开全部`
          Object.assign(more.style, { opacity: '.55', cursor: 'pointer', marginTop: '4px', textDecoration: 'underline' })
          more.onclick = () => { expanded = true; try { localStorage.setItem('yushen.liveFloat.expanded', '1') } catch { /* 忽略 */ } render(last) }
          body.appendChild(more)
        }
      }
      if (!any) body.textContent = '现在没有动静。'
      if (collapsed && last) body.style.display = 'none'
    }
    const poll = async () => {
      if (!enabled()) { box.style.display = 'none'; return }
      box.style.display = 'flex'
      body.style.display = collapsed ? 'none' : 'block'
      bar.style.display = collapsed ? 'none' : 'block'
      try {
        const url = '/api/dayu/now' + (query ? `?q=${encodeURIComponent(query)}` : '')
        const res = await fetch(url, { credentials: 'same-origin' })
        const data = await res.json()
        last = data
        if (enabled()) render(data)
      } catch {
        body.textContent = '读不到报活（宿主可能刚重载）'
        box.style.display = 'flex'
      }
    }
    head.onclick = (e) => {
      if (e.target === toggle) return
      collapsed = !collapsed
      try { localStorage.setItem(COLLAPSE, collapsed ? '1' : '0') } catch { /* 忽略 */ }
      body.style.display = collapsed ? 'none' : 'block'
      bar.style.display = collapsed ? 'none' : 'block'
      if (collapsed) box.style.height = 'auto'
    }
    const saveGeo = (withSize) => {
      try {
        const r = box.getBoundingClientRect()
        const prev = JSON.parse(localStorage.getItem('yushen.liveFloat.geo') || '{}') || {}
        const next = { ...prev, left: Math.round(r.left), top: Math.round(r.top) }
        if (withSize) { next.width = Math.round(r.width); next.height = Math.round(r.height) }
        localStorage.setItem('yushen.liveFloat.geo', JSON.stringify(next))
      } catch { /* 忽略 */ }
    }
    const applySize = () => {
      if (expanded) {
        box.style.width = 'min(760px, 92vw)'
        box.style.height = '80vh'
      } else {
        const stored = (() => { try { return JSON.parse(localStorage.getItem('yushen.liveFloat.geo') || '{}') || {} } catch { return {} } })()
        box.style.width = stored.width ? `${stored.width}px` : (compact ? '280px' : '320px')
        box.style.height = stored.height && !compact ? `${stored.height}px` : 'auto'
      }
    }
    expandBtn.onclick = (e) => {
      e.stopPropagation()
      expanded = !expanded
      if (expanded) compact = false
      try {
        localStorage.setItem('yushen.liveFloat.expanded', expanded ? '1' : '0')
        localStorage.setItem('yushen.liveFloat.compact', compact ? '1' : '0')
      } catch { /* 忽略 */ }
      applySize()
      render(last)
    }
    foldBtn.onclick = (e) => {
      e.stopPropagation()
      compact = !compact
      expanded = false
      try {
        localStorage.setItem('yushen.liveFloat.compact', compact ? '1' : '0')
        localStorage.setItem('yushen.liveFloat.expanded', '0')
      } catch { /* 忽略 */ }
      applySize()
      render(last)
    }
    // 拖动：按住标题栏挪，松手记住位置；右下角拉伸后记住尺寸。
    let drag = null
    let resizing = false
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return
      const r = box.getBoundingClientRect()
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }
      try { head.setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
    })
    head.addEventListener('pointermove', (e) => {
      if (!drag) return
      const w = box.offsetWidth
      const h = box.offsetHeight
      const left = Math.max(4, Math.min(window.innerWidth - w - 4, e.clientX - drag.dx))
      const top = Math.max(4, Math.min(window.innerHeight - h - 4, e.clientY - drag.dy))
      box.style.left = `${left}px`
      box.style.top = `${top}px`
      box.style.right = 'auto'
      box.style.bottom = 'auto'
    })
    head.addEventListener('pointerup', () => { if (drag) { drag = null; saveGeo(false) } })
    head.addEventListener('pointercancel', () => { drag = null })
    head.addEventListener('dblclick', () => {
      box.style.left = 'auto'; box.style.top = 'auto'; box.style.right = '12px'; box.style.bottom = '12px'
      try { localStorage.removeItem('yushen.liveFloat.geo') } catch { /* 忽略 */ }
      applySize()
    })
    box.addEventListener('pointerdown', (e) => {
      const r = box.getBoundingClientRect()
      if (e.clientX > r.right - 20 && e.clientY > r.bottom - 20) resizing = true
    })
    window.addEventListener('pointerup', () => { if (resizing) { resizing = false; saveGeo(true) } })
    search.oninput = () => {
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(() => { query = search.value.trim(); poll() }, 250)
    }
    search.onkeydown = (e) => {
      if (e.key === 'Escape') { search.value = ''; query = ''; poll() }
    }
    toggle.onclick = (e) => {
      e.stopPropagation()
      try { localStorage.setItem(KEY, '0') } catch { /* 忽略 */ }
      fetch('/api/dayu/switches', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ floatLive: false }),
      }).catch(() => { /* 服务端存不了也不挡隐藏 */ })
      box.style.display = 'none'
      window.dispatchEvent(new CustomEvent('yushen:livefloat', { detail: { on: false } }))
    }
    window.addEventListener('yushen:livefloat', (e) => {
      const on = e?.detail?.on !== false
      try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* 忽略 */ }
      if (on) poll(); else box.style.display = 'none'
    })
    // 服务端开关优先：关了就别冒出来。
    fetch('/api/dayu/switches', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => { if (d?.switches?.floatLive === false) { try { localStorage.setItem(KEY, '0') } catch { /* 忽略 */ } poll() } })
      .catch(() => { /* 老版本没有就按本地 */ })
    applySize()
    poll()
    timer = setInterval(() => { if (!document.hidden) poll() }, 4000)
    window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer) })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 1500))
  else setTimeout(mount, 1500)
}
