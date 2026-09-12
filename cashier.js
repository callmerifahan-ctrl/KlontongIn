// ===================================
// CONFIG & SUPABASE SETUP
// ===================================
const SUPABASE_URL = "https://dyyzsuleugpgiqutebwv.supabase.co";
const SUPABASE_KEY = "sb_publishable_hKWVFsDZC539-T3nVyS13g_ME3HC0AP";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// ===================================
// DATA STATE
// ===================================
let items = [];
let cart = [];
let html5QrCode = null;
let currentPaymentMethod = ""; 
let selectedCategory = "";
let lastSavedTransaction = null;

const categoriesList = [
    { label: "🌾 Sembako & Beras", value: "Sembako", color: "#fff3cd" },
    { label: "🍜 Mie Instan", value: "Mie Instan", color: "#d1ecf1" },
    { label: "🥤 Minuman & Galon", value: "Minuman", color: "#d4edda" },
    { label: "🍿 Snack & Jajanan", value: "Snack", color: "#f8d7da" },
    { label: "🚬 Rokok & Tembakau", value: "Rokok", color: "#e2e3e5" },
    { label: "🧼 Perlengkapan Mandi", value: "Perlengkapan", color: "#e0f7fa" },
    { label: "🍦 Es Krim & Pendingin", value: "Pendingin", color: "#fff8e1" },
    { label: "💊 Obat & Health", value: "Obat", color: "#f3e5f5" },
    { label: "🔥 Gas & Rumah Tangga", value: "Rumah Tangga", color: "#fbe9e7" }
];

// ===================================
// DOM ELEMENTS
// ===================================
const cashierItems = document.getElementById("cashierItems");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const checkoutButton = document.getElementById("checkoutButton");
const searchCashier = document.getElementById("searchCashier");
const desktopCategoryList = document.getElementById("desktopCategoryList");

const btnScanCashier = document.getElementById("btnScanCashier");
const btnCloseScanner = document.getElementById("btnCloseScanner");
const scannerModal = document.getElementById("scannerModal");

const paymentModal = document.getElementById("paymentModal");
const modalTotalPay = document.getElementById("modalTotalPay");
const btnPayCash = document.getElementById("btnPayCash");
const btnPayQRIS = document.getElementById("btnPayQRIS");
const btnPayDebt = document.getElementById("btnPayDebt");

const cashFormContainer = document.getElementById("cashFormContainer");
const modalPaymentInput = document.getElementById("modalPaymentInput");
const modalChangeTotal = document.getElementById("modalChangeTotal");

const qrisFormContainer = document.getElementById("qrisFormContainer");

const debtFormContainer = document.getElementById("debtFormContainer");
const debtCustomerName = document.getElementById("debtCustomerName");
const debtDPInput = document.getElementById("debtDPInput");
const debtRemainingTotal = document.getElementById("debtRemainingTotal");

const btnConfirmPayment = document.getElementById("btnConfirmPayment");
const btnClosePaymentModal = document.getElementById("btnClosePaymentModal");

const receiptSuccessModal = document.getElementById("receiptSuccessModal");
const receiptTrxCodeText = document.getElementById("receiptTrxCodeText");
const btnPrintReceiptBtn = document.getElementById("btnPrintReceiptBtn");
const btnCloseReceiptSuccessModal = document.getElementById("btnCloseReceiptSuccessModal");
const receiptPrintArea = document.getElementById("receiptPrintArea");

// ===================================
// UTILITIES & HARGA PAKET
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

function roundPrice(rawPrice) {
    return Math.round(rawPrice / 100) * 100;
}

function isKiloan(name) {
    const lowerName = (name || "").toLowerCase();
    return lowerName.includes("telur") || lowerName.includes("beras");
}

function calculateItemSubtotal(item) {
    const lowerName = (item.name || "").toLowerCase();
    if (lowerName.includes("es batu")) {
        const qty = Math.floor(item.qty);
        const pairs = Math.floor(qty / 2);
        const remainder = qty % 2;
        return (pairs * 5000) + (remainder * 3000);
    }
    return roundPrice(item.price * item.qty);
}

function getItemById(id) {
    return items.find(item => item.id === id);
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
}

// ===================================
// DATABASE SERVICES
// ===================================
async function loadDataSupabase() {
    const { data, error } = await supabaseClient
        .from("barang")
        .select("*")
        .order("nama_barang", { ascending: true });

    if (error) {
        console.error(error);
        alert("Gagal memuat daftar barang!");
        return;
    }

    items = (data || []).map(item => ({
        id: item.id,
        name: item.nama_barang || item.nama,
        stock: parseFloat(item.stok) || 0,
        sellPrice: parseFloat(item.harga_jual) || 0,
        code: item.barcode,
        category: item.kategori || "Lainnya"
    }));
}

async function generateTransactionCode() {
    const { count, error } = await supabaseClient
        .from("transaksi")
        .select("*", { count: "exact", head: true });

    if (error) return "TRX-" + Date.now();
    return "TRX-" + String((count || 0) + 1).padStart(6, "0");
}

// ===================================
// CART OPERATIONS
// ===================================
function addToCart(itemId) {
    const inventoryItem = getItemById(itemId);
    if (!inventoryItem) return;

    const existingItem = cart.find(item => item.id === itemId);

    if (existingItem) {
        if (existingItem.qty >= inventoryItem.stock) return alert("Stok tidak mencukupi!");
        existingItem.qty = parseFloat((existingItem.qty + 1).toFixed(3));
    } else {
        if (inventoryItem.stock <= 0) return alert("Barang habis!");
        cart.push({ id: inventoryItem.id, name: inventoryItem.name, price: inventoryItem.sellPrice, qty: 1 });
    }
    renderCart();
}

function updateCartQtyDirect(itemId, newQty) {
    const cartItem = cart.find(item => item.id === itemId);
    const inventoryItem = getItemById(itemId);

    if (!cartItem || !inventoryItem) return;

    const parsedQty = parseFloat(newQty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
        cart = cart.filter(item => item.id !== itemId);
    } else {
        if (parsedQty > inventoryItem.stock) {
            alert("Stok tidak mencukupi!");
            cartItem.qty = inventoryItem.stock;
        } else {
            cartItem.qty = parsedQty;
        }
    }
    renderCart();
}

function clearCart() {
    cart = [];
    renderCart();
}

// ===================================
// MODAL & PAYMENT HANDLERS
// ===================================
function openPaymentModal() {
    if (cart.length === 0) return alert("Keranjang masih kosong!");

    const total = getCartTotal();
    modalTotalPay.textContent = formatRupiah(total);

    currentPaymentMethod = "";
    cashFormContainer.style.display = "none";
    qrisFormContainer.style.display = "none";
    debtFormContainer.style.display = "none";
    btnConfirmPayment.style.display = "none";

    modalPaymentInput.value = "";
    debtCustomerName.value = "";
    debtDPInput.value = "";

    paymentModal.style.display = "flex";
}

function selectPaymentMethod(method) {
    currentPaymentMethod = method;
    btnConfirmPayment.style.display = "block";

    cashFormContainer.style.display = method === "Tunai" ? "block" : "none";
    qrisFormContainer.style.display = method === "QRIS" ? "block" : "none";
    debtFormContainer.style.display = method === "Bon" ? "block" : "none";

    if (method === "Tunai") updateCashChange();
    if (method === "Bon") updateDebtRemaining();
}

function updateCashChange() {
    const total = getCartTotal();
    const payment = parseInt(modalPaymentInput.value, 10) || 0;
    const change = payment - total;

    if (change < 0) {
        modalChangeTotal.textContent = "Uang Kurang";
        modalChangeTotal.style.color = "#d32f2f";
    } else {
        modalChangeTotal.textContent = formatRupiah(change);
        modalChangeTotal.style.color = "#27ae60";
    }
}

function updateDebtRemaining() {
    const total = getCartTotal();
    const dp = parseInt(debtDPInput.value, 10) || 0;
    const remaining = total - dp;

    debtRemainingTotal.textContent = formatRupiah(Math.max(0, remaining));
}

async function processCheckout() {
    if (cart.length === 0) return alert("Keranjang masih kosong!");
    if (!currentPaymentMethod) return alert("Pilih metode pembayaran terlebih dahulu!");

    const total = getCartTotal();
    let paymentAmount = total;
    let changeAmount = 0;
    let customerName = "";
    let isDebt = false;
    let debtRemaining = 0;

    if (currentPaymentMethod === "Tunai") {
        paymentAmount = parseInt(modalPaymentInput.value, 10) || 0;
        if (paymentAmount < total) return alert("Uang pembayaran kurang!");
        changeAmount = paymentAmount - total;
    } else if (currentPaymentMethod === "Bon") {
        customerName = debtCustomerName.value.trim();
        if (!customerName) return alert("Masukkan nama pelanggan!");

        const dp = parseInt(debtDPInput.value, 10) || 0;
        paymentAmount = dp;
        debtRemaining = total - dp;
        isDebt = true;
    }

    btnConfirmPayment.disabled = true;
    btnConfirmPayment.textContent = "Memproses...";

    for (const cartItem of cart) {
        const item = getItemById(cartItem.id);
        const newStock = parseFloat((item.stock - cartItem.qty).toFixed(3));
        await supabaseClient.from("barang").update({ stok: newStock }).eq("id", item.id);
    }

    const transactionCode = await generateTransactionCode();
    const cartToSave = cart.map(c => ({ ...c, subtotal: calculateItemSubtotal(c) }));

    const newTransaction = {
        kode_transaksi: transactionCode,
        item: cartToSave,
        total: total,
        bayar: paymentAmount,
        kembalian: changeAmount,
        metode_pembayaran: currentPaymentMethod,
        nama_pelanggan: customerName,
        status_bon: isDebt,
        sisa_utang: debtRemaining,
        tanggal: new Date().toISOString()
    };

    await supabaseClient.from("transaksi").insert([newTransaction]);

    if (isDebt && debtRemaining > 0) {
        await supabaseClient.from("riwayat_bon").insert([{
            nama_pelanggan: customerName,
            kode_transaksi: transactionCode,
            tipe: "UTANG_BARU",
            nominal: debtRemaining,
            keterangan: `Bon Transaksi ${transactionCode}`,
            tanggal: new Date().toISOString()
        }]);
    }

    btnConfirmPayment.disabled = false;
    btnConfirmPayment.textContent = "✅ Simpan Transaksi";

    lastSavedTransaction = newTransaction;
    paymentModal.style.display = "none";
    clearCart();

    await loadDataSupabase();
    renderCashierItems();

    if (receiptSuccessModal) {
        receiptTrxCodeText.textContent = `Kode: ${transactionCode}`;
        receiptSuccessModal.style.display = "flex";
    }
}

function printReceipt() {
    if (!lastSavedTransaction) return;

    const trx = lastSavedTransaction;
    const dateStr = new Date(trx.tanggal).toLocaleString("id-ID");

    let itemsHTML = "";
    trx.item.forEach(i => {
        itemsHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${i.name}</span></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:10px;">
                <span>${i.qty} x ${formatRupiah(i.price)}</span>
                <span>${formatRupiah(i.subtotal)}</span>
            </div>
        `;
    });

    receiptPrintArea.innerHTML = `
        <div style="text-align:center; margin-bottom:8px;">
            <h3 style="margin:0; font-size:14px;">WARUNG KLONTONGIN</h3>
            <p style="margin:2px 0 0 0; font-size:10px;">Struk Pembayaran Belanja</p>
        </div>
        <div style="border-bottom:1px dashed #000; margin-bottom:6px;"></div>
        <div style="font-size:10px; margin-bottom:6px;">
            <div>No: ${trx.kode_transaksi}</div>
            <div>Tgl: ${dateStr}</div>
            <div>Metode: ${trx.metode_pembayaran}</div>
            ${trx.nama_pelanggan ? `<div>Pelanggan: ${trx.nama_pelanggan}</div>` : ''}
        </div>
        <div style="border-bottom:1px dashed #000; margin-bottom:6px;"></div>
        ${itemsHTML}
        <div style="border-bottom:1px dashed #000; margin-bottom:6px;"></div>
        <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>TOTAL:</span><span>${formatRupiah(trx.total)}</span></div>
        <div style="display:flex; justify-content:space-between;"><span>BAYAR:</span><span>${formatRupiah(trx.bayar)}</span></div>
        <div style="display:flex; justify-content:space-between;"><span>KEMBALI:</span><span>${formatRupiah(trx.kembalian)}</span></div>
        ${trx.sisa_utang > 0 ? `<div style="display:flex; justify-content:space-between; font-weight:bold; color:red;"><span>SISA UTANG:</span><span>${formatRupiah(trx.sisa_utang)}</span></div>` : ''}
        <div style="border-bottom:1px dashed #000; margin-top:6px; margin-bottom:8px;"></div>
        <div style="text-align:center; font-size:10px;"><p style="margin:0;">Terima kasih atas kunjungannya!</p></div>
    `;

    receiptPrintArea.style.display = "block";
    window.print();
    receiptPrintArea.style.display = "none";
}

// ===================================
// RENDERERS (RESPONSIF KATEGORI)
// ===================================
function renderDesktopSidebar() {
    if (!desktopCategoryList) return;
    desktopCategoryList.replaceChildren();

    const btnAll = document.createElement("button");
    btnAll.textContent = "📋 Semua Produk";
    btnAll.style.cssText = `
        padding: 10px; border-radius: 6px; border: 1px solid #ccc; text-align: left;
        cursor: pointer; font-weight: bold; background: ${selectedCategory === "" ? "#D67A67" : "#fff"};
        color: ${selectedCategory === "" ? "#fff" : "#333"};
    `;
    btnAll.addEventListener("click", () => {
        selectedCategory = "";
        renderDesktopSidebar();
        renderCategoryFilter();
        renderCashierItems();
    });
    desktopCategoryList.appendChild(btnAll);

    categoriesList.forEach(cat => {
        const btn = document.createElement("button");
        btn.textContent = cat.label;
        btn.style.cssText = `
            padding: 10px; border-radius: 6px; border: 1px solid #ccc; text-align: left;
            cursor: pointer; font-size: 13px; background: ${selectedCategory === cat.value ? "#D67A67" : "#fff"};
            color: ${selectedCategory === cat.value ? "#fff" : "#333"};
            font-weight: ${selectedCategory === cat.value ? "bold" : "normal"};
        `;
        btn.addEventListener("click", () => {
            selectedCategory = cat.value;
            renderDesktopSidebar();
            renderCategoryFilter();
            renderCashierItems();
        });
        desktopCategoryList.appendChild(btn);
    });
}

function renderCategoryFilter() {
    let filterContainer = document.getElementById("cashierCategoryFilter");
    
    if (!filterContainer && searchCashier) {
        filterContainer = document.createElement("div");
        filterContainer.id = "cashierCategoryFilter";
        filterContainer.style.cssText = "display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; scrollbar-width: none;";
        searchCashier.parentNode.insertBefore(filterContainer, searchCashier.nextSibling);
    }

    if (!filterContainer) return;

    filterContainer.replaceChildren();

    categoriesList.forEach(cat => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cat.label;
        btn.style.cssText = `
            padding: 8px 14px; font-size: 13px; border-radius: 16px; border: 1px solid #ccc;
            white-space: nowrap; cursor: pointer;
            background: ${selectedCategory === cat.value ? "#D67A67" : "#fff"};
            color: ${selectedCategory === cat.value ? "#fff" : "#333"};
            font-weight: ${selectedCategory === cat.value ? "bold" : "normal"};
        `;
        
        btn.addEventListener("click", () => {
            selectedCategory = (selectedCategory === cat.value) ? "" : cat.value;
            renderCategoryFilter();
            renderDesktopSidebar();
            renderCashierItems();
        });

        filterContainer.appendChild(btn);
    });
}

function renderCashierItems() {
    cashierItems.replaceChildren();
    const keyword = searchCashier ? searchCashier.value.toLowerCase().trim() : "";

    if (keyword === "" && selectedCategory === "") {
        renderCategoryGridDisplay();
        return;
    }

    const filtered = items.filter(item => {
        const matchesName = (item.name || "").toLowerCase().includes(keyword) || (item.code || "").toLowerCase().includes(keyword);
        const matchesCategory = selectedCategory === "" || item.category === selectedCategory;
        return keyword !== "" ? matchesName : matchesCategory;
    });

    if (filtered.length === 0) {
        cashierItems.innerHTML = `<p style="text-align:center; color:#888; padding: 20px;">Barang tidak ditemukan</p>`;
        return;
    }

    filtered.forEach((item) => {
        cashierItems.appendChild(createCashierCard(item));
    });
}

function renderCategoryGridDisplay() {
    const grid = document.createElement("div");
    grid.style.cssText = "display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; width: 100%;";

    categoriesList.forEach(cat => {
        const card = document.createElement("div");
        card.style.cssText = `
            background: ${cat.color}; padding: 15px 10px; border-radius: 10px;
            text-align: center; font-weight: bold; font-size: 13px; color: #333;
            cursor: pointer; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            display: flex; align-items: center; justify-content: center; min-height: 65px;
        `;
        card.textContent = cat.label;
        card.addEventListener("click", () => {
            selectedCategory = cat.value;
            renderCategoryFilter();
            renderDesktopSidebar();
            renderCashierItems();
        });
        grid.appendChild(card);
    });

    cashierItems.appendChild(grid);
}

function createCashierCard(item) {
    const card = document.createElement("div");
    card.className = "cashier-card";

    const title = document.createElement("h3");
    title.textContent = item.name;

    const kiloan = isKiloan(item.name);
    const unitText = kiloan ? " / kg" : "";

    const price = document.createElement("p");
    if (item.name.toLowerCase().includes("es batu")) {
        price.textContent = `${formatRupiah(item.sellPrice)} (2 Pcs Rp 5.000)`;
        price.style.fontSize = "12px";
    } else {
        price.textContent = `${formatRupiah(item.sellPrice)}${unitText}`;
    }

    const stock = document.createElement("small");
    stock.textContent = `Stok : ${item.stock}${kiloan ? " kg" : ""}`;

    const addButton = document.createElement("button");
    addButton.textContent = "➕ Tambah";
    addButton.addEventListener("click", () => addToCart(item.id));

    card.append(title, price, stock, addButton);
    return card;
}

function renderCart() {
    cartItems.replaceChildren();
    cart.forEach((item) => {
        cartItems.appendChild(createCartItem(item));
    });
    cartTotal.textContent = formatRupiah(getCartTotal());
}

function createCartItem(item) {
    const li = document.createElement("li");
    li.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #eee;";

    const infoBox = document.createElement("div");
    infoBox.style.flex = "1";

    const title = document.createElement("strong");
    title.style.display = "block";
    title.textContent = item.name;

    const calculatedPrice = calculateItemSubtotal(item);
    
    const subtotal = document.createElement("small");
    subtotal.style.color = "#D67A67";
    subtotal.style.fontWeight = "bold";
    
    if (item.name.toLowerCase().includes("es batu") && item.qty >= 2) {
        subtotal.textContent = `${formatRupiah(calculatedPrice)} 🏷️ (Diskon Paket)`;
    } else {
        subtotal.textContent = formatRupiah(calculatedPrice);
    }

    infoBox.append(title, subtotal);

    const controls = document.createElement("div");
    controls.style.cssText = "display: flex; align-items: center; gap: 4px;";

    const kiloan = isKiloan(item.name);

    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.step = kiloan ? "0.01" : "1";
    qtyInput.min = "0";
    qtyInput.value = item.qty;
    qtyInput.style.cssText = "width: 60px; padding: 4px; text-align: center; border-radius: 4px; border: 1px solid #ccc; font-weight: bold;";
    qtyInput.addEventListener("change", (e) => updateCartQtyDirect(item.id, e.target.value));

    controls.append(qtyInput);

    if (kiloan) {
        const unitLabel = document.createElement("span");
        unitLabel.style.fontSize = "12px";
        unitLabel.style.color = "#666";
        unitLabel.textContent = "kg";
        controls.append(unitLabel);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "❌";
    deleteBtn.style.cssText = "background: none; border: none; cursor: pointer; padding: 2px 4px;";
    deleteBtn.addEventListener("click", () => updateCartQtyDirect(item.id, 0));

    controls.append(deleteBtn);
    li.append(infoBox, controls);

    return li;
}

// ===================================
// BARCODE SCANNER
// ===================================
function openScanner() {
    scannerModal.style.display = "flex";
    html5QrCode = new Html5Qrcode("scannerReader");
    
    const config = { fps: 15, qrbox: { width: 280, height: 120 } };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            const cleanCode = decodedText.trim();
            const foundItem = items.find(item => item.code === cleanCode);
            
            if (!foundItem) {
                alert(`⚠️ Barang dengan Barcode "${cleanCode}" belum terdaftar!`);
            } else {
                addToCart(foundItem.id);
                if (navigator.vibrate) navigator.vibrate(100);
            }
            closeScanner();
        },
        () => {}
    ).catch((err) => {
        console.error(err);
        alert("Kamera tidak dapat diakses!");
        closeScanner();
    });
}

function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
        html5QrCode = null;
    }
    scannerModal.style.display = "none";
}

// ===================================
// INITIALIZATION
// ===================================
function setupEventListeners() {
    if (checkoutButton) checkoutButton.addEventListener("click", openPaymentModal);
    if (searchCashier) searchCashier.addEventListener("input", renderCashierItems);

    if (btnPayCash) btnPayCash.addEventListener("click", () => selectPaymentMethod("Tunai"));
    if (btnPayQRIS) btnPayQRIS.addEventListener("click", () => selectPaymentMethod("QRIS"));
    if (btnPayDebt) btnPayDebt.addEventListener("click", () => selectPaymentMethod("Bon"));

    if (modalPaymentInput) modalPaymentInput.addEventListener("input", updateCashChange);
    if (debtDPInput) debtDPInput.addEventListener("input", updateDebtRemaining);

    if (btnConfirmPayment) btnConfirmPayment.addEventListener("click", processCheckout);
    if (btnClosePaymentModal) btnClosePaymentModal.addEventListener("click", () => paymentModal.style.display = "none");

    if (btnPrintReceiptBtn) btnPrintReceiptBtn.addEventListener("click", printReceipt);
    if (btnCloseReceiptSuccessModal) btnCloseReceiptSuccessModal.addEventListener("click", () => receiptSuccessModal.style.display = "none");

    if (btnScanCashier) btnScanCashier.addEventListener("click", openScanner);
    if (btnCloseScanner) btnCloseScanner.addEventListener("click", closeScanner);
}

async function init() {
    await loadDataSupabase();
    renderDesktopSidebar();
    renderCategoryFilter();
    renderCashierItems();
    renderCart();
    setupEventListeners();
}

init();