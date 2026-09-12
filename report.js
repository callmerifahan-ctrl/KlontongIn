// ===================================
// CONFIG & SUPABASE SETUP
// ===================================
const SUPABASE_URL = "https://dyyzsuleugpgiqutebwv.supabase.co";
const SUPABASE_KEY = "sb_publishable_hKWVFsDZC539-T3nVyS13g_ME3HC0AP";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

// ===================================
// DOM ELEMENTS
// ===================================
const reportOmzet = document.getElementById("reportOmzet");
const reportKeuntungan = document.getElementById("reportKeuntungan");
const reportTotalTransaksi = document.getElementById("reportTotalTransaksi");
const reportTerjual = document.getElementById("reportTerjual");
const topProductsList = document.getElementById("topProductsList");

// ===================================
// UTILITIES
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

// ===================================
// LOAD & CALCULATE REPORT
// ===================================
async function loadReportData() {
    const { data: barangData, error: errBarang } = await supabaseClient
        .from("barang")
        .select("*");

    if (errBarang) {
        console.error(errBarang);
        alert("Gagal memuat data barang!");
        return;
    }

    const barangMap = {};
    (barangData || []).forEach(b => {
        barangMap[b.id] = b;
    });

    const { data: trxData, error: errTrx } = await supabaseClient
        .from("transaksi")
        .select("*");

    if (errTrx) {
        console.error(errTrx);
        alert("Gagal memuat data transaksi!");
        return;
    }

    const transactions = trxData || [];

    let totalOmzet = 0;
    let totalKeuntungan = 0;
    let totalItemTerjual = 0;
    const productSales = {};

    transactions.forEach(trx => {
        totalOmzet += (trx.total || 0);
        const items = Array.isArray(trx.item) ? trx.item : [];

        items.forEach(item => {
            const qty = item.qty || 0;
            const sellPrice = item.price || 0;
            const barang = barangMap[item.id];
            const buyPrice = barang ? (barang.harga_beli || 0) : 0;

            totalItemTerjual += qty;
            totalKeuntungan += (sellPrice - buyPrice) * qty;

            if (!productSales[item.name]) {
                productSales[item.name] = 0;
            }
            productSales[item.name] += qty;
        });
    });

    if (reportOmzet) reportOmzet.textContent = formatRupiah(totalOmzet);
    if (reportKeuntungan) reportKeuntungan.textContent = formatRupiah(totalKeuntungan);
    if (reportTotalTransaksi) reportTotalTransaksi.textContent = transactions.length;

    // Biar angka desimal dari timbangan gak bocor (floating point bug)
    function formatQty(qty) {
        const num = parseFloat(qty || 0);
        return Number.isInteger(num) ? num : parseFloat(num.toFixed(2));
    }

    // Pas mau nampilin ke HTML:
    const reportTerjual = document.getElementById("reportTerjual");
    if (reportTerjual) {
        reportTerjual.textContent = formatQty(totalItemTerjual);
    }

    if (topProductsList) {
        topProductsList.replaceChildren();
        const sortedProducts = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1]);

        if (sortedProducts.length === 0) {
            const li = document.createElement("li");
            li.textContent = "Belum ada penjualan.";
            topProductsList.appendChild(li);
            return;
        }

        sortedProducts.forEach(([name, qty]) => {
            const li = document.createElement("li");
            li.style.margin = "8px 0";
            li.innerHTML = `<strong>${name}</strong>: ${qty} pcs terjual`;
            topProductsList.appendChild(li);
        });
    }
}

loadReportData();