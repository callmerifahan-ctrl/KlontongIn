// ===================================
// CONFIG & SUPABASE SETUP
// ===================================
const SUPABASE_URL = "https://dyyzsuleugpgiqutebwv.supabase.co";
const SUPABASE_KEY = "sb_publishable_hKWVFsDZC539-T3nVyS13g_ME3HC0AP";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// ===================================
// STATE & DOM ELEMENTS
// ===================================
let allTransactions = [];
let allProductsMap = {};
let currentFilter = "today"; // 'today', 'week', 'month', 'all'

const reportOmzet = document.getElementById("reportOmzet");
const reportKeuntungan = document.getElementById("reportKeuntungan");
const reportTotalTransaksi = document.getElementById("reportTotalTransaksi");
const reportTerjual = document.getElementById("reportTerjual");
const topProductsList = document.getElementById("topProductsList");

const btnFilterToday = document.getElementById("btnFilterToday");
const btnFilterWeek = document.getElementById("btnFilterWeek");
const btnFilterMonth = document.getElementById("btnFilterMonth");
const btnFilterAll = document.getElementById("btnFilterAll");

// ===================================
// UTILITIES
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

function formatQty(qty) {
    const num = parseFloat(qty || 0);
    return Number.isInteger(num) ? num : parseFloat(num.toFixed(2));
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

// ===================================
// DATA LOADERS
// ===================================
async function loadData() {
    // 1. Ambil data modal/harga_beli dari master barang
    const { data: barangData } = await supabaseClient.from("barang").select("id, nama_barang, harga_beli");
    if (barangData) {
        barangData.forEach(p => {
            allProductsMap[p.id] = parseFloat(p.harga_beli || 0);
            allProductsMap[p.nama_barang] = parseFloat(p.harga_beli || 0);
        });
    }

    // 2. Ambil transaksi
    const { data: trxData, error } = await supabaseClient.from("transaksi").select("*").order("tanggal", { ascending: false });
    if (error) {
        console.error("Gagal ambil laporan:", error);
        return;
    }

    allTransactions = trxData || [];
    renderReport();
}

// ===================================
// REPORT CALCULATOR & RENDERER
// ===================================
function filterTransactions() {
    const now = new Date();
    
    return allTransactions.filter(trx => {
        const trxDate = new Date(trx.tanggal);

        if (currentFilter === "today") {
            return isSameDay(trxDate, now);
        } else if (currentFilter === "week") {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 7);
            return trxDate >= sevenDaysAgo;
        } else if (currentFilter === "month") {
            return trxDate.getFullYear() === now.getFullYear() && trxDate.getMonth() === now.getMonth();
        }
        return true; // 'all'
    });
}

function renderReport() {
    const filteredTrx = filterTransactions();

    let totalOmzet = 0;
    let totalKeuntungan = 0;
    let totalItemTerjual = 0;
    let productSalesCounter = {};

    filteredTrx.forEach(trx => {
        totalOmzet += parseFloat(trx.total || 0);

        const itemsArr = Array.isArray(trx.item) ? trx.item : [];
        itemsArr.forEach(i => {
            const qty = parseFloat(i.qty || 0);
            totalItemTerjual += qty;

            // Hitung estimasi modal
            const hargaBeli = allProductsMap[i.id] || allProductsMap[i.name] || 0;
            const itemRevenue = parseFloat(i.subtotal || (i.price * qty));
            const itemProfit = itemRevenue - (hargaBeli * qty);

            totalKeuntungan += itemProfit;

            // Counter produk terlaris
            const name = i.name || "Produk";
            productSalesCounter[name] = (productSalesCounter[name] || 0) + qty;
        });
    });

    // Display ringkasan
    if (reportOmzet) reportOmzet.textContent = formatRupiah(totalOmzet);
    if (reportKeuntungan) reportKeuntungan.textContent = formatRupiah(Math.max(0, totalKeuntungan));
    if (reportTotalTransaksi) reportTotalTransaksi.textContent = filteredTrx.length;
    if (reportTerjual) reportTerjual.textContent = `${formatQty(totalItemTerjual)} Item`;

    // Display Top Produk
    if (topProductsList) {
        topProductsList.replaceChildren();
        
        const sortedProducts = Object.entries(productSalesCounter)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Ambil Top 5

        if (sortedProducts.length === 0) {
            topProductsList.innerHTML = `<li style="color:#888;">Belum ada penjualan di periode ini</li>`;
            return;
        }

        sortedProducts.forEach(([name, qty]) => {
            const li = document.createElement("li");
            li.style.marginBottom = "6px";
            li.style.fontSize = "14px";
            li.innerHTML = `<strong>${name}</strong>: ${formatQty(qty)} terjual`;
            topProductsList.appendChild(li);
        });
    }
}

function setActiveFilterBtn(activeBtn) {
    [btnFilterToday, btnFilterWeek, btnFilterMonth, btnFilterAll].forEach(btn => {
        if (!btn) return;
        btn.className = "btn btn-secondary";
        btn.style.background = "";
        btn.style.color = "";
        btn.style.fontWeight = "normal";
    });

    activeBtn.className = "btn";
    activeBtn.style.background = "#D67A67";
    activeBtn.style.color = "white";
    activeBtn.style.fontWeight = "bold";
}

// ===================================
// INITIALIZATION
// ===================================
function init() {
    if (btnFilterToday) btnFilterToday.addEventListener("click", () => { currentFilter = "today"; setActiveFilterBtn(btnFilterToday); renderReport(); });
    if (btnFilterWeek) btnFilterWeek.addEventListener("click", () => { currentFilter = "week"; setActiveFilterBtn(btnFilterWeek); renderReport(); });
    if (btnFilterMonth) btnFilterMonth.addEventListener("click", () => { currentFilter = "month"; setActiveFilterBtn(btnFilterMonth); renderReport(); });
    if (btnFilterAll) btnFilterAll.addEventListener("click", () => { currentFilter = "all"; setActiveFilterBtn(btnFilterAll); renderReport(); });

    loadData();
}

init();