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
let currentPaymentMethod = ""; // 'Tunai', 'QRIS', 'Bon'
let selectedCategory = "";

// ===================================
// DOM ELEMENTS
// ===================================
const cashierItems = document.getElementById("cashierItems");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const checkoutButton = document.getElementById("checkoutButton");
const searchCashier = document.getElementById("searchCashier");

// Barcode Scanner Elements
const btnScanCashier = document.getElementById("btnScanCashier");
const btnCloseScanner = document.getElementById("btnCloseScanner");
const scannerModal = document.getElementById("scannerModal");

// Payment Modal Elements
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

// ===================================
// UTILITIES
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

function getItemById(id) {
    return items.find(item => item.id === id);
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
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
        stock: item.stok,
        sellPrice: item.harga_jual,
        code: item.barcode,
        category: item.kategori || "Lainnya"
    }));
}

async function generateTransactionCode() {
    const { count, error } = await supabaseClient
        .from("transaksi")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error(error);
        return "TRX-" + Date.now();
    }

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
        if (existingItem.qty >= inventoryItem.stock) {
            return alert("Stok tidak mencukupi!");
        }
        existingItem.qty++;
    } else {
        if (inventoryItem.stock <= 0) {
            return alert("Barang habis!");
        }
        cart.push({
            id: inventoryItem.id,
            name: inventoryItem.name,
            price: inventoryItem.sellPrice,
            qty: 1
        });
    }

    renderCart();
}

function increaseCartQty(itemId) {
    const cartItem = cart.find(item => item.id === itemId);
    const inventoryItem = getItemById(itemId);

    if (!cartItem || !inventoryItem) return;

    if (cartItem.qty >= inventoryItem.stock) {
        return alert("Stok tidak mencukupi!");
    }

    cartItem.qty++;
    renderCart();
}

function decreaseCartQty(itemId) {
    const index = cart.findIndex(item => item.id === itemId);
    if (index === -1) return;

    cart[index].qty--;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    renderCart();
}

function clearCart() {
    cart = [];
    renderCart();
}

// ===================================
// MODAL PAYMENT HANDLERS
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

// ===================================
// CHECKOUT EXECUTION
// ===================================
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
        if (!customerName) return alert("Masukkan nama pelanggan / tetangga yang berutang!");

        const dp = parseInt(debtDPInput.value, 10) || 0;
        paymentAmount = dp;
        debtRemaining = total - dp;
        isDebt = true;
    }

    btnConfirmPayment.disabled = true;
    btnConfirmPayment.textContent = "Memproses...";

    for (const cartItem of cart) {
        const item = getItemById(cartItem.id);
        const newStock = item.stock - cartItem.qty;

        const { error: stockError } = await supabaseClient
            .from("barang")
            .update({ stok: newStock })
            .eq("id", item.id);

        if (stockError) {
            console.error(stockError);
            alert("Gagal mengurangi stok barang: " + item.name);
            btnConfirmPayment.disabled = false;
            btnConfirmPayment.textContent = "✅ Simpan Transaksi";
            return;
        }
    }

    const transactionCode = await generateTransactionCode();
    const newTransaction = {
        kode_transaksi: transactionCode,
        item: cart,
        total: total,
        bayar: paymentAmount,
        kembalian: changeAmount,
        metode_pembayaran: currentPaymentMethod,
        nama_pelanggan: customerName,
        status_bon: isDebt,
        sisa_utang: debtRemaining,
        tanggal: new Date().toISOString()
    };

    const { error: transactionError } = await supabaseClient
        .from("transaksi")
        .insert([newTransaction]);

    btnConfirmPayment.disabled = false;
    btnConfirmPayment.textContent = "✅ Simpan Transaksi";

    if (transactionError) {
        console.error(transactionError);
        alert("Gagal menyimpan transaksi!");
        return;
    }

    paymentModal.style.display = "none";
    clearCart();

    await loadDataSupabase();
    renderCashierItems();

    alert(`✅ Transaksi ${transactionCode} Berhasil Disimpan!`);
}

// ===================================
// RENDERERS & CATEGORY FILTERS
// ===================================
function renderCategoryFilter() {
    let filterContainer = document.getElementById("cashierCategoryFilter");
    
    if (!filterContainer && searchCashier) {
        filterContainer = document.createElement("div");
        filterContainer.id = "cashierCategoryFilter";
        filterContainer.style.cssText = "display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; scrollbar-width: none;";
        searchCashier.parentNode.insertBefore(filterContainer, searchCashier.nextSibling);
    }

    if (!filterContainer) return;

    const categories = [
        { label: "Semua", value: "" },
        { label: "🌾 Sembako", value: "Sembako" },
        { label: "🍦 Es Krim", value: "Es Krim" },
        { label: "🚬 Rokok", value: "Rokok" },
        { label: "🥤 Minuman", value: "Minuman" },
        { label: "🍞 Makanan", value: "Makanan" },
        { label: "🧼 Kebutuhan", value: "Kebutuhan" },
        { label: "📦 Lainnya", value: "Lainnya" }
    ];

    filterContainer.replaceChildren();

    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cat.label;
        btn.style.cssText = `
            padding: 6px 12px;
            font-size: 13px;
            border-radius: 16px;
            border: 1px solid #ccc;
            white-space: nowrap;
            cursor: pointer;
            background: ${selectedCategory === cat.value ? "#D67A67" : "#fff"};
            color: ${selectedCategory === cat.value ? "#fff" : "#333"};
            font-weight: ${selectedCategory === cat.value ? "bold" : "normal"};
        `;
        
        btn.addEventListener("click", () => {
            selectedCategory = cat.value;
            renderCategoryFilter();
            renderCashierItems();
        });

        filterContainer.appendChild(btn);
    });
}

function renderCashierItems() {
    cashierItems.replaceChildren();
    const keyword = searchCashier ? searchCashier.value.toLowerCase().trim() : "";

    const filtered = items.filter(item => {
        const matchesName = (item.name || "").toLowerCase().includes(keyword);
        const matchesCategory = selectedCategory === "" || item.category === selectedCategory;
        return matchesName && matchesCategory;
    });

    if (filtered.length === 0) {
        cashierItems.innerHTML = `<p style="text-align:center; color:#888; padding: 20px;">Barang tidak ditemukan</p>`;
        return;
    }

    filtered.forEach((item) => {
        cashierItems.appendChild(createCashierCard(item));
    });
}

function createCashierCard(item) {
    const card = document.createElement("div");
    card.className = "cashier-card";

    const title = document.createElement("h3");
    title.textContent = item.name;

    const price = document.createElement("p");
    price.textContent = formatRupiah(item.sellPrice);

    const stock = document.createElement("small");
    stock.textContent = `Stok : ${item.stock}`;

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

    const title = document.createElement("strong");
    title.textContent = item.name;

    const subtotal = document.createElement("p");
    subtotal.textContent = formatRupiah(item.price * item.qty);

    const controls = document.createElement("div");
    controls.className = "stock-controls";

    const minusBtn = document.createElement("button");
    minusBtn.textContent = "➖";
    minusBtn.addEventListener("click", () => decreaseCartQty(item.id));

    const qty = document.createElement("strong");
    qty.className = "stock-text";
    qty.textContent = item.qty;

    const plusBtn = document.createElement("button");
    plusBtn.textContent = "➕";
    plusBtn.addEventListener("click", () => increaseCartQty(item.id));

    controls.append(minusBtn, qty, plusBtn);
    li.append(title, subtotal, controls);

    return li;
}

// ===================================
// BARCODE SCANNER (KHUSUS GLICO & PABRIK)
// ===================================
function openScanner() {
    scannerModal.classList.add("show");
    html5QrCode = new Html5Qrcode("scannerReader");
    
    const config = { 
        fps: 15, 
        qrbox: { width: 280, height: 120 } 
    };

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
    scannerModal.classList.remove("show");
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

    if (btnScanCashier) btnScanCashier.addEventListener("click", openScanner);
    if (btnCloseScanner) btnCloseScanner.addEventListener("click", closeScanner);
}

async function init() {
    await loadDataSupabase();
    renderCategoryFilter();
    renderCashierItems();
    renderCart();
    setupEventListeners();
}

init();