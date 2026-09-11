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
let debtTransactions = [];
let selectedTransaction = null;

const debtList = document.getElementById("debtList");
const totalDebtAmount = document.getElementById("totalDebtAmount");
const searchDebt = document.getElementById("searchDebt");

const payModal = document.getElementById("payModal");
const modalCustomerInfo = document.getElementById("modalCustomerInfo");
const modalRemainingInfo = document.getElementById("modalRemainingInfo");
const payAmountInput = document.getElementById("payAmountInput");
const btnConfirmPayDebt = document.getElementById("btnConfirmPayDebt");
const btnClosePayModal = document.getElementById("btnClosePayModal");

// ===================================
// UTILITIES
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ===================================
// DATABASE OPERATIONS
// ===================================
async function loadDebts() {
    const { data, error } = await supabaseClient
        .from("transaksi")
        .select("*")
        .eq("status_bon", true)
        .gt("sisa_utang", 0)
        .order("tanggal", { ascending: false });

    if (error) {
        console.error(error);
        alert("Gagal mengambil data utang!");
        return;
    }

    debtTransactions = data || [];
    renderDebts();
}

// ===================================
// RENDERERS
// ===================================
function renderDebts() {
    debtList.replaceChildren();
    const keyword = searchDebt ? searchDebt.value.toLowerCase().trim() : "";

    const filtered = debtTransactions.filter(t => 
        (t.nama_pelanggan || "").toLowerCase().includes(keyword) ||
        (t.kode_transaksi || "").toLowerCase().includes(keyword)
    );

    const grandTotal = filtered.reduce((sum, t) => sum + (t.sisa_utang || 0), 0);
    totalDebtAmount.textContent = formatRupiah(grandTotal);

    if (filtered.length === 0) {
        debtList.innerHTML = `<p style="text-align:center; color:#888; padding: 20px;">Tidak ada catatan utang / bon aktif 🎉</p>`;
        return;
    }

    filtered.forEach(t => {
        debtList.appendChild(createDebtCard(t));
    });
}

function createDebtCard(t) {
    const card = document.createElement("div");
    card.style.background = "#fff";
    card.style.padding = "14px";
    card.style.borderRadius = "8px";
    card.style.marginBottom = "12px";
    card.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
    card.style.borderLeft = "5px solid #e67e22";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const name = document.createElement("h3");
    name.style.margin = "0";
    name.textContent = t.nama_pelanggan || "Pelanggan Tanpa Nama";

    const remaining = document.createElement("span");
    remaining.style.fontWeight = "bold";
    remaining.style.color = "#d32f2f";
    remaining.style.fontSize = "16px";
    remaining.textContent = formatRupiah(t.sisa_utang);

    header.append(name, remaining);

    const dateInfo = document.createElement("small");
    dateInfo.style.color = "#888";
    dateInfo.style.display = "block";
    dateInfo.style.marginTop = "4px";
    dateInfo.textContent = `${t.kode_transaksi} • ${formatDate(t.tanggal)}`;

    // Rincian Barang
    const itemsSummary = document.createElement("p");
    itemsSummary.style.margin = "8px 0";
    itemsSummary.style.fontSize = "13px";
    itemsSummary.style.color = "#555";
    const itemNames = (t.item || []).map(i => `${i.name} (${i.qty})`).join(", ");
    itemsSummary.textContent = `Barang: ${itemNames}`;

    // Tombol Aksi
    const actionBox = document.createElement("div");
    actionBox.style.display = "flex";
    actionBox.style.gap = "8px";
    actionBox.style.marginTop = "10px";

    const btnPay = document.createElement("button");
    btnPay.className = "btn btn-success";
    btnPay.style.flex = "1";
    btnPay.style.padding = "8px";
    btnPay.style.fontSize = "13px";
    btnPay.textContent = "💵 Bayar / Cicil";
    btnPay.addEventListener("click", () => openPayModal(t));

    const btnWA = document.createElement("button");
    btnWA.className = "btn";
    btnWA.style.background = "#25D366";
    btnWA.style.color = "#fff";
    btnWA.style.padding = "8px";
    btnWA.style.fontSize = "13px";
    btnWA.textContent = "📲 Kirim WA";
    btnWA.addEventListener("click", () => sendWA(t));

    actionBox.append(btnPay, btnWA);
    card.append(header, dateInfo, itemsSummary, actionBox);

    return card;
}

// ===================================
// HANDLERS
// ===================================
function openPayModal(transaction) {
    selectedTransaction = transaction;
    modalCustomerInfo.textContent = `Pelanggan: ${transaction.nama_pelanggan}`;
    modalRemainingInfo.textContent = `Sisa Utang: ${formatRupiah(transaction.sisa_utang)}`;
    payAmountInput.value = transaction.sisa_utang; // Default diisi lunas
    payModal.style.display = "flex";
}

async function processPayDebt() {
    if (!selectedTransaction) return;

    const payInput = parseInt(payAmountInput.value, 10) || 0;
    if (payInput <= 0) return alert("Masukkan nominal pembayaran yang valid!");

    const newRemaining = selectedTransaction.sisa_utang - payInput;
    const newBayarTotal = (selectedTransaction.bayar || 0) + payInput;
    const isLunas = newRemaining <= 0;

    btnConfirmPayDebt.disabled = true;

    const { error } = await supabaseClient
        .from("transaksi")
        .update({
            bayar: newBayarTotal,
            sisa_utang: Math.max(0, newRemaining),
            status_bon: !isLunas
        })
        .eq("id", selectedTransaction.id);

    btnConfirmPayDebt.disabled = false;

    if (error) {
        console.error(error);
        alert("Gagal memproses pembayaran utang!");
        return;
    }

    payModal.style.display = "none";
    alert(isLunas ? "🎉 Bon telah LUNAS!" : `✅ Pembayaran dicatat. Sisa utang: ${formatRupiah(newRemaining)}`);
    await loadDebts();
}

function sendWA(t) {
    const itemNames = (t.item || []).map(i => `- ${i.name} (${i.qty}x)`).join("\n");
    const pesan = `Halo kak ${t.nama_pelanggan}, sekadar menginfokan catatan bon di Warung Ibu Irma:\n\n*Rincian Belanja (${t.kode_transaksi}):*\n${itemNames}\n\n*Total Belanja:* ${formatRupiah(t.total)}\n*Sisa Utang:* ${formatRupiah(t.sisa_utang)}\n\nTerima kasih banyak ya Kak! 🙏`;
    
    const encoded = encodeURIComponent(pesan);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

// ===================================
// INIT
// ===================================
function init() {
    if (searchDebt) searchDebt.addEventListener("input", renderDebts);
    if (btnConfirmPayDebt) btnConfirmPayDebt.addEventListener("click", processPayDebt);
    if (btnClosePayModal) btnClosePayModal.addEventListener("click", () => payModal.style.display = "none");

    loadDebts();
}

init();