(() => {
  'use strict';

  // ---------- dados guardados no celular ----------
  const CHAVE = 'cantinho:v1';
  const db = carregar();
  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && Array.isArray(d.diario)) return d;
    } catch (e) { /* começa vazio */ }
    return { diario: [] };
  }
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch (e) { /* sem espaço */ } }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- recadinhos ----------
  const TODAS = [];
  ASSUNTOS.forEach(a => FRASES[a.id].forEach(t => TODAS.push({ t, a: a.id })));
  const N = TODAS.length;
  const HORA = 3600000;

  const agora = () => (window.__agora ? window.__agora() : Date.now());
  // número da hora contando no horário local (muda certinho na virada de cada hora)
  const horaNum = ms => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / HORA);
  const horaDoDia = k => ((k % 24) + 24) % 24;

  function sorteio(semente) {
    let s = semente | 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function embaralhado(ciclo) {
    const r = sorteio(ciclo * 7919 + 13);
    const o = [...Array(N).keys()];
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  }
  const ordens = {};
  // a cada 72 horas passa por todas as frases; na virada, as 24 primeiras da rodada nova
  // não podem ser as 24 últimas da anterior (assim nunca repete em menos de 24 horas)
  function ordem(ciclo) {
    if (ordens[ciclo]) return ordens[ciclo];
    const o = embaralhado(ciclo);
    const G = 24;
    const rabo = new Set(embaralhado(ciclo - 1).slice(N - G)); // o fim da rodada anterior nunca é mexido
    let livre = G;
    for (let i = 0; i < G; i++) {
      if (!rabo.has(o[i])) continue;
      while (livre < N - G && rabo.has(o[livre])) livre++;
      [o[i], o[livre]] = [o[livre], o[i]];
      livre++;
    }
    return (ordens[ciclo] = o);
  }
  function recadoDaHora(k) {
    const ciclo = Math.floor(k / N);
    return TODAS[ordem(ciclo)[k - ciclo * N]];
  }

  function nomeHora(h, tipo) {
    // tipo 'das' (recadinho das 15 horas) ou 'as' (chega às 16 horas)
    if (h === 0) return tipo === 'das' ? 'da meia-noite' : 'à meia-noite';
    if (h === 12) return tipo === 'das' ? 'do meio-dia' : 'ao meio-dia';
    if (h === 1) return tipo === 'das' ? 'da 1 hora' : 'à 1 hora';
    return (tipo === 'das' ? 'das ' : 'às ') + h + ' horas';
  }

  const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataTexto(ms) { const d = new Date(ms); return SEMANA[d.getDay()] + ' · ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }

  // ---------- barulhinhos (feitos na hora, sem arquivo de som) ----------
  const Som = (() => {
    let ctx = null, ruidoBuf = null;
    const soando = [];
    function audio() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function ruidoBranco(a) {
      if (ruidoBuf) return ruidoBuf;
      ruidoBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = ruidoBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return ruidoBuf;
    }
    function envelope(a, g, ini, vol, ataque, dur) {
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(vol, ini + ataque);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
    }
    function tom(a, { f = 440, f2, t = 0, dur = 0.2, tipo = 'sine', vol = 0.12, ataque = 0.006, guardar }) {
      const ini = a.currentTime + t;
      const o = a.createOscillator(), g = a.createGain();
      o.type = tipo;
      o.frequency.setValueAtTime(f, ini);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, ini + dur);
      envelope(a, g, ini, vol, ataque, dur);
      o.connect(g).connect(a.destination);
      o.start(ini); o.stop(ini + dur + 0.05);
      if (guardar) soando.push(o);
    }
    function ruido(a, { t = 0, dur = 0.2, vol = 0.1, filtro = 'lowpass', f = 800, f2, q = 1 }) {
      const ini = a.currentTime + t;
      const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
      s.buffer = ruidoBranco(a);
      fl.type = filtro; fl.Q.value = q;
      fl.frequency.setValueAtTime(f, ini);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, ini + dur);
      envelope(a, g, ini, vol, 0.004, dur);
      s.connect(fl).connect(g).connect(a.destination);
      s.start(ini, Math.random() * 0.5); s.stop(ini + dur + 0.05);
    }
    const iic = (a, t) => { tom(a, { t, f: 1900, f2: 2700, dur: 0.06, vol: 0.05 }); tom(a, { t: t + 0.09, f: 2000, f2: 2900, dur: 0.06, vol: 0.045 }); };
    const SONS = {
      selo: a => { ruido(a, { dur: 0.05, vol: 0.22, filtro: 'highpass', f: 1800 }); ruido(a, { t: 0.05, dur: 0.04, vol: 0.16, filtro: 'highpass', f: 2600 }); tom(a, { f: 160, f2: 70, dur: 0.18, vol: 0.18 }); },
      envelope: a => ruido(a, { dur: 0.32, vol: 0.09, filtro: 'bandpass', f: 2600, f2: 900, q: 0.8 }),
      asas: a => { ruido(a, { dur: 0.16, vol: 0.1, filtro: 'bandpass', f: 500, f2: 1400, q: 0.9 }); ruido(a, { t: 0.17, dur: 0.16, vol: 0.09, filtro: 'bandpass', f: 500, f2: 1400, q: 0.9 }); iic(a, 0.3); },
      plim: a => { tom(a, { f: 1318.5, dur: 0.7, tipo: 'triangle', vol: 0.07 }); tom(a, { t: 0.1, f: 1760, dur: 0.9, tipo: 'triangle', vol: 0.06 }); tom(a, { t: 0.1, f: 3520, dur: 0.5, vol: 0.015 }); },
      toque: a => tom(a, { f: 760, f2: 460, dur: 0.07, vol: 0.06 }),
      coracao: a => { tom(a, { f: 95, f2: 60, dur: 0.14, vol: 0.32 }); tom(a, { t: 0.2, f: 90, f2: 58, dur: 0.14, vol: 0.26 }); },
      folha: a => { ruido(a, { dur: 0.24, vol: 0.08, filtro: 'bandpass', f: 3200, f2: 1100, q: 0.7 }); ruido(a, { t: 0.05, dur: 0.12, vol: 0.04, filtro: 'highpass', f: 4000 }); },
      guardar: a => [987.8, 1318.5, 1568].forEach((f, i) => tom(a, { t: i * 0.085, f, dur: 0.45, tipo: 'triangle', vol: 0.065 })),
      fim: a => { [784, 987.8, 1174.7, 1568].forEach((f, i) => tom(a, { t: i * 0.13, f, dur: 0.6, tipo: 'triangle', vol: 0.065 })); iic(a, 0.62); },
      apagar: a => tom(a, { f: 320, f2: 130, dur: 0.16, vol: 0.12 }),
      novo: a => { SONS.plim(a); iic(a, 0.35); },
      inspira: a => { tom(a, { f: 220, f2: 330, dur: 4, vol: 0.045, ataque: 1.4, guardar: true }); tom(a, { f: 330, f2: 495, dur: 4, vol: 0.015, ataque: 1.6, guardar: true }); },
      solta: a => { tom(a, { f: 330, f2: 196, dur: 5, vol: 0.04, ataque: 0.4, guardar: true }); tom(a, { f: 495, f2: 294, dur: 5, vol: 0.012, ataque: 0.5, guardar: true }); }
    };
    return {
      tocar(nome) {
        if (db.som === false) return;
        const a = audio();
        if (!a) return;
        // o celular só deixa tocar depois de um toque; sem toque, não guarda som pra tocar atrasado
        const tocouAgora = navigator.userActivation ? navigator.userActivation.isActive : true;
        if (a.state !== 'running' && !tocouAgora) return;
        try { SONS[nome](a); } catch (e) { /* sem som */ }
      },
      calar() { soando.splice(0).forEach(o => { try { o.stop(); } catch (e) { /* já parou */ } }); },
      destravar() { const a = audio(); return a && a.state === 'running'; }
    };
  })();
  window.__som = Som;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- desenhos ----------
  function morcego(w) {
    const h = Math.round(w * 0.75);
    return `<svg class="voa" width="${w}" height="${h}" viewBox="0 0 160 120" role="img" aria-label="Morceguinho abraçando um coração">
<path d="M62 48 L58 18 Q70 26 74 40 Z" fill="#A8121E"/><path d="M98 48 L102 18 Q90 26 86 40 Z" fill="#A8121E"/>
<path d="M63.5 42 L61.5 27 Q68 31 70 39 Z" fill="#E07A86"/><path d="M96.5 42 L98.5 27 Q92 31 90 39 Z" fill="#E07A86"/>
<circle cx="80" cy="66" r="30" fill="#A8121E"/><path d="M73 39 Q77 27 81 37 Q84 29 88 39 Z" fill="#A8121E"/>
<path d="M64 60 q6 -7 12 0" stroke="#F6EAD7" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M84 60 q6 -7 12 0" stroke="#F6EAD7" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M75 69 q2.5 3 5 0 q2.5 3 5 0" stroke="#F6EAD7" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M76.3 70.4 l1.4 4 l1.4 -3.2 Z M80.9 71.2 l1.4 3.2 l1.4 -4 Z" fill="#FFFFFF"/>
<circle cx="61" cy="68" r="5" fill="#D9475C"/><circle cx="99" cy="68" r="5" fill="#D9475C"/>
<path class="bate" d="M80 104 C68 96 63 90 63 84 a8 8 0 0 1 17 -3 a8 8 0 0 1 17 3 c0 6 -5 12 -17 20 z" fill="#F6EAD7" stroke="#7A1E3A" stroke-width="1.5"/>
<path d="M52 66 C40 82 52 102 72 98 C68 92 66 86 66 78 Z" fill="#6E1530"/><path d="M108 66 C120 82 108 102 88 98 C92 92 94 86 94 78 Z" fill="#6E1530"/>
<path d="M54 74 Q52 86 62 94 M106 74 Q108 86 98 94" stroke="#3A0C1A" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;
  }
  const ICO = {
    casa: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg>`,
    livro: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h4"/></svg>`,
    coracao: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
    seta: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A1E3A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
    lixo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6E4048" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
    mais: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7A1E3A" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
    troca: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7A1E3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>`,
    fone: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A1E3A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>`,
    somOn: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A1E3A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/></svg>`,
    somOff: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A4848A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>`,
    seloCoracao: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#F6EAD7" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`
  };
  const DIV = '<div class="divisoria" aria-hidden="true"><span></span></div>';

  const ETIQUETAS = [
    { id: 'gosto', nome: 'Eu gosto em mim' },
    { id: 'corpo', nome: 'Meu corpo fez' },
    { id: 'bem', nome: 'Fiz bem' },
    { id: 'outra', nome: 'Coisa boa' }
  ];
  const nomeEtiqueta = id => (ETIQUETAS.find(e => e.id === id) || ETIQUETAS[3]).nome;

  // ---------- navegação ----------
  const est = { tela: 'inicio', passo: 1, filtro: 'hoje', etiqueta: 'gosto', rascunho: '', recadoDificil: null, carinho: ['', '', ''] };
  const app = document.getElementById('app');

  let fundo = 0; // quantas telas acima do início
  function ir(tela, extra) {
    Object.assign(est, { tela }, extra || {});
    fundo++;
    history.pushState({ tela: est.tela, passo: est.passo, d: fundo }, '');
    desenhar();
  }
  function trocarAqui(tela, extra) {
    Object.assign(est, { tela }, extra || {});
    history.replaceState({ tela: est.tela, passo: est.passo, d: fundo }, '');
    desenhar();
  }
  function voltarProInicio() {
    if (fundo > 0) history.go(-fundo);
    else { est.tela = 'inicio'; desenhar(); }
  }
  window.addEventListener('popstate', e => {
    const s = e.state || { tela: 'inicio' };
    fundo = s.d || 0;
    est.tela = s.tela || 'inicio';
    if (s.passo) est.passo = s.passo;
    desenhar();
  });

  // ---------- telas ----------
  function abas(ativa) {
    const b = (id, nome, ico) => {
      const on = ativa === id;
      return `<button class="${on ? 'ativa' : ''}" data-acao="aba" data-tela="${id}" ${on ? 'aria-current="page"' : ''}>${ico(on ? '#A8121E' : '#6E4048')}${nome}</button>`;
    };
    return `<nav class="abas">${b('inicio', 'início', ICO.casa)}${b('diario', 'diário', ICO.livro)}${b('recadinhos', 'recadinhos', ICO.coracao)}</nav>`;
  }

  function telaInicio() {
    const ms = agora();
    const k = horaNum(ms);
    const h = horaDoDia(k);
    const r = recadoDaHora(k);
    est.kMostrado = k;
    const qtd = db.diario.length;
    const somLigado = db.som !== false;
    return `<main class="tela entra" style="position:relative">
  <button class="btn-som" data-acao="som" aria-pressed="${somLigado}" aria-label="${somLigado ? 'Desligar os barulhinhos' : 'Ligar os barulhinhos'}">${somLigado ? ICO.somOn : ICO.somOff}</button>
  <header class="cab">
    <span class="sc">${dataTexto(ms)}</span>
    <h1>Cantinho</h1>
    <span class="sub">um lugar só seu, Julia</span>
  </header>
  ${DIV}
  <section class="recado-hora" aria-live="polite">
    ${morcego(210)}
    <span class="sc">recadinho ${nomeHora(h, 'das')}</span>
    <div class="troca" style="display:flex;flex-direction:column;gap:6px;width:100%">
      <p class="frase" id="frase-hora">${esc(r.t)}</p>
      <div class="assina">— Pedro</div>
    </div>
    <span class="prox">o próximo chega ${nomeHora((h + 1) % 24, 'as')}</span>
  </section>
  ${DIV}
  <button class="btn-dificil" data-acao="dificil">
    <span class="selo">${ICO.seloCoracao}</span>
    <span><span class="t1">Tô num dia difícil</span><span class="t2">vem cá, te cubro com minhas asinhas</span></span>
  </button>
  <button class="linha-diario" data-acao="aba" data-tela="diario">
    ${ICO.livro('#7A1E3A')}<span class="nome">Diário de coisas boas</span>
    <span class="qtd">${qtd === 1 ? '1 guardada' : qtd + ' guardadas'}</span>
  </button>
</main>${abas('inicio')}`;
  }

  function cartaoFrase(t, hora) {
    return `<div class="cartao">${hora ? `<span class="hora">${hora}</span>` : ''}<p class="frase">${esc(t)}</p><div class="assina">— Pedro</div></div>`;
  }

  function telaRecadinhos() {
    const chips = [{ id: 'hoje', nome: 'De hoje' }, { id: 'todos', nome: 'Todos' }].concat(ASSUNTOS)
      .map(a => `<button class="pilula ${est.filtro === a.id ? 'ativa' : ''}" data-acao="filtro" data-id="${a.id}" aria-pressed="${est.filtro === a.id}">${a.nome}</button>`).join('');
    let lista = '';
    if (est.filtro === 'hoje') {
      const k = horaNum(agora());
      const h = horaDoDia(k);
      for (let i = 0; i <= h; i++) {
        const kk = k - i;
        lista += cartaoFrase(recadoDaHora(kk).t, 'recadinho ' + nomeHora(horaDoDia(kk), 'das') + (i === 0 ? ' · agora' : ''));
      }
    } else if (est.filtro === 'todos') {
      lista = TODAS.map(f => cartaoFrase(f.t)).join('');
    } else {
      lista = FRASES[est.filtro].map(t => cartaoFrase(t)).join('');
    }
    return `<main class="tela entra">
  <header class="cab esq"><h1>Recadinhos</h1><span class="sub">${N} recadinhos do Pedro pra você</span></header>
  <div class="fila" role="group" aria-label="Escolher assunto">${chips}</div>
  <div>${lista}</div>
</main>${abas('recadinhos')}`;
  }

  function nomeDia(ms) {
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const hoje = new Date(agora()); hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((hoje - d) / 86400000);
    if (dias === 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 7) return SEMANA[d.getDay()];
    return d.getDate() + ' de ' + MESES[d.getMonth()] + (d.getFullYear() !== hoje.getFullYear() ? ' de ' + d.getFullYear() : '');
  }

  function telaDiario() {
    const itens = db.diario.slice().sort((a, b) => b.t - a.t);
    let corpo = '';
    if (!itens.length) {
      corpo = `<div class="vazio">${morcego(130)}<p class="texto">Aqui ficam as coisas boas sobre você. Escreve a primeira, morceguinha.</p></div>`;
    } else {
      let ultimo = '';
      itens.forEach(it => {
        const dia = nomeDia(it.t);
        if (dia !== ultimo) { corpo += `<div class="dia">${dia}</div>`; ultimo = dia; }
        corpo += `<div class="anot"><div class="corpo"><span class="etq ${esc(it.tag)}">${nomeEtiqueta(it.tag)}</span><p>${esc(it.texto)}</p></div>
<button class="apagar" data-acao="apagar" data-id="${esc(it.id)}" aria-label="Apagar essa anotação">${ICO.lixo}</button></div>`;
      });
    }
    const qtd = itens.length;
    return `<main class="tela entra">
  <header class="cab esq"><h1>Diário de coisas boas</h1><span class="sub">${qtd === 0 ? 'nenhuma coisinha ainda' : qtd === 1 ? '1 coisinha guardada' : qtd + ' coisinhas guardadas'}</span></header>
  <button class="btn" data-acao="escrever">Escrever uma coisa boa</button>
  <div>${corpo}</div>
</main>${abas('diario')}`;
  }

  function telaEscrever() {
    const pills = ETIQUETAS.map(e => `<button class="pilula ${est.etiqueta === e.id ? 'ativa' : ''}" data-acao="etiqueta" data-id="${e.id}" aria-pressed="${est.etiqueta === e.id}">${e.nome}</button>`).join('');
    return `<main class="tela entra">
  <div class="topo"><button class="voltar" data-acao="voltar" aria-label="Voltar">${ICO.seta}</button><span></span><span style="width:44px"></span></div>
  <h2 class="titulo">Uma coisa boa sobre você</h2>
  <p class="texto">Pode ser bem pequenininha. Vale tudo.</p>
  <div class="etiquetas" role="group" aria-label="Tipo">${pills}</div>
  <div class="campo"><label for="texto-diario">O que você quer guardar?</label>
  <textarea id="texto-diario" data-campo="rascunho" placeholder="Ex.: meu cabelo ficou lindo hoje">${esc(est.rascunho)}</textarea></div>
  <button class="btn" data-acao="guardar">Guardar no diário</button>
</main>`;
  }

  function pontos(p) {
    return `<div class="pontos" aria-label="Passo ${p} de 3">${[1, 2, 3].map(i => `<i class="${i < p ? 'feito' : i === p ? 'atual' : ''}"></i>`).join('')}</div>`;
  }

  const POOL_DIFICIL = ['bem', 'cobrar', 'corpo', 'linda', 'morcego'].flatMap(id => FRASES[id]);
  function sortearDificil() {
    let t;
    do { t = POOL_DIFICIL[Math.floor(Math.random() * POOL_DIFICIL.length)]; } while (t === est.recadoDificil && POOL_DIFICIL.length > 1);
    est.recadoDificil = t;
  }

  function telaDificil() {
    const p = est.passo;
    const topo = `<div class="topo"><button class="voltar" data-acao="voltar" aria-label="Voltar">${ICO.seta}</button>${p <= 3 ? pontos(p) : '<span></span>'}<span style="width:44px"></span></div>`;
    if (p === 1) {
      return `<main class="tela entra">${topo}
  <div class="centro"><h2 class="titulo">Vamos respirar juntinhos</h2><p class="texto">Segue o círculo com a respiração. Sem pressa, morceguinha.</p></div>
  <div class="respira"><div class="anel a1"></div><div class="anel a2"></div>${morcego(150)}</div>
  <div class="fase" aria-live="polite"><b id="fase-nome">Inspira…</b><span id="fase-dica">enche o peito devagarinho</span></div>
  <div class="conta" id="conta">1 de 5 respirações</div>
  <button class="btn" data-acao="passo" data-p="2">Próximo</button>
  <button class="btn-texto" data-acao="passo" data-p="2">pular essa parte</button>
</main>`;
    }
    if (p === 2) {
      if (!est.recadoDificil) sortearDificil();
      return `<main class="tela entra">${topo}
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;text-align:center">
    ${morcego(190)}
    ${DIV.replace('class="divisoria"', 'class="divisoria" style="width:100%"')}
    <p class="frase troca" style="font-size:28px" aria-live="polite">${esc(est.recadoDificil)}</p>
    <div class="assina" style="font-size:24px">— Pedro</div>
    <button class="btn-linha" data-acao="outro">${ICO.troca} outro recadinho</button>
  </div>
  <button class="btn" data-acao="passo" data-p="3">Próximo</button>
</main>`;
    }
    if (p === 3) {
      const c = est.carinho;
      const campo = (i, rot, ex) => `<div class="campo"><label for="c${i}">${rot}</label><input id="c${i}" data-carinho="${i}" placeholder="${ex}" value="${esc(c[i])}" autocomplete="off"></div>`;
      return `<main class="tela entra">${topo}
  <h2 class="titulo">Agora, um carinho em você</h2>
  <p class="texto">Escreve 3 coisinhas boas sobre você. Pode ser bem simples, vampirinha.</p>
  ${campo(0, 'Uma coisa que eu gosto em mim', 'Ex.: meu sorriso')}
  ${campo(1, 'Algo que meu corpo fez por mim hoje', 'Ex.: me levou até a aula')}
  ${campo(2, 'Algo que eu fiz bem hoje', 'Ex.: ajudei minha amiga')}
  <p class="texto" style="font-size:15px">Isso vai direto pro seu Diário de coisas boas.</p>
  <div class="aviso">${ICO.fone}<p>Se estiver pesado demais, conversa com alguém. O CVV atende de graça, 24 horas: é só ligar <a href="tel:188">188</a>.</p></div>
  <button class="btn" data-acao="terminar">Guardar e terminar</button>
</main>`;
    }
    return `<main class="tela entra" style="justify-content:center;text-align:center;align-items:center">
  ${morcego(190)}
  <h2 class="titulo">Orgulho de você</h2>
  <p class="frase">Obrigado por cuidar de você, morceguinha. Volta aqui sempre que precisar.</p>
  <div class="assina">— Pedro</div>
  <div style="width:100%;margin-top:12px"><button class="btn" data-acao="fim">Voltar pro início</button></div>
</main>`;
  }

  // ---------- respiração ----------
  let timerResp = null;
  function pararRespiracao() { if (timerResp) { clearTimeout(timerResp); timerResp = null; } Som.calar(); }
  function comecarRespiracao() {
    pararRespiracao();
    const FASES = [
      { n: 'Inspira…', d: 'enche o peito devagarinho', s: 1, ms: 4000 },
      { n: 'Segura…', d: 'só um pouquinho', s: 1, ms: 2000 },
      { n: 'Solta…', d: 'deixa o ar sair bem devagar', s: 0.7, ms: 5000 }
    ];
    let i = 0, feitas = 0;
    const passo = () => {
      const nome = document.getElementById('fase-nome');
      if (!nome) return pararRespiracao();
      const f = FASES[i];
      nome.textContent = f.n;
      document.getElementById('fase-dica').textContent = f.d;
      if (i === 0) Som.tocar('inspira');
      if (i === 2) Som.tocar('solta');
      document.querySelectorAll('.anel').forEach(a => { a.style.transitionDuration = f.ms + 'ms'; a.style.transform = 'scale(' + f.s + ')'; });
      timerResp = setTimeout(() => {
        i++;
        if (i === FASES.length) {
          i = 0; feitas++;
          if (feitas >= 5) {
            nome.textContent = 'Prontinho';
            document.getElementById('fase-dica').textContent = 'quando quiser, toca em Próximo';
            document.getElementById('conta').textContent = '5 de 5 respirações';
            return;
          }
          document.getElementById('conta').textContent = (feitas + 1) + ' de 5 respirações';
        }
        passo();
      }, f.ms);
    };
    requestAnimationFrame(() => requestAnimationFrame(passo));
  }

  // ---------- desenhar ----------
  function desenhar() {
    pararRespiracao();
    const t = est.tela;
    app.innerHTML = t === 'diario' ? telaDiario()
      : t === 'recadinhos' ? telaRecadinhos()
      : t === 'escrever' ? telaEscrever()
      : t === 'dificil' ? telaDificil()
      : telaInicio();
    if (t === 'dificil' && est.passo === 1) comecarRespiracao();
  }

  // ---------- toques ----------
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    const a = el.dataset.acao;
    const SOM_DE = { dificil: 'coracao', outro: 'folha', terminar: 'fim', apagar: null, guardar: null, som: null };
    if (!(a in SOM_DE)) Som.tocar('toque');
    else if (SOM_DE[a]) Som.tocar(SOM_DE[a]);
    if (a === 'som') {
      db.som = db.som === false;
      salvar(); desenhar();
      if (db.som) Som.tocar('plim');
    } else if (a === 'aba') {
      if (est.tela === el.dataset.tela) return;
      if (el.dataset.tela === 'inicio') { voltarProInicio(); return; }
      if (est.tela === 'inicio') ir(el.dataset.tela);
      else trocarAqui(el.dataset.tela);
    } else if (a === 'dificil') {
      ir('dificil', { passo: 1, recadoDificil: null, carinho: ['', '', ''] });
    } else if (a === 'passo') {
      ir('dificil', { passo: Number(el.dataset.p) });
    } else if (a === 'outro') {
      sortearDificil(); desenhar();
    } else if (a === 'terminar') {
      const tags = ['gosto', 'corpo', 'bem'];
      const t0 = agora();
      est.carinho.forEach((txt, i) => {
        const v = txt.trim();
        if (v) db.diario.push({ id: t0.toString(36) + i, t: t0 + i, tag: tags[i], texto: v.slice(0, 1000) });
      });
      salvar();
      est.carinho = ['', '', ''];
      trocarAqui('dificil', { passo: 4 });
    } else if (a === 'fim') {
      voltarProInicio();
    } else if (a === 'voltar') {
      history.back();
    } else if (a === 'filtro') {
      est.filtro = el.dataset.id; desenhar();
      const ativo = app.querySelector('.pilula.ativa'); if (ativo) ativo.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else if (a === 'escrever') {
      ir('escrever', { rascunho: '', etiqueta: 'gosto' });
      setTimeout(() => { const ta = document.getElementById('texto-diario'); if (ta) ta.focus(); }, 50);
    } else if (a === 'etiqueta') {
      est.etiqueta = el.dataset.id; desenhar();
    } else if (a === 'guardar') {
      const v = est.rascunho.trim();
      if (!v) { const ta = document.getElementById('texto-diario'); if (ta) { ta.focus(); ta.placeholder = 'Escreve alguma coisinha aqui primeiro'; } return; }
      const t0 = agora();
      db.diario.push({ id: t0.toString(36) + 'd', t: t0, tag: est.etiqueta, texto: v.slice(0, 1000) });
      salvar();
      Som.tocar('guardar');
      est.rascunho = '';
      history.back();
    } else if (a === 'apagar') {
      if (!confirm('Apagar essa anotação do diário?')) return;
      const i = db.diario.findIndex(x => x.id === el.dataset.id);
      if (i >= 0) { db.diario.splice(i, 1); salvar(); Som.tocar('apagar'); desenhar(); }
    }
  });
  app.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.campo === 'rascunho') est.rascunho = el.value;
    if (el.dataset.carinho) est.carinho[Number(el.dataset.carinho)] = el.value;
  });

  // ---------- recadinho novo a cada hora ----------
  function conferirHora() {
    if (est.tela === 'inicio' && horaNum(agora()) !== est.kMostrado) { desenhar(); Som.tocar('novo'); }
    if (est.tela === 'recadinhos' && est.filtro === 'hoje' && horaNum(agora()) !== est.kRecados) { est.kRecados = horaNum(agora()); desenhar(); }
  }
  setInterval(conferirHora, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) conferirHora(); });

  // ---------- instalar no celular ----------
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function telaInstalar() {
    if (instalado() || /[?&]teste/.test(location.search)) return false;
    try { if (sessionStorage.getItem('cantinho:naoInstalar')) return false; } catch (e) { /* segue */ }
    const ua = navigator.userAgent;
    const iphone = /iPhone|iPad|iPod/.test(ua);
    const webview = /; wv\)|FBAN|FBAV|Instagram|WhatsApp/.test(ua);
    const caixa = document.createElement('div');
    caixa.className = 'instalar';
    const voltarDepois = '<button class="btn-texto" data-i="depois">continuar no navegador</button>';
    let meio;
    if (iphone) {
      meio = `<ol><li>Toca no botão <b>Compartilhar</b> (o quadradinho com a setinha)</li><li>Escolhe <b>Adicionar à Tela de Início</b></li><li>Toca em <b>Adicionar</b></li></ol><div class="acoes">${voltarDepois}</div>`;
    } else if (webview && /Android/.test(ua)) {
      const alvo = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
      meio = `<p class="texto">Primeiro abre esse link no Chrome, aí dá pra instalar.</p><div class="acoes"><a class="btn" href="${alvo}">Abrir no Chrome</a>${voltarDepois}</div>`;
    } else {
      meio = `<div class="acoes"><button class="btn" data-i="instalar">Instalar o Cantinho</button>${voltarDepois}</div>
<div id="passos-manual" hidden><ol><li>Toca nos <b>três pontinhos ⋮</b> lá em cima</li><li>Escolhe <b>Instalar app</b> ou <b>Adicionar à tela inicial</b></li><li>Confirma em <b>Instalar</b></li></ol></div>`;
    }
    caixa.innerHTML = `<img src="icones/icone-192.png" alt=""><span class="sc">feito pelo Pedro pra você</span>
<h1 class="titulo" style="font-size:36px">Cantinho</h1><p class="texto">Instala no seu celular pra ele ficar pertinho, com os recadinhos chegando a cada hora.</p>${meio}`;
    document.body.appendChild(caixa);
    const manual = () => { const p = caixa.querySelector('#passos-manual'); if (p) p.hidden = false; };
    if (!iphone && !webview) setTimeout(() => { if (!window.__pedidoInstalar) manual(); }, 3500);
    caixa.addEventListener('click', async e => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      if (b.dataset.i === 'depois') {
        try { sessionStorage.setItem('cantinho:naoInstalar', '1'); } catch (x) { /* segue */ }
        caixa.remove();
      } else if (b.dataset.i === 'instalar') {
        const p = window.__pedidoInstalar;
        if (!p) { manual(); return; }
        p.prompt();
        const r = await p.userChoice.catch(() => null);
        window.__pedidoInstalar = null;
        if (r && r.outcome === 'accepted') {
          caixa.innerHTML = `<img src="icones/icone-192.png" alt=""><h1 class="titulo">Prontinho!</h1><p class="texto">Procura o ícone do morceguinho na tela do seu celular.</p><div class="acoes"><button class="btn" data-i="depois">Abrir aqui mesmo</button></div>`;
        }
      }
    });
    return true;
  }

  // ---------- abertura: a cartinha com selo de cera ----------
  function abertura() {
    const q = location.search;
    if (/[?&]teste/.test(q) && !/[?&]abertura/.test(q)) return;
    const el = document.createElement('div');
    el.className = 'abertura';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Tocar no selo pra abrir o Cantinho');
    el.innerHTML = `<div class="ab-cena">
  <svg class="ab-env ab-tras" width="240" height="170" viewBox="0 0 240 170" aria-hidden="true"><rect x="10" y="40" width="220" height="120" rx="6" fill="#C9A47A" stroke="#7A1E3A" stroke-width="1.5"/></svg>
  <div class="ab-morc">${morcego(170)}</div>
  <svg class="ab-env ab-frente" width="240" height="170" viewBox="0 0 240 170" aria-hidden="true">
    <path d="M10.5 42 L106 106 L10.5 159 Z" fill="#DCB98A" stroke="#7A1E3A" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M229.5 42 L134 106 L229.5 159 Z" fill="#DCB98A" stroke="#7A1E3A" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M11 159.5 L120 92 L229 159.5 Z" fill="#E2C49A" stroke="#7A1E3A" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="10" y="40" width="220" height="120" rx="6" fill="none" stroke="#7A1E3A" stroke-width="1.5"/>
  </svg>
  <svg class="ab-env ab-aba" width="240" height="170" viewBox="0 0 240 170" aria-hidden="true">
    <path d="M10 41 L120 118 L230 41 Z" fill="#D7B282" stroke="#7A1E3A" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>
  <svg class="ab-env ab-selo" width="240" height="170" viewBox="0 0 240 170" aria-hidden="true">
    <g class="ab-selo-g"><circle cx="120" cy="114" r="18" fill="#C8102E"/><circle cx="120" cy="114" r="13" fill="none" stroke="#A00D25" stroke-width="2"/>
    <path d="M120 121.5 C114 117.5 111.5 114.5 111.5 111.5 a4.2 4.2 0 0 1 8.5 -1.5 a4.2 4.2 0 0 1 8.5 1.5 c0 3 -2.5 6 -8.5 10 z" fill="#F6EAD7"/></g>
  </svg>
  <h1 class="ab-titulo">Cantinho</h1>
  <p class="ab-dica">toca no selo pra abrir</p>
</div>`;
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    let aberto = false;
    const abrir = () => {
      if (aberto) return;
      aberto = true;
      el.classList.add('abrindo');
      Som.tocar('selo');
      setTimeout(() => Som.tocar('envelope'), 220);
      setTimeout(() => Som.tocar('asas'), 520);
      setTimeout(() => Som.tocar('plim'), 1100);
      setTimeout(() => el.classList.add('saindo'), 2300);
      setTimeout(() => el.remove(), 2800);
    };
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    setTimeout(abrir, 3200);
  }

  // ---------- começar ----------
  history.replaceState({ tela: 'inicio', d: 0 }, '');
  desenhar();
  if (!telaInstalar()) abertura();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregou) return;
      const recarregar = () => { if (!recarregou && est.tela !== 'escrever' && est.tela !== 'dificil') { recarregou = true; location.reload(); } };
      recarregar();
      if (!recarregou) document.addEventListener('visibilitychange', recarregar);
    });
  }

  // para os testes automáticos
  window.__cantinho = { est, db, recadoDaHora, horaNum, TODAS, desenhar };
})();
