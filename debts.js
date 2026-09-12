// ===================================
// CONFIG & SUPABASE SETUP
// ===================================
const SUPABASE_URL = "https://dyyzsuleugpgiqutebwv.supabase.co";
const SUPABASE_KEY = "sb_publishable_hKWVFsDZC539-T3nVyS13g_ME3HC0AP";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// ===================================
// DOM ELEMENTS & STATE
// ===================================
let debtSummaryList = []; // Grouped by nama_pelanggan
let selectedCustomer = null;

const debtList = document.getElementById("debtList");
const searchDebt = document.getElementById("searchDebt");
const totalAllDebt = document.getElementById("totalAllDebt");

const payDebtModal = document.getElementById("payDebtModal");
const modalCustomerName = document.getElementById("modalCustomerName");
const modalCurrentDebt = document.getElementById("modalCurrentDebt");
const modalPayAmount = document.getElementById("modalPayAmount");
const btnConfirmPayDebt = document.getElementById("btnConfirmPayDebt");
const btnClosePayDebtModal = document.getElementById("btnClosePayDebtModal");

// ===================================
// UTILITIES
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

// ===================================
// DATA LOADERS & CALCULATOR
// ===================================
async function loadDebtData() {
    // Ambil transaksi yang status_bon = true & sisa_utang > 0
    const { data, error } = await supabaseClient
        .from("transaksi")
        .select("*")
        .eq("status_bon", true)
        .gt("sisa_utang", 0)
        .order("tanggal", { ascending: false });

    if (error) {
        console.error("Gagal memuat bon:", error);
        return;
    }

    const rawTransactions = data || [];

    // Grouping utang berdasarkan nama pelanggan
    const grouped = {};
    let grandTotalDebt = 0;

    rawTransactions.forEach(trx => {
        const name = (trx.nama_pelanggan || "Tanpa Nama").trim();
        const sisa = parseFloat(trx.sisa_utang || 0);

        grandTotalDebt += sisa;

        if (!grouped[name]) {
            grouped[name] = {
                nama: name,
                totalUtang: 0,
                transactions: []
            };
        }

        grouped[name].totalUtang += sisa;
        grouped[name].transactions.push(trx);
    });

    debtSummaryList = Object.values(grouped);

    if (totalAllDebt) {
        totalAllDebt.textContent = formatRupiah(grandTotalDebt);
    }

    renderDebtList();
}

// ===================================
// RENDERERS
// ===================================
function renderDebtList() {
    if (!debtList) return;
    debtList.replaceChildren();

    const keyword = searchDebt ? searchDebt.value.toLowerCase().trim() : "";
    const filtered = debtSummaryList.filter(item => item.nama.toLowerCase().includes(keyword));

    if (filtered.length === 0) {
        debtList.innerHTML = `<p style="text-align:center; color:#888; padding: 20px;">Tidak ada catatan bon utang aktif 👍</p>`;
        return;
    }

    filtered.forEach(customer => {
        const card = document.createElement("div");
        card.style.cssText = "background: #fff; padding: 14px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 4px solid #e74c3c;";

        const topRow = document.createElement("div");
        topRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";

        const nameTitle = document.createElement("h3");
        nameTitle.style.margin = "0";
        nameTitle.textContent = `👤 ${customer.nama}`;

        const amountTag = document.createElement("span");
        amountTag.style.cssText = "font-weight: bold; color: #e74c3c; font-size: 16px;";
        amountTag.textContent = formatRupiah(customer.totalUtang);

        topRow.append(nameTitle, amountTag);

        const detailText = document.createElement("small");
        detailText.style.cssText = "display: block; color: #666; margin-bottom: 12px;";
        detailText.textContent = `Terdiri dari ${customer.transactions.length} transaksi bon belum lunas`;

        const btnPay = document.createElement("button");
        btnPay.className = "btn";
        btnPay.style.cssText = "width: 100%; background: #27ae60; color: white; font-weight: bold; padding: 8px;";
        btnPay.textContent = "💳 Bayar / Cicil Utang";
        btnPay.addEventListener("click", () => openPayModal(customer));

        card.append(topRow, detailText, btnPay);
        debtList.appendChild(card);
    });
}

// ===================================
// PAYMENT MODAL HANDLERS & LOGIC
// ===================================
function openPayModal(customer) {
    selectedCustomer = customer;
    modalCustomerName.textContent = customer.nama;
    modalCurrentDebt.value = formatRupiah(customer.totalUtang);
    modalPayAmount.value = "";
    payDebtModal.style.display = "flex";
}

function closePayModal() {
    payDebtModal.style.display = "none";
    selectedCustomer = null;
}

async function processPayDebt() {
    if (!selectedCustomer) return;

    const payAmount = parseInt(modalPayAmount.value, 10);
    if (isNaN(payAmount) || payAmount <= 0) {
        return alert("Masukkan nominal pembayaran yang valid!");
    }

    btnConfirmPayDebt.disabled = true;
    btnConfirmPayDebt.textContent = "Memproses...";

    let remainingPayment = payAmount;

    // Kurangi utang transaksi dari yang paling lama (FIFO)
    for (const trx of selectedCustomer.transactions) {
        if (remainingPayment <= 0) break;

        const currentSisa = parseFloat(trx.sisa_utang || 0);
        let deduct = 0;

        if (remainingPayment >= currentSisa) {
            deduct = currentSisa;
            remainingPayment -= currentSisa;

            // Update transaksi ini LUNAS
            await supabaseClient
                .from("transaksi")
                .update({ sisa_utang: 0, status_bon: false })
                .eq("id", trx.id);
        } else {
            deduct = remainingPayment;
            const newSisa = currentSisa - remainingPayment;
            remainingPayment = 0;

            // Update sisa utang transaksi
            await supabaseClient
                .from("transaksi")
                .update({ sisa_utang: newSisa })
                .eq("id", trx.id);
        }

        // Catat di riwayat_bon
        await supabaseClient
            .from("riwayat_bon")
            .insert([{
                nama_pelanggan: selectedCustomer.nama,
                kode_transaksi: trx.kode_transaksi,
                tipe: "PELUNASAN",
                nominal: deduct,
                keterangan: `Bayar/Cicil Bon Rp ${deduct.toLocaleString("id-ID")}`,
                tanggal: new Date().toISOString()
            }]);
    }

    btnConfirmPayDebt.disabled = false;
    btnConfirmPayDebt.textContent = "✅ Simpan Pembayaran";
    closePayModal();

    await loadDebtData();
    alert(`✅ Pembayaran utang atas nama "${selectedCustomer.nama}" berhasil disimpan!`);
}

// ===================================
// INITIALIZATION
// ===================================
function init() {
    if (searchDebt) searchDebt.addEventListener("input", renderDebtList);
    if (btnConfirmPayDebt) btnConfirmPayDebt.addEventListener("click", processPayDebt);
    if (btnClosePayDebtModal) btnClosePayDebtModal.addEventListener("click", closePayModal);

    loadDebtData();
}

init();