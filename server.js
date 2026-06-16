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

// 1. En Çok Yükselenler (Gainers)
app.get('/api/proxy/yahoo-gainers', async (req, res) => {
  try {
    // BIST için en çok yükselen trendleri tarar
    const url = 'https://query1.finance.yahoo.com/v1/finance/trending/TR';
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.json(response.data);
  } catch (error) {
    console.error("Gainers hatası:", error.message);
    res.status(500).json({ error: 'Veri çekilemedi' });
  }
});

// 2. Sektör bazlı sembolleri getiren dinamik listeleme
app.get('/api/proxy/yahoo-sector', async (req, res) => {
  const { sector } = req.query;
  try {
    // Kullanıcının seçtiği sektöre göre Yahoo Finance üzerinde hazır tanımlı sembol setleri veya arama sorguları üretilir
    // Yerel örnek BIST hisselerini eşleştiren bir havuz:
    const sectorPool = {
      teknoloji: [
    'ASELS.IS', 'NETAS.IS', 'KFEIN.IS', 'MIATK.IS',
    'LOGO.IS', 'FONET.IS', 'ARENA.IS', 'INDES.IS',
    'LINK.IS', 'PAPIL.IS', 'SMART.IS', 'ARDYZ.IS',
    'DESPC.IS', 'DGATE.IS', 'ESCOM.IS', 'HTTBT.IS'
  ],

  nasdaq_teknoloji: [
    'MSFT', 'AAPL', 'ADBE', 'MDB', 'PLTR', 'INTU',
    'CRWD', 'DDOG', 'SNOW', 'ORCL', 'GOOGL',
    'META', 'NFLX', 'AMZN', 'SHOP', 'PANW'
  ],

  yapay_zeka_cip: [
    'NVDA', 'AMD', 'AVGO', 'ARM', 'MU',
    'TSM', 'MRVL', 'INTC', 'QCOM', 'ASML'
  ],

  savunma: [
    'ASELS.IS', 'OTKAR.IS', 'KATMR.IS', 'PAPIL.IS',
    'KTOS', 'AVAV'
  ],

  saglik: [
    'ECILC.IS', 'RTALB.IS', 'SELEC.IS', 'MEDTR.IS',
    'DEVA.IS', 'LKMNH.IS', 'MPARK.IS',
    'AMGN', 'GILD', 'VRTX', 'REGN', 'MRNA'
  ],

  enerji: [
    'AKSEN.IS', 'ALARK.IS', 'CWENE.IS', 'EUPWR.IS',
    'ASTOR.IS', 'ENERY.IS', 'SMRTG.IS',
    'ENPH', 'FSLR', 'RUN', 'BE'
  ],

  metal: [
    'EREGL.IS', 'KRDMD.IS', 'ISDMR.IS',
    'BRSAN.IS', 'CEMAS.IS', 'IZMDC.IS',
    'BURCE.IS', 'SARKY.IS'
  ],

  otomotiv: [
    'FROTO.IS', 'TOASO.IS', 'DOAS.IS',
    'TTRAK.IS', 'TMSN.IS', 'KARSN.IS',
    'TSLA', 'RIVN', 'LCID'
  ],

  banka: [
    'AKBNK.IS', 'GARAN.IS', 'YKBNK.IS',
    'ISCTR.IS', 'HALKB.IS', 'VAKBN.IS',
    'TSKB.IS'
  ],

  telekom: [
    'TCELL.IS', 'TTKOM.IS',
    'TMUS', 'CMCSA'
  ],

  havacilik: [
    'THYAO.IS', 'PGSUS.IS',
    'TAVHL.IS', 'CLEBI.IS',
    'JOBY', 'BLDE'
  ],

  perakende: [
    'BIMAS.IS', 'MGROS.IS',
    'SOKM.IS', 'MAVI.IS',
    'COST', 'DLTR', 'ROST', 'ULTA'
  ],

  gida: [
    'ULKER.IS', 'CCOLA.IS',
    'PNSUT.IS', 'TATGD.IS',
    'PEP', 'MDLZ', 'KDP'
  ],

  temettu: [
    'TUPRS.IS', 'EREGL.IS', 'ENKAI.IS',
    'TCELL.IS', 'TTKOM.IS',
    'FROTO.IS', 'BIMAS.IS',
    'CSCO', 'TXN', 'PEP', 'AMGN'
  ],

  buyume: [
    'MIATK.IS', 'KFEIN.IS', 'CWENE.IS',
    'ASTOR.IS', 'SMRTG.IS', 'EUPWR.IS',
    'NVDA', 'PLTR', 'CRWD', 'DDOG',
    'SNOW', 'ARM', 'RIVN'
  ],

  deger: [
    'AKBNK.IS', 'GARAN.IS', 'ISCTR.IS',
    'YKBNK.IS', 'EREGL.IS', 'TUPRS.IS',
    'INTC', 'PYPL', 'CSCO'
  ],

  yuksek_risk: [
    'MIATK.IS', 'REEDR.IS', 'KATMR.IS',
    'PAPIL.IS', 'RTALB.IS',
    'RIVN', 'LCID', 'SOFI',
    'PLTR', 'JOBY'
  ]
    };

    const symbols = sectorPool[sector] || ['XU100.IS'];
    
    // Sembollerin detaylarını toplu olarak Yahoo'dan çekelim
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.json(response.data);
  } catch (error) {
    console.error("Sektör proxy hatası:", error.message);
    res.status(500).json({ error: 'Sektör verisi çekilemedi' });
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