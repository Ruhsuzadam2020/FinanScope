// SRS 3.4.2: Varlık (Asset) Yapısı ve Başlangıç Verisi Yönetimi
let myAssets = JSON.parse(localStorage.getItem('finanscope_assets')) || [
    { symbol: 'THYAO.IS', amount: 100, avgPrice: 250.00 },
    { symbol: 'BTC-USD', amount: 0.05, avgPrice: 60000 }
];

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', () => {
    refreshUI();
    setupEventListeners();
});

// SRS 3.2.1: Varlık Maliyet Analizi ve Dinamik Liste Oluşturma
function refreshUI() {
    const assetList = document.getElementById('user-assets');
    const totalAssetsEl = document.getElementById('total-assets');
    let totalPortfolioValue = 0;

    assetList.innerHTML = '';

    myAssets.forEach((asset, index) => {
        // SRS 3.1.3: Gerçek projede API'den gelecek anlık fiyat simülasyonu
        const currentPrice = getMockPrice(asset.symbol);
        const currentValue = currentPrice * asset.amount;
        const profitLoss = (currentPrice - asset.avgPrice) * asset.amount;
        const profitPercent = ((currentPrice - asset.avgPrice) / asset.avgPrice) * 100;

        totalPortfolioValue += currentValue;

        assetList.innerHTML += `
            <div class="summary-card asset-item">
                <div class="asset-info">
                    <strong>${asset.symbol}</strong>
                    <span>${asset.amount} Adet</span>
                </div>
                <div class="asset-stats">
                    <p>Maliyet: ₺${(asset.avgPrice * asset.amount).toLocaleString()}</p>
                    <p class="${profitLoss >= 0 ? 'text-green' : 'text-red'}">
                        ${profitLoss >= 0 ? '+' : ''}₺${profitLoss.toFixed(2)} 
                        (%${profitPercent.toFixed(2)})
                    </p>
                </div>
                <button onclick="deleteAsset(${index})" class="delete-btn">×</button>
            </div>
        `;
    });

    totalAssetsEl.innerText = `₺${totalPortfolioValue.toLocaleString()}`;
    saveToStorage();
}

// SRS 3.3.1: Yeni Varlık Ekleme (UC-01)
function addNewAsset() {
    const symbol = document.getElementById('modal-symbol').value.toUpperCase();
    const amount = parseFloat(document.getElementById('modal-amount').value);
    const price = parseFloat(document.getElementById('modal-price').value);

    if (symbol && amount > 0 && price > 0) {
        myAssets.push({ symbol, amount, avgPrice: price });
        closeModal();
        refreshUI();
        // Formu temizle
        document.querySelectorAll('.modal-content input').forEach(input => input.value = '');
    } else {
        alert("Lütfen tüm alanları geçerli değerlerle doldurun.");
    }
}

// Yardımcı Fonksiyonlar
function deleteAsset(index) {
    myAssets.splice(index, 1);
    refreshUI();
}

function saveToStorage() {
    localStorage.setItem('finanscope_assets', JSON.stringify(myAssets));
}

// SRS 3.1.3: Taslak API Simülatörü
function getMockPrice(symbol) {
    const prices = { 'THYAO.IS': 285.50, 'BTC-USD': 65400, 'XU100': 9120 };
    return prices[symbol] || (Math.random() * 1000); // Tanımsızsa rastgele fiyat dön
}

// Modal ve Event Yönetimi
function openModal() { document.getElementById('assetModal').style.display = 'flex'; }
function closeModal() { document.getElementById('assetModal').style.display = 'none'; }

function setupEventListeners() {
    // Dışarı tıklayınca modalı kapat
    window.onclick = (event) => {
        const modal = document.getElementById('assetModal');
        if (event.target == modal) closeModal();
    };
}
// Tema Değiştirme Mantığı
function setupTheme() {
    const themeCheckbox = document.getElementById('checkbox'); // HTML'deki ID ile aynı olmalı
    const currentTheme = localStorage.getItem('theme');

    // 1. Sayfa yüklendiğinde kayıtlı temayı uygula
    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark' && themeCheckbox) {
            themeCheckbox.checked = true;
        }
    }

    // 2. Tıklama olayını dinle
    if (themeCheckbox) {
        themeCheckbox.addEventListener('change', function(e) {
            if (e.target.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
            }
        });
    }
}

// Mevcut DOMContentLoaded içine ekle
document.addEventListener('DOMContentLoaded', () => {
    refreshUI();
    setupEventListeners();
    setupTheme(); // Temayı burada başlatıyoruz
});