require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

// 2. Firebase Ayarlarını Güvenli Şekilde Frontend'e İlet
app.get('/api/firebase-config', (req, res) => {
  res.json({
    apiKey: process.env.FB_API_KEY,
    authDomain: process.env.FB_AUTH_DOMAIN,
    projectId: process.env.FB_PROJECT_ID,
    storageBucket: process.env.FB_STORAGE_BUCKET,
    messagingSenderId: process.env.FB_MESSAGING_SENDER_ID,
    appId: process.env.FB_APP_ID
  });
});

app.post('/api/ai-analyze', async (req, res) => {
  const { prompt } = req.body;

  try {
    // SDK, .env dosyasındaki GEMINI_API_KEY değerini otomatik olarak tanır!
    const ai = new GoogleGenAI({});

    // YENİ HALİ:
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Google'ın yeni resmi SDK dokümanındaki model
      contents: prompt,
    });

    // Artık o karmaşık "candidates[0]..." yapısı yerine direkt metni gönderiyoruz
    res.json({ text: response.text });
    
  } catch (error) {
    console.error("Gemini SDK Hatası:", error);
    res.status(500).json({ error: 'AI hatası oluştu' });
  }
});

let cachedCookie = '';
let cachedCrumb = '';

async function getYahooAuth() {
  if (cachedCookie && cachedCrumb) return { cookie: cachedCookie, crumb: cachedCrumb };
  try {
    // 1. Yahoo'dan oturum çerezi (Cookie) al
    const cookieRes = await axios.get('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      validateStatus: () => true // 404/502 dönse bile çerezi verir
    });
    const setCookieHeader = cookieRes.headers['set-cookie'];
    if (setCookieHeader) cachedCookie = setCookieHeader[0].split(';')[0];

    // 2. Bu çerezle Crumb (Güvenlik şifresi) al
    const crumbRes = await axios.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cachedCookie
      }
    });
    cachedCrumb = crumbRes.data;
    return { cookie: cachedCookie, crumb: cachedCrumb };
  } catch (e) {
    console.error("Yahoo Auth Hatası:", e.message);
    return { cookie: '', crumb: '' };
  }
}

// Yahoo Finance İçin Özel Backend Proxy'miz
app.get('/api/proxy/yahoo', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });
    
    // DEDEKTİF: Terminalde hangi hatalı linkin arandığını bize söyleyecek
    console.log("Yahoo'da Aranan URL:", url); 

    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
       console.warn("Yahoo bu sembolü bulamadı (404).");
       return res.status(404).json({ error: 'Sembol bulunamadı' });
    }
    console.error("Yahoo Proxy Hatası:", error.message);
    res.status(500).json({ error: 'Veri çekilemedi' });
  }
});

app.get('/api/proxy/yahoo-summary', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Sembol gerekli' });
    
    // Güvenlik biletini al
    const { cookie, crumb } = await getYahooAuth();
    
    // URL'nin sonuna &crumb= ekliyoruz
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,financialData,calendarEvents&crumb=${crumb}`;
    
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookie // Aldığımız çerezi yolluyoruz
      },
      timeout: 8000
    });
    res.json(response.data);
  } catch (error) {
    // Eğer güvenlik bileti zaman aşımına uğradıysa sıfırla ki bir sonrakinde yenisini alsın
    if (error.response && error.response.status === 401) {
      cachedCookie = ''; cachedCrumb = '';
    }
    // Hata olsa bile frontend'i çökertmemek için boş obje dön
    res.json({ quoteSummary: { result: [] } });
  }
});
// --- YENİ HABER ENDPOINT'İ (Daha fazla haber) ---
app.get('/api/news', async (req, res) => {
  try {
    const apiKey = process.env.COLLECT_API_KEY;
    console.log("COLLECT_API_KEY mevcut mu:", !!apiKey);
    console.log("COLLECT_API_KEY ilk 10 karakter:", apiKey ? apiKey.substring(0, 10) : 'YOK');

    const tags = ['economy', 'exchange', 'finance', 'general', 'invest'];
    let allNews = [];
    
    for (let tag of tags) {
      try {
        const response = await axios.get(`https://api.collectapi.com/news/getNews?country=tr&tag=${tag}`, {
          headers: { "authorization": apiKey }
        });
        console.log(`Tag [${tag}] sonuç:`, response.data?.success, '| Haber sayısı:', response.data?.result?.length);
        if (response.data && response.data.success) {
          allNews = allNews.concat(response.data.result);
        }
      } catch (tagErr) {
        console.warn(`Tag [${tag}] başarısız:`, tagErr.message);
      }
      // Rate limit aşmamak için taglar arasında 1.2 saniye bekle
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    
    const uniqueNews = Array.from(new Map(allNews.map(item => [item.url, item])).values());
    res.json({ success: true, result: uniqueNews });
  } catch (error) {
    console.error("Haber hatası detay:", error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: 'Haberler alınamadı', detay: error.response?.data || error.message });
  }
});

// --- YENİ AI PORTFÖY YÖNETİCİSİ ENDPOINT'İ ---
app.post('/api/ai-portfolio', async (req, res) => {
  const { budget, risk, category, duration } = req.body;
  try {
    const ai = new GoogleGenAI({});
    // AI'yı katı kurallarla yapılandırıyoruz ki sadece JSON döndürsün
    const prompt = `Sen uzman bir fon yöneticisisin. Elimde ${budget}₺ bütçe var. 
    Risk seviyem: ${risk}. Odaklanmak istediğim varlık sınıfı: ${category}. Vade: ${duration}.
    Bana mantıklı bir portföy dağılımı yap.
    SADECE VE SADECE aşağıdaki JSON formatında bir dizi döndür, hiçbir ek metin, açıklama veya markdown backtick'i yazma:
    [
      {"symbol": "THYAO.IS", "amount": 100, "avgPrice": 0},
      {"symbol": "BTC-USD", "amount": 0.05, "avgPrice": 0}
    ]`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    // AI bazen ```json etiketleri koyabiliyor, onları temizliyoruz
    let rawText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const portfolio = JSON.parse(rawText);
    
    res.json({ success: true, portfolio });
  } catch (error) {
    console.error("AI Portföy Hatası:", error);
    res.status(500).json({ error: 'AI portföy oluşturamadı.' });
  }
});

// --- YENİ: Yükselenler, Düşenler ve Sektörel Veri Proxy Endpoint'leri ---

// --- YENİ: Yükselenler, Düşenler ve Sektörel Veri Proxy Endpoint'leri ---

// 1. En Çok Yükselenler (Gainers) - Stabil V8 Endpoint'i
// --- YENİ: BIST GERÇEK ZAMANLI EN ÇOK YÜKSELENLER (DİNAMİK) ---
app.get('/api/proxy/yahoo-gainers', async (req, res) => {
  try {
    // Yahoo'nun BIST En Çok Yükselenler (Gainers) canlı HTML/JSON tarayıcı endpoint'i
    const url = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=15&scrIds=day_gainers&regions=TR';
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    // Yahoo screener'dan dönen dinamik hisse listesi
    const quotes = response.data?.finance?.result?.[0]?.quotes || [];
    
    if (!quotes.length) {
      return res.json({ success: true, result: [] });
    }

    // Gelen ham veriyi frontend'in anlayacağı temiz formata dönüştürüyoruz
    const results = quotes.map(q => {
      const price = q.regularMarketPrice || 0;
      const chgPct = q.regularMarketChangePercent || 0;

      return {
        symbol: q.symbol,
        shortName: q.shortName || q.symbol.replace('.IS', ''),
        regularMarketPrice: price,
        regularMarketChangePercent: chgPct
      };
    });

    // Oranları büyükten küçüğe garantiye alarak sırala
    results.sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);

    res.json({ success: true, result: results });

  } catch (error) {
    console.error("Dinamik Gainers hatası:", error.message);
    res.json({ success: false, result: [] });
  }
});
// --- YENİ: BIST GERÇEK ZAMANLI EN ÇOK DÜŞENLER (DİNAMİK) ---
app.get('/api/proxy/yahoo-losers', async (req, res) => {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=15&scrIds=day_losers&regions=TR';
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }});
    const quotes = response.data?.finance?.result?.[0]?.quotes || [];
    
    const results = quotes.map(q => ({
      symbol: q.symbol,
      shortName: q.shortName || q.symbol.replace('.IS', ''),
      regularMarketPrice: q.regularMarketPrice || 0,
      regularMarketChangePercent: q.regularMarketChangePercent || 0
    }));

    results.sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent); // En çok düşen en üstte
    res.json({ success: true, result: results });
  } catch (error) {
    res.json({ success: false, result: [] });
  }
});

// 2. Sektör bazlı sembolleri getiren dinamik listeleme - Stabil V8 Endpoint'i
app.get('/api/proxy/yahoo-sector', async (req, res) => {
  const { sector } = req.query;
  const cleanSector = (sector || '').trim(); // HTML'deki " temettu" gibi boşlukları temizler
  
  try {
    const sectorPool = {
      teknoloji: ['ASELS.IS', 'NETAS.IS', 'KFEIN.IS', 'MIATK.IS', 'LOGO.IS', 'FONET.IS', 'ARENA.IS', 'INDES.IS', 'LINK.IS', 'PAPIL.IS', 'SMART.IS', 'ARDYZ.IS'],
      kripto: ['BTC-USD', 'ETH-USD', 'BNB-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD', 'AVAX-USD', 'DOGE-USD', 'DOT-USD', 'LINK-USD', 'MATIC-USD', 'TRX-USD', 'LTC-USD', 'BCH-USD', 'UNI-USD'],
      nasdaq: ['MSFT', 'AAPL', 'ADBE', 'MDB', 'PLTR', 'INTU', 'CRWD', 'DDOG', 'SNOW', 'ORCL', 'GOOGL', 'META', 'NFLX', 'AMZN', 'SHOP'],
      yapayzeka: ['NVDA', 'AMD', 'AVGO', 'ARM', 'MU', 'TSM', 'MRVL', 'INTC', 'QCOM', 'ASML'],
      savunma: ['ASELS.IS', 'OTKAR.IS', 'KATMR.IS', 'PAPIL.IS', 'KTOS', 'AVAV'],
      saglik: ['ECILC.IS', 'RTALB.IS', 'SELEC.IS', 'MEDTR.IS', 'DEVA.IS', 'LKMNH.IS', 'MPARK.IS', 'AMGN', 'GILD', 'VRTX', 'REGN', 'MRNA'],
      enerji: ['AKSEN.IS', 'ALARK.IS', 'CWENE.IS', 'EUPWR.IS', 'ASTOR.IS', 'ENERY.IS', 'SMRTG.IS', 'ENPH', 'FSLR', 'RUN', 'BE'],
      metal: ['EREGL.IS', 'KRDMD.IS', 'ISDMR.IS', 'BRSAN.IS', 'CEMAS.IS', 'IZMDC.IS', 'BURCE.IS', 'SARKY.IS'],
      otomotiv: ['FROTO.IS', 'TOASO.IS', 'DOAS.IS', 'TTRAK.IS', 'TMSN.IS', 'KARSN.IS', 'TSLA', 'RIVN', 'LCID'],
      banka: ['AKBNK.IS', 'GARAN.IS', 'YKBNK.IS', 'ISCTR.IS', 'HALKB.IS', 'VAKBN.IS', 'TSKB.IS'],
      telekom: ['TCELL.IS', 'TTKOM.IS', 'TMUS', 'CMCSA'],
      havacilik: ['THYAO.IS', 'PGSUS.IS', 'TAVHL.IS', 'CLEBI.IS', 'JOBY', 'BLDE'],
      perakende: ['BIMAS.IS', 'MGROS.IS', 'SOKM.IS', 'MAVI.IS', 'COST', 'DLTR', 'ROST', 'ULTA'],
      gida: ['ULKER.IS', 'CCOLA.IS', 'PNSUT.IS', 'TATGD.IS', 'PEP', 'MDLZ', 'KDP'],
      temettu: ['TUPRS.IS', 'EREGL.IS', 'ENKAI.IS', 'TCELL.IS', 'TTKOM.IS', 'FROTO.IS', 'BIMAS.IS', 'CSCO', 'TXN', 'PEP', 'AMGN']
    };

    const symbols = sectorPool[cleanSector] || ['XU100.IS'];
    const results = [];

    await Promise.all(symbols.map(async (sym) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const meta = response.data?.chart?.result?.[0]?.meta;
        if (meta) {
          const price = meta.regularMarketPrice;
          
          // 1. KADEMELİ KORUMA: previousClose yoksa chartPreviousClose'u, o da yoksa açılış (open) fiyatını yedek alıyoruz
          const prev = meta.previousClose || meta.chartPreviousClose || meta.open || price;
          
          let chgPct = 0;
          if (prev && price && prev !== 0) {
            chgPct = ((price - prev) / prev) * 100;
          } else if (meta.regularMarketChangePercent !== undefined) {
            // 2. KADEMELİ KORUMA: Hesaplama başarısız olursa Yahoo'nun kendi hazır oranını çekiyoruz
            chgPct = meta.regularMarketChangePercent;
          }

          results.push({ 
            symbol: sym, 
            shortName: sym.replace('.IS', ''), 
            regularMarketPrice: price, 
            regularMarketChangePercent: chgPct 
          });
        }
      } catch (e) { /* sessiz atla */ }
    }));

    res.json({ success: true, result: results });
  } catch (error) {
    console.error("Sektör proxy hatası:", error.message);
    res.json({ success: false, result: [] });
  }
});

// 5. CollectAPI Proxy (Piyasalar)
app.get('/api/economy/:type', async (req, res) => {
  const { type } = req.params;
  try {
    const response = await axios.get(`https://api.collectapi.com/economy/${type}`, {
      headers: { "authorization": process.env.COLLECT_API_KEY }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Piyasa verisi alınamadı' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));