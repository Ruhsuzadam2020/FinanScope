require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Frontend dosyalarını 'public' klasöründen sun
app.use(express.static(path.join(__dirname, 'public')));

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

// 3. Gemini AI Endpoint'i
app.post('/api/ai-analyze', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    res.json(response.data);
  } catch (error) {
    console.error("Gemini API Hatası:", error?.response?.data || error.message);
    res.status(500).json({ error: 'AI hatası oluştu' });
  }
});

// 4. CollectAPI Proxy (Haberler)
app.get('/api/news', async (req, res) => {
  try {
    const response = await axios.get("https://api.collectapi.com/news/getNews?country=tr&tag=economy", {
      headers: { "authorization": process.env.COLLECT_API_KEY }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Haberler alınamadı' });
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