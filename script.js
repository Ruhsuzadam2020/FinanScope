'use strict';

const PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/get?url='
];
let proxyIdx = 0;
const PROXY_MAX_RETRIES = 2;

// ── STATE ─────────────────────────────────────────────────────
let myAssets    = safeLoad('fs_assets', []);
let watchlist   = safeLoad('fs_watchlist', ['XU100.IS', 'BTC-USD', 'USDTRY=X', 'GAU=X']);
let myChart     = null;
let currentSym  = 'XU100.IS';
let currentRange    = '1d';
let currentInterval = '5m';
let currentTab  = 'portfolio';
let currentView = 'home-news-view';

// ── SAFE LOCAL STORAGE ────────────────────────────────────────
function safeLoad(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function safeSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 320); }, 3200);
}


async function proxyFetch(targetUrl) {
  try {
    // DİKKAT: Buraya KENDİ Render linkini yazmalısın!
    const renderUrl = 'https://finanscope.onrender.com';
    
    const r = await fetch(`${renderUrl}/api/proxy/yahoo?url=${encodeURIComponent(targetUrl)}`);
    if (!r.ok) throw new Error('Sunucu proxy hatası');
    
    return await r.json();
  } catch (e) {
    console.error('Veri çekme hatası:', e);
    return null;
  }
}

// ── VIEW MANAGER ──────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('.view-container').forEach(v => {
    v.style.display = '';
    v.classList.remove('active');
  });

  document.body.classList.remove('news-mode', 'analysis-mode', 'markets-mode');

  const sidebar    = document.getElementById('main-sidebar');
  const mainLayout = document.querySelector('.main-layout');
  const target     = document.getElementById(viewId);
  if (!target) return;

  currentView = viewId;
  target.classList.add('active');

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  if (viewId === 'analysis-view') {
    document.body.classList.add('analysis-mode');
    if (sidebar) sidebar.style.display = 'flex';
    if (mainLayout) mainLayout.style.gridTemplateColumns = '288px 1fr';
  } else {
    if (sidebar) sidebar.style.display = 'none';
    if (mainLayout) mainLayout.style.gridTemplateColumns = '1fr';

    if (viewId === 'home-news-view') {
      document.body.classList.add('news-mode');
      fetchNews();
    } else if (viewId === 'markets-view') {
      document.body.classList.add('markets-mode');
      fetchGlobalMarkets();
    } else if (viewId === 'portfolio-view') {
      document.body.classList.add('markets-mode'); // Geniş ekran modu
      if (sidebar) sidebar.style.display = 'none'; // Yan paneli gizle
      if (mainLayout) mainLayout.style.gridTemplateColumns = '1fr';
      renderPortfolioView(); // Yeni tam ekran portföyü yükle
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── NEWS ──────────────────────────────────────────────────────
let newsCache = null;

async function fetchNews() {
  if (newsCache) { renderNews(newsCache); return; }

  const container = document.getElementById('full-news-feed');
  if (container) container.innerHTML = skeletonNews(6);

  try {
    // CollectAPI yerine kendi backendimizden çekiyoruz
    // Eskisi: const r = await fetch('/api/news');
const r = await fetch('https://finanscope.onrender.com/api/news');
    const data = await r.json();

    if (!data?.success || !data.result?.length) throw new Error("Veri yok");
    newsCache = data.result;
    renderNews(newsCache);
  } catch(e) {
    if (container) container.innerHTML = `<div class="empty-state"><div class="es-icon">📰</div><p class="es-text">Haberler yüklenemedi.<br>Lütfen sayfayı yenileyin.</p></div>`;
  }
}

function skeletonNews(n) {
  return Array(n).fill(`<div class="skeleton sk-card"></div>`).join('');
}

function renderNews(news) {
  // Ticker
  const ticker = document.getElementById('ticker-inner');
  if (ticker) {
    const items = news.slice(0, 12).map(n =>
      `<span class="ticker-item" onclick="window.open('${n.url}','_blank')">
        <span class="ticker-sym">📰</span> ${n.name}
      </span>`
    ).join('');
    ticker.innerHTML = items + items; // duplicate for infinite scroll
  }

  // Swiper
  const sliderWrap = document.getElementById('news-slider-wrapper');
  if (sliderWrap) {
    sliderWrap.innerHTML = news.slice(0, 6).map(n => `
      <div class="swiper-slide" onclick="window.open('${n.url}','_blank')">
        <img src="${n.image || ''}" onerror="this.src='https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=70'" loading="lazy">
        <div class="slide-overlay">
          <div class="slide-tag">Ekonomi</div>
          <div class="slide-title">${n.name}</div>
          <div class="slide-src">${n.source}</div>
        </div>
      </div>
    `).join('');

    // Init / re-init swiper
    if (window._swiperInstance) { window._swiperInstance.destroy(true, true); }
    window._swiperInstance = new Swiper('.mySwiper', {
      loop: true, autoplay: { delay: 4500, disableOnInteraction: false },
      pagination: { el: '.swiper-pagination', clickable: true },
      effect: 'slide', grabCursor: true,
    });
  }

  // News grid
  const container = document.getElementById('full-news-feed');
  if (!container) return;

  container.innerHTML = news.map((n, i) => {
    const img = n.image || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=70';
    const featured = i === 0 ? 'featured-news' : '';
    return `
      <div class="news-item-card ${featured}" onclick="window.open('${n.url}','_blank')">
        <img src="${img}" onerror="this.src='https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=70'" loading="lazy">
        <div class="news-card-body">
          <div class="news-card-title">${n.name}</div>
          <div class="news-card-meta">
            <span class="news-src-tag">${n.source || 'Haber'}</span>
            <span>Ekonomi</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── MARKETS ───────────────────────────────────────────────────
let marketsCache = null;

async function fetchGlobalMarkets() {
  if (marketsCache) { renderMarkets(marketsCache); return; }

  const container = document.getElementById('markets-grid');
  if (container) container.innerHTML = `<div class="loading-spinner-box" style="grid-column:1/-1"><div class="spin-icon"></div><span>Piyasalar senkronize ediliyor...</span></div>`;

  const endpoints = [
    { key: 'bist',   label: 'Borsa İstanbul', icon: '🇹🇷', url: 'hisseSenedi' },
    { key: 'cripto', label: 'Kripto Paralar',  icon: '₿',   url: 'cripto' },
    { key: 'emtia',  label: 'Altın & Emtia',   icon: '🏅',  url: 'goldPrice' },
  ];

  const results = {};
  await Promise.all(endpoints.map(async ep => {
    try {
      // CollectAPI yerine kendi backendimizden çekiyoruz
      const res = await fetch(`https://finanscope.onrender.com/api/economy/${ep.url}`);
      const data = await res.json();
      if (data?.success && data.result?.length) {
        results[ep.key] = { ...ep, items: data.result.slice(0, 15) };
      }
    } catch(e) { console.warn('Piyasa verisi çekilemedi:', ep.key); }
  }));

  // Fallback: if no data from CollectAPI, try Yahoo Finance for key symbols
  if (!Object.keys(results).length) {
    toast('CollectAPI erişilemedi, yedek veri yükleniyor...', 'info');
    const fallbackSymbols = [
      { key:'bist',  sym:'XU100.IS', name:'BIST 100', icon:'🇹🇷', label:'Borsa İstanbul' },
      { key:'bist',  sym:'THYAO.IS', name:'THYAO', icon:'🇹🇷', label:'Borsa İstanbul' },
      { key:'bist',  sym:'GARAN.IS', name:'GARAN', icon:'🇹🇷', label:'Borsa İstanbul' },
      { key:'bist',  sym:'ASELS.IS', name:'ASELS', icon:'🇹🇷', label:'Borsa İstanbul' },
      { key:'bist',  sym:'SASA.IS',  name:'SASA',  icon:'🇹🇷', label:'Borsa İstanbul' },
      { key:'cripto',sym:'BTC-USD',  name:'Bitcoin',  icon:'₿', label:'Kripto Paralar' },
      { key:'cripto',sym:'ETH-USD',  name:'Ethereum', icon:'₿', label:'Kripto Paralar' },
      { key:'cripto',sym:'SOL-USD',  name:'Solana',   icon:'₿', label:'Kripto Paralar' },
      { key:'emtia', sym:'GAU=X',    name:'Altın TRY', icon:'🏅', label:'Altın & Emtia' },
      { key:'emtia', sym:'GC=F',     name:'Altın USD', icon:'🏅', label:'Altın & Emtia' },
      { key:'emtia', sym:'USDTRY=X', name:'USD/TRY',  icon:'🏅', label:'Altın & Emtia' },
    ];
    const buckets = {};
    await Promise.all(fallbackSymbols.map(async fb => {
      const d = await proxyFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fb.sym}?range=1d&interval=1d`);
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const prev  = d?.chart?.result?.[0]?.meta?.previousClose || price;
      const rate  = prev && price ? ((price - prev) / prev * 100).toFixed(2) : '0.00';
      if (!buckets[fb.key]) buckets[fb.key] = { key: fb.key, label: fb.label, icon: fb.icon, items: [] };
      if (price) buckets[fb.key].items.push({ text: fb.name, lastprice: price.toFixed(2), rate, _sym: fb.sym });
    }));
    Object.assign(results, buckets);
  }

  if (!Object.keys(results).length) {
    if (container) container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">📡</div><p class="es-text">Piyasa verisi alınamadı.<br>Lütfen sayfayı yenileyin.</p></div>`;
    return;
  }

  marketsCache = { endpoints, results };
  renderMarkets(marketsCache);
}

const CRYPTO_MAP = { 'Bitcoin':'BTC-USD','Ethereum':'ETH-USD','Solana':'SOL-USD','XRP':'XRP-USD','BNB':'BNB-USD','Cardano':'ADA-USD','Avalanche':'AVAX-USD','Tether':'USDT-USD' };

function renderMarkets({ endpoints, results }) {
  // Mini stats bar (Üstteki özet bar)
  const statsBar = document.getElementById('mini-stats-bar');
  if (statsBar && results.bist?.items?.length) {
    const items = results.bist.items.slice(0, 5);
    statsBar.innerHTML = items.map(item => {
      // DÜZELTME: Kripto veya BIST fark etmeksizin tüm olası oran alanlarını kontrol et
      const rateVal = item.rate || item.change || item.changeDay || '0.00';
      const rate = parseFloat(rateVal);
      const cls = rate > 0 ? 't-up' : rate < 0 ? 't-down' : '';
      
      return `<div class="mini-stat">
        <div class="ms-label">${item.text || item.name}</div>
        <div class="ms-val">₺${item.lastprice || item.buying || '-'}</div>
        <div class="ms-chg ${cls}">%${rateVal}</div>
      </div>`;
    }).join('');
  }

  // Market grid (Ana piyasa tablosu)
  const grid = document.getElementById('markets-grid');
  if (!grid) return;

  grid.innerHTML = Object.values(results).map(sec => {
    if (!sec?.items?.length) return '';
    
    const rows = sec.items.map(item => {
      let displayName = item.text || item.name;
      
      // DÜZELTME: Kripto verilerindeki item.code çakışmasını engelliyoruz
      let clickSym = item._sym;
      if (!clickSym) {
        if (sec.key === 'cripto') {
          // Kripto ise sonuna -USD ekle (Örn: BTC-USD)
          clickSym = CRYPTO_MAP[displayName] || (item.code ? item.code + '-USD' : displayName + '-USD');
        } else if (sec.key === 'bist') {
          // BIST ise hisse kodunu al (Örn: ASELS)
          clickSym = item.code || displayName;
        } else {
          clickSym = displayName;
        }
      }
      
      let rawPrice = item.lastprice || item.buying || item.price || '-';
      
      let rateText = item.rate || item.change || item.changeDay || '0.00';
      let rate = parseFloat(rateText);
      
      let cpClass = rate > 0 ? 'cp-up' : rate < 0 ? 'cp-down' : 'cp-flat';
      let sign = rate > 0 ? '+' : '';
      
      return `<div class="asset-row" onclick="updateChart('${clickSym}')">
        <div>
          <div class="ar-name">${displayName}</div>
          <div class="ar-sub">${sec.key === 'bist' ? 'BIST' : sec.key === 'cripto' ? 'Kripto' : 'Emtia'}</div>
        </div>
        <div class="ar-price">₺${rawPrice}</div>
        <div class="change-pill ${cpClass}">${sign}%${rateText}</div>
      </div>`;
    }).join('');

    return `<div class="market-section-card">
      <div class="msc-header"><span>${sec.icon}</span> ${sec.label}</div>
      ${rows}
    </div>`;
  }).join('');
}
// ── SEARCH ────────────────────────────────────────────────────
let searchTimer;
const searchInput    = document.getElementById('global-search');
const searchDropdown = document.getElementById('search-results');

if (searchInput) {
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { searchDropdown.style.display = 'none'; return; }
    searchTimer = setTimeout(() => doSearch(q), 240);
  });
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-section')) {
    if (searchDropdown) searchDropdown.style.display = 'none';
  }
});

async function doSearch(q) {
  const data = await proxyFetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10`);
  if (!data?.quotes?.length) {
    searchDropdown.innerHTML = `<div style="padding:14px;color:var(--text-muted);font-size:13px;">Sonuç bulunamadı</div>`;
    searchDropdown.style.display = 'block';
    return;
  }
  searchDropdown.innerHTML = data.quotes.map(q => {
    const flag = q.exchange === 'IST' ? '🇹🇷' : q.exchange === 'CCC' ? '₿' : '🌐';
    return `<div class="search-result-item" onclick="selectSymbol('${q.symbol}')">
      <div class="sri-left">
        <span class="sri-symbol">${flag} ${q.symbol}</span>
        <span class="sri-name">${q.shortname || q.longname || ''}</span>
      </div>
      <span class="sri-badge">${q.exchange || ''}</span>
    </div>`;
  }).join('');
  searchDropdown.style.display = 'block';
}

function selectSymbol(sym) {
  searchDropdown.style.display = 'none';
  searchInput.value = '';
  updateChart(sym);
}

// ── CHART ─────────────────────────────────────────────────────
async function updateChart(symbol) {
  let sym = symbol.trim().toUpperCase();
  // DÜZELTME: En popüler kriptoları manuel yazdık ki "BTC" gelirse doğrudan BTC-USD yapsın
  const cryptoList = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'USDC', 'ADA', 'AVAX', 'DOGE', 'TRX', 'DOT'];
  
  if (cryptoList.includes(sym)) {
    sym += '-USD';
  } 
  // Sadece gerçek hisseler için .IS ekle
  else if (!sym.includes('.') && !sym.includes('=') && !sym.includes('-') && !sym.match(/[A-Z]{3}-[A-Z]{3}/)) {
    sym += '.IS';
  }
  currentSym = sym;
  showView('analysis-view');

  const loader = document.getElementById('chart-loader');
  const priceEl = document.getElementById('active-price');
  const symEl   = document.getElementById('active-symbol');
  const chgEl   = document.getElementById('price-change');
  const nameEl  = document.getElementById('chart-fullname');

  // 1. ADIM: Loader'ı başlat ve metni sıfırla
  if (loader) {
    loader.style.display = 'flex';
    const loaderText = loader.querySelector('.cl-text');
    if (loaderText) loaderText.textContent = "Grafik verisi alınıyor...";
  }
  
  if (symEl) symEl.textContent = sym;

  // Watchlist yıldızını güncelle
  updateWatchlistBtn(sym);

  try {
    const data = await proxyFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${currentRange}&interval=${currentInterval}`);

    // 2. ADIM: Veri alınamazsa loader'ı kapat ve hatayı göster
    if (!data?.chart?.result?.[0]) {
      if (loader) { 
        loader.querySelector('.cl-text').textContent = `"${sym}" verisi alınamadı`;
        // Kullanıcı hatayı görebilsin diye 2 saniye sonra gizle
        setTimeout(() => { loader.style.display = 'none'; }, 2000);
      }
      toast(`${sym} için veri alınamadı`, 'error');
      renderList(); // Sidebar skeleton'da kalmasın diye listeyi yenile
      return;
    }

    const res    = data.chart.result[0];
    const meta   = res.meta;
    
    // Fiyat verilerini işle
    const prices = res.indicators.quote[0].close.map(p => p === null ? null : parseFloat(p.toFixed(4)));
    const times  = res.timestamp.map(t => {
      const d = new Date(t * 1000);
      if (currentRange === '1d') return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
    });

    const curPrice  = meta.regularMarketPrice || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || curPrice;
    const change    = prevClose ? ((curPrice - prevClose) / prevClose * 100).toFixed(2) : 0;
    const isUp      = parseFloat(change) >= 0;

    // Arayüz elemanlarını güncelle
    if (priceEl) priceEl.textContent = formatPrice(curPrice, sym);
    if (chgEl) {
      chgEl.textContent = `${isUp ? '+' : ''}${change}%`;
      chgEl.className = `change-tag ${isUp ? 'ct-up' : 'ct-down'}`;
    }
    if (nameEl) nameEl.textContent = meta.longName || meta.shortName || sym;

    // Grafik renk ayarları
    const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridClr = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const textClr = isDark ? '#4a6278' : '#7a8fa6';
    const lineClr = isUp ? '#2dbd85' : '#ff5533';
    const fillClr = isUp ? 'rgba(45,189,133,0.07)' : 'rgba(255,85,51,0.07)';

    if (myChart) myChart.destroy();
    myChart = new Chart(document.getElementById('mainChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: times,
        datasets: [{
          data: prices,
          borderColor: lineClr,
          borderWidth: 1.8,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          backgroundColor: fillClr,
          tension: 0.2,
          spanGaps: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#0d1320' : '#fff',
            borderColor: isDark ? '#1c2a3d' : '#dde3ec',
            borderWidth: 1,
            titleColor: isDark ? '#8ba3be' : '#7a8fa6',
            bodyColor: isDark ? '#e4eaf4' : '#0f1923',
            titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
            bodyFont:  { family: "'JetBrains Mono', monospace", size: 13, weight: '500' },
            callbacks: {
              label: ctx => formatPrice(ctx.raw, sym),
            }
          }
        },
        scales: {
          x: {
            display: true,
            ticks: { color: textClr, font: { size: 10, family: "'JetBrains Mono', monospace" }, maxTicksLimit: 8, maxRotation: 0 },
            grid: { display: false },
            border: { display: false }
          },
          y: {
            display: true,
            position: 'right',
            ticks: { color: textClr, font: { size: 10, family: "'JetBrains Mono', monospace" }, callback: v => formatPrice(v, sym) },
            grid: { color: gridClr },
            border: { display: false }
          }
        }
      }
    });

    // Başarılı yükleme sonunda loader'ı kapat
    if (loader) loader.style.display = 'none';

  } catch (error) {
    console.error("Grafik güncelleme hatası:", error);
    if (loader) loader.style.display = 'none';
    toast("Bir ağ hatası oluştu.", "error");
  }

  renderList(); // Sidebar fiyatlarını tazele[cite: 2]
}

function formatPrice(val, sym = '') {
  if (val === null || val === undefined) return '-';
  const isTL = sym.endsWith('.IS') || sym.includes('TRY');
  const prefix = isTL ? '₺' : (sym.includes('USD') || sym.includes('-USD') ? '$' : '');
  return prefix + val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: sym.includes('BTC') ? 0 : 2 });
}

function setTimeframe(range, interval, e) {
  currentRange = range;
  currentInterval = interval;
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  if (e?.target) e.target.classList.add('active');
  updateChart(currentSym);
}

// ── WATCHLIST ─────────────────────────────────────────────────
function updateWatchlistBtn(sym) {
  const btn = document.getElementById('watchlist-btn');
  if (!btn) return;
  const inList = watchlist.includes(sym);
  btn.textContent = inList ? '★ İzlemedeyken' : '☆ İzlemeye Ekle';
  btn.classList.toggle('wl-active', inList);
}

function toggleWatchlist() {
  const sym = currentSym;
  if (watchlist.includes(sym)) {
    watchlist = watchlist.filter(s => s !== sym);
    toast(`${sym} izleme listesinden çıkarıldı`, 'info');
  } else {
    watchlist.push(sym);
    toast(`${sym} izleme listesine eklendi`, 'success');
  }
  safeSave('fs_watchlist', watchlist);
  updateWatchlistBtn(sym);
  if (currentTab === 'watchlist') renderList();
}

// ── PORTFOLIO LIST ────────────────────────────────────────────
async function renderList() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  // DÜZELTME: LocalStorage'daki bozuk veya boş (null) verileri temizle
  watchlist = watchlist.filter(s => s && typeof s === 'string' && s.trim() !== '');
  myAssets = myAssets.filter(a => a && a.symbol);

  const items = currentTab === 'portfolio'
    ? myAssets
    : watchlist.map(s => ({ symbol: s, amount: 0, avgPrice: 0 }));

  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">${currentTab === 'portfolio' ? '📊' : '👀'}</div><p class="es-text">${currentTab === 'portfolio' ? 'Henüz varlık eklemediniz' : 'İzleme listeniz boş'}</p></div>`;
    document.getElementById('total-assets').textContent = '₺0,00';
    return;
  }

  container.innerHTML = items.map(() => `<div class="skeleton sk-row"></div>`).join('');
  let total = 0;

  // Promise.all içine try-catch ekliyoruz ki biri patlarsa hepsi patlamasın
  const cards = await Promise.all(items.map(async item => {
    try {
      const data = await proxyFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?range=1d&interval=1m`);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;
      const prev  = data?.chart?.result?.[0]?.meta?.previousClose || price;
      const chgPct = prev ? ((price - prev) / prev * 100).toFixed(2) : '0.00';
      const isUp  = parseFloat(chgPct) >= 0;
      if (currentTab === 'portfolio') total += price * item.amount;

      const shortSym = item.symbol.replace('.IS','').replace('-USD','').replace('=X','').slice(0, 6);
      const detailTxt = currentTab === 'portfolio'
        ? `${item.amount} Adet · Maliyet: ${item.avgPrice > 0 ? '₺' + item.avgPrice : '-'}`
        : '★ İzleme';

      const delBtn = currentTab === 'portfolio'
        ? `<button class="pi-del" onclick="deleteAsset('${item.symbol}',event)" title="Sil">×</button>`
        : `<button class="pi-del" onclick="removeFromWatchlist('${item.symbol}',event)" title="Çıkar">×</button>`;

      return `
        <div class="pi-item" onclick="updateChart('${item.symbol}')">
          <div class="pi-icon">${shortSym}</div>
          <div class="pi-info">
            <div class="pi-sym">${item.symbol}</div>
            <div class="pi-det">${detailTxt}</div>
          </div>
          <div class="pi-right">
            <div class="pi-price">${formatPrice(price, item.symbol)}</div>
            <div class="pi-chg ${isUp ? 't-up' : 't-down'}">${isUp ? '+' : ''}${chgPct}%</div>
          </div>
          ${delBtn}
        </div>`;
    } catch (error) {
      // Bir veri çekilemezse listeyi çökertme, sadece hata kartı bas
      return `
        <div class="pi-item" style="border-left: 3px solid var(--down);">
          <div class="pi-info"><div class="pi-sym">${item.symbol}</div><div class="pi-det" style="color:var(--down)">Veri alınamadı</div></div>
          ${currentTab === 'portfolio' 
            ? `<button class="pi-del" onclick="deleteAsset('${item.symbol}',event)" style="opacity:1">×</button>` 
            : `<button class="pi-del" onclick="removeFromWatchlist('${item.symbol}',event)" style="opacity:1">×</button>`}
        </div>`;
    }
  }));

  container.innerHTML = cards.join('');
  const totalEl = document.getElementById('total-assets');
  if (totalEl) totalEl.textContent = `₺${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
}

function deleteAsset(sym, e) {
  e.stopPropagation();
  myAssets = myAssets.filter(a => a.symbol !== sym);
  safeSave('fs_assets', myAssets);
  renderList();
  toast(`${sym} portföyden silindi`, 'info');
}

function removeFromWatchlist(sym, e) {
  e.stopPropagation();
  watchlist = watchlist.filter(s => s !== sym);
  safeSave('fs_watchlist', watchlist);
  renderList();
  toast(`${sym} izleme listesinden çıkarıldı`, 'info');
}

function switchTab(tab, e) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (e?.target) e.target.classList.add('active');
  renderList();
}

// ── DISCOVERY GRID ────────────────────────────────────────────
function initDiscovery() {
  const chips = [
    { sym: 'XU100.IS', label: 'BIST 100' },
    { sym: 'USDTRY=X',  label: 'USD/TRY' },
    { sym: 'EURTRY=X',  label: 'EUR/TRY' },
    { sym: 'GAU=X',     label: 'Altın' },
    { sym: 'BTC-USD',   label: 'Bitcoin' },
    { sym: 'ETH-USD',   label: 'Ethereum' },
    { sym: 'THYAO.IS',  label: 'THYAO' },
    { sym: 'GARAN.IS',  label: 'GARAN' },
  ];
  const grid = document.getElementById('discovery-grid');
  if (grid) {
    grid.innerHTML = chips.map(c =>
      `<div class="asset-chip" onclick="updateChart('${c.sym}')">${c.label}</div>`
    ).join('');
  }
}

// ── THEME ─────────────────────────────────────────────────────
function setupTheme() {
  const cb    = document.getElementById('theme-checkbox');
  const saved = localStorage.getItem('fs_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (cb) {
    cb.checked = saved === 'dark';
    cb.addEventListener('change', () => {
      const t = cb.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('fs_theme', t);
      // Redraw chart with new theme colors
      if (myChart) updateChart(currentSym);
    });
  }
}

// ── MODALS ────────────────────────────────────────────────────
function openAuthModal()  { document.getElementById('authModal').classList.add('open'); }
function closeAuthModal() { document.getElementById('authModal').classList.remove('open'); }
function openModal()      { document.getElementById('assetModal').classList.add('open'); document.getElementById('modal-symbol').focus(); }
function closeModal()     { document.getElementById('assetModal').classList.remove('open'); }

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('open');
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    if (searchDropdown) searchDropdown.style.display = 'none';
  }
});

function addNewAsset() {
  const symEl    = document.getElementById('modal-symbol');
  const amtEl    = document.getElementById('modal-amount');
  const priceEl  = document.getElementById('modal-price');
  const sym      = symEl.value.trim().toUpperCase();
  const amount   = parseFloat(amtEl.value);
  const avgPrice = parseFloat(priceEl.value) || 0;

  if (!sym) { toast('Lütfen bir sembol girin', 'error'); symEl.focus(); return; }
  if (!amount || amount <= 0) { toast('Geçerli bir miktar girin', 'error'); amtEl.focus(); return; }

  // Check duplicate
  const existing = myAssets.findIndex(a => a.symbol === sym);
  if (existing >= 0) {
    myAssets[existing].amount += amount;
    toast(`${sym} güncellendi (+${amount} adet)`, 'success');
  } else {
    myAssets.push({ symbol: sym, amount, avgPrice });
    toast(`${sym} portföye eklendi`, 'success');
  }

  safeSave('fs_assets', myAssets);
  symEl.value = ''; amtEl.value = ''; priceEl.value = '';
  closeModal();
  renderList();
}

// ── YENİ: TAM EKRAN PORTFÖY YÖNETİMİ ──────────────────────────
async function renderPortfolioView() {
  const grid = document.getElementById('portfolio-grid');
  const totalEl = document.getElementById('portfolio-total-big');
  if (!grid) return;

  myAssets = myAssets.filter(a => a && a.symbol); // Bozuk verileri temizle

  if (!myAssets.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; padding: 60px 0;"><div class="es-icon" style="font-size:40px;">💼</div><p class="es-text" style="font-size:14px; margin-top:10px;">Portföyünüzde henüz varlık bulunmuyor.<br>Yukarıdaki "Varlık Ekle" butonunu kullanabilirsiniz.</p></div>`;
    if (totalEl) totalEl.textContent = '₺0,00';
    return;
  }

  grid.innerHTML = `<div class="loading-spinner-box" style="grid-column:1/-1"><div class="spin-icon"></div><span>Portföy hesaplanıyor...</span></div>`;

  let total = 0;
  const cards = await Promise.all(myAssets.map(async item => {
    try {
      const data = await proxyFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?range=1d&interval=1m`);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;
      const prev  = data?.chart?.result?.[0]?.meta?.previousClose || price;
      const chgPct = prev ? ((price - prev) / prev * 100).toFixed(2) : '0.00';
      const isUp  = parseFloat(chgPct) >= 0;
      const cpClass = isUp ? 'cp-up' : 'cp-down';
      const sign = isUp ? '+' : '';

      const currentTotal = price * item.amount;
      total += currentTotal;
      const karZarar = (price - item.avgPrice) * item.amount;
      const kzClass = karZarar >= 0 ? 't-up' : 't-down';

      return `<div class="market-section-card" style="padding: 16px;">
        <div style="display:flex; justify-content: space-between; margin-bottom: 12px; align-items:center;">
           <div style="font-family: var(--font-mono); font-size: 16px; font-weight: bold; cursor:pointer;" onclick="updateChart('${item.symbol}')">${item.symbol}</div>
           <div class="change-pill ${cpClass}">${sign}%${chgPct}</div>
        </div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Miktar: <span style="color: var(--text-main); font-weight:500;">${item.amount}</span></div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Maliyet: <span style="color: var(--text-main); font-weight:500;">₺${item.avgPrice}</span></div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Güncel Fiyat: <span style="color: var(--text-main); font-weight:500;">₺${price.toLocaleString('tr-TR', {minimumFractionDigits:2})}</span></div>
        
        <div style="border-top: 1px solid var(--border-light); padding-top: 12px; display:flex; justify-content: space-between; align-items: center;">
           <div>
             <div style="font-size: 11px; color: var(--text-muted);">Toplam Değer</div>
             <div style="font-family: var(--font-mono); font-weight: 600;">₺${currentTotal.toLocaleString('tr-TR', {minimumFractionDigits:2})}</div>
           </div>
           <div style="text-align: right;">
             <div style="font-size: 11px; color: var(--text-muted);">Kâr / Zarar</div>
             <div class="${kzClass}" style="font-family: var(--font-mono); font-weight: 600;">${karZarar >= 0 ? '+' : ''}₺${karZarar.toLocaleString('tr-TR', {minimumFractionDigits:2})}</div>
           </div>
        </div>
        <button class="btn btn-full" style="margin-top: 12px; border-color: var(--down-bg); color: var(--down); background: var(--bg-app);" onclick="deleteAsset('${item.symbol}', event); setTimeout(renderPortfolioView, 300);">Sat / Sil</button>
      </div>`;
    } catch (e) {
      return `<div class="market-section-card" style="padding: 16px; text-align:center;">
         <div style="color: var(--down); margin-bottom: 10px;">Veri alınamadı: ${item.symbol}</div>
         <button class="btn" onclick="deleteAsset('${item.symbol}', event); setTimeout(renderPortfolioView, 300);">Listeden Kaldır</button>
      </div>`;
    }
  }));

  grid.innerHTML = cards.join('');
  if (totalEl) totalEl.textContent = `₺${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  initDiscovery();
  showView('home-news-view');
  // Preload sidebar if analysis mode later
  renderList();
});