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
let items = [];
let currentUploadedFile = null;

const itemForm = document.getElementById("itemForm");
const formTitle = document.getElementById("formTitle");
const itemIdInput = document.getElementById("itemId");
const itemImageUrlInput = document.getElementById("itemImageUrl");
const namaBarangInput = document.getElementById("namaBarang");
const barcodeInput = document.getElementById("barcodeInput");
const stokBarangInput = document.getElementById("stokBarang");
const hargaBeliInput = document.getElementById("hargaBeli");
const hargaJualInput = document.getElementById("hargaJual");
const kategoriInput = document.getElementById("kategoriBarang");

const btnSubmit = document.getElementById("btnSubmit");
const btnCancel = document.getElementById("btnCancel");
const itemList = document.getElementById("itemList");
const searchInput = document.getElementById("searchInput");
const filterCategory = document.getElementById("filterCategory");

// Modal & OCR Elements
const cameraInput = document.getElementById("cameraInput");
const statusOCR = document.getElementById("statusOCR");
const photoOptionModal = document.getElementById("photoOptionModal");
const modalImagePreview = document.getElementById("modalImagePreview");
const btnOptionNew = document.getElementById("btnOptionNew");
const btnOptionExisting = document.getElementById("btnOptionExisting");
const btnOptionCancel = document.getElementById("btnOptionCancel");
const existingProductForm = document.getElementById("existingProductForm");
const selectExistingItem = document.getElementById("selectExistingItem");
const addQtyInput = document.getElementById("addQtyInput");
const btnSubmitAddStock = document.getElementById("btnSubmitAddStock");

// ===================================
// UTILITIES
// ===================================
function formatRupiah(angka) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    } else {
        alert(message);
    }
}

// ===================================
// OCR PROCESSOR (TESSERACT.JS)
// ===================================
async function processOCR(file) {
    if (!statusOCR) return;

    statusOCR.style.display = 'block';
    statusOCR.style.color = '#333';
    statusOCR.innerText = '⏳ Membaca teks kemasan...';

    try {
        if (typeof Tesseract === 'undefined') throw new Error('Tesseract tidak tersedia');

        const result = await Tesseract.recognize(file, 'ind+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    statusOCR.innerText = `⏳ Membaca teks: ${Math.round(m.progress * 100)}%`;
                }
            }
        });

        let rawText = result.data.text || "";
        let lines = rawText.split('\n').map(l => l.replace(/[^a-zA-Z0-9\s]/g, '').trim()).filter(l => l.length > 2);

        if (lines.length > 0) {
            let predictedName = lines.slice(0, 2).join(' ');
            if (namaBarangInput) namaBarangInput.value = predictedName;
            statusOCR.style.color = 'green';
            statusOCR.innerText = `✅ Teks terdeteksi: "${predictedName}"`;
        } else {
            statusOCR.style.color = 'orange';
            statusOCR.innerText = '⚠️ Teks tidak terdeteksi. Silakan isi manual.';
        }
    } catch (error) {
        console.error('Error OCR:', error);
        statusOCR.style.color = 'red';
        statusOCR.innerText = '❌ Gagal membaca foto.';
    }
}

// ===================================
// DATABASE OPERATIONS
// ===================================
async function loadItems() {
    const { data, error } = await supabaseClient
        .from("barang")
        .select("*")
        .order("nama_barang", { ascending: true });

    if (error) {
        console.error("Gagal memuat barang:", error);
        showToast("Gagal mengambil data stok!");
        return;
    }

    items = data || [];
    renderItems();
}

async function quickUpdateStock(itemId, delta) {
    const targetItem = items.find(i => i.id === itemId);
    if (!targetItem) return;

    const newStock = Math.max(0, (targetItem.stok || 0) + delta);

    const { error } = await supabaseClient
        .from("barang")
        .update({ stok: newStock })
        .eq("id", itemId);

    if (error) {
        console.error(error);
        showToast("Gagal memperbarui stok!");
        return;
    }

    targetItem.stok = newStock;
    renderItems();
    showToast(`Stok "${targetItem.nama_barang}" diubah jadi ${newStock}`);
}

async function uploadImageToSupabase(file) {
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { data, error } = await supabaseClient.storage
        .from("produk-image")
        .upload(fileName, file);

    if (error) return null;
    const { data: publicUrlData } = supabaseClient.storage.from("produk-image").getPublicUrl(fileName);
    return publicUrlData ? publicUrlData.publicUrl : null;
}

// ===================================
// RENDERERS
// ===================================
function renderItems() {
    if (!itemList) return;
    itemList.replaceChildren();

    const keyword = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedCat = filterCategory ? filterCategory.value : "";

    const filtered = items.filter(item => {
        const matchesName = (item.nama_barang || "").toLowerCase().includes(keyword) || (item.barcode || "").toLowerCase().includes(keyword);
        const matchesCategory = selectedCat === "" || (item.kategori || "") === selectedCat;
        return matchesName && matchesCategory;
    });

    if (filtered.length === 0) {
        const emptyMsg = document.createElement("p");
        emptyMsg.style.textAlign = "center";
        emptyMsg.style.color = "#888";
        emptyMsg.style.padding = "20px";
        emptyMsg.textContent = "Barang tidak ditemukan.";
        itemList.appendChild(emptyMsg);
        return;
    }

    filtered.forEach(item => {
        itemList.appendChild(createItemCard(item));
    });
}

function createItemCard(item) {
    const card = document.createElement("div");
    card.style.background = "#fff";
    card.style.padding = "12px";
    card.style.marginBottom = "10px";
    card.style.borderRadius = "8px";
    card.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "flex-start";

    const titleBox = document.createElement("div");
    const title = document.createElement("h3");
    title.style.margin = "0 0 2px 0";
    title.textContent = item.nama_barang;

    const catBadge = document.createElement("small");
    catBadge.style.background = "#eef2f5";
    catBadge.style.padding = "2px 6px";
    catBadge.style.borderRadius = "4px";
    catBadge.style.color = "#555";
    catBadge.textContent = item.kategori ? `🏷️ ${item.kategori}` : "📦 Lainnya";

    if (item.barcode) {
        const barcodeBadge = document.createElement("small");
        barcodeBadge.style.background = "#fff3cd";
        barcodeBadge.style.color = "#856404";
        barcodeBadge.style.padding = "2px 6px";
        barcodeBadge.style.borderRadius = "4px";
        barcodeBadge.style.marginLeft = "4px";
        barcodeBadge.textContent = `║▌ ${item.barcode}`;
        titleBox.append(title, catBadge, barcodeBadge);
    } else {
        titleBox.append(title, catBadge);
    }

    const price = document.createElement("div");
    price.style.textAlign = "right";
    price.style.fontWeight = "bold";
    price.style.color = "#D67A67";
    price.textContent = formatRupiah(item.harga_jual);

    header.append(titleBox, price);

    // Controls Stok [+] & [-]
    const stockRow = document.createElement("div");
    stockRow.style.display = "flex";
    stockRow.style.justifyContent = "space-between";
    stockRow.style.alignItems = "center";
    stockRow.style.marginTop = "10px";
    stockRow.style.paddingTop = "8px";
    stockRow.style.borderTop = "1px dashed #eee";

    const stockText = document.createElement("span");
    stockText.style.fontSize = "14px";
    stockText.style.fontWeight = "bold";
    stockText.textContent = `Stok: ${item.stok}`;

    const quickBox = document.createElement("div");
    quickBox.style.display = "flex";
    quickBox.style.gap = "6px";
    quickBox.style.alignItems = "center";

    const minusBtn = document.createElement("button");
    minusBtn.className = "btn";
    minusBtn.style.background = "#e74c3c";
    minusBtn.style.color = "#fff";
    minusBtn.style.padding = "4px 10px";
    minusBtn.textContent = "➖";
    minusBtn.addEventListener("click", () => quickUpdateStock(item.id, -1));

    const plusBtn = document.createElement("button");
    plusBtn.className = "btn";
    plusBtn.style.background = "#27ae60";
    plusBtn.style.color = "#fff";
    plusBtn.style.padding = "4px 10px";
    plusBtn.textContent = "➕";
    plusBtn.addEventListener("click", () => quickUpdateStock(item.id, 1));

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn btn-secondary";
    btnEdit.style.padding = "4px 8px";
    btnEdit.style.fontSize = "12px";
    btnEdit.textContent = "✏️ Edit";
    btnEdit.addEventListener("click", () => populateForm(item));

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn";
    btnDelete.style.background = "#333";
    btnDelete.style.color = "#fff";
    btnDelete.style.padding = "4px 8px";
    btnDelete.style.fontSize = "12px";
    btnDelete.textContent = "🗑️";
    btnDelete.addEventListener("click", () => deleteItem(item.id, item.nama_barang));

    quickBox.append(minusBtn, plusBtn, btnEdit, btnDelete);
    stockRow.append(stockText, quickBox);

    card.append(header, stockRow);
    return card;
}

function populateForm(item) {
    formTitle.textContent = "✏️ Edit Barang";
    itemIdInput.value = item.id;
    itemImageUrlInput.value = item.image_url || "";
    namaBarangInput.value = item.nama_barang;
    if (barcodeInput) barcodeInput.value = item.barcode || "";
    stokBarangInput.value = item.stok;
    hargaBeliInput.value = item.harga_beli;
    hargaJualInput.value = item.harga_jual;
    if (kategoriInput) kategoriInput.value = item.kategori || "";

    btnSubmit.textContent = "Simpan Perubahan";
    btnCancel.style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
    formTitle.textContent = "➕ Tambah Barang Baru";
    itemIdInput.value = "";
    itemImageUrlInput.value = "";
    if (itemForm) itemForm.reset();

    btnSubmit.textContent = "Simpan Barang";
    btnCancel.style.display = "none";
    currentUploadedFile = null;
    if (statusOCR) statusOCR.style.display = "none";
}

// ===================================
// EVENT HANDLERS & LOGIC
// ===================================
async function handleSubmit(e) {
    e.preventDefault();

    const id = itemIdInput.value;
    const nama_barang = namaBarangInput.value.trim();
    const barcode = barcodeInput ? barcodeInput.value.trim() : "";
    const stok = parseInt(stokBarangInput.value, 10);
    const harga_beli = parseFloat(hargaBeliInput.value);
    const harga_jual = parseFloat(hargaJualInput.value);
    const kategori = kategoriInput ? kategoriInput.value : "";

    let image_url = itemImageUrlInput.value;

    if (currentUploadedFile) {
        showToast("Mengunggah gambar...");
        const uploadedUrl = await uploadImageToSupabase(currentUploadedFile);
        if (uploadedUrl) image_url = uploadedUrl;
    }

    const payload = { nama_barang, barcode, stok, harga_beli, harga_jual, image_url, kategori };

    if (id) {
        const { error } = await supabaseClient.from("barang").update(payload).eq("id", id);
        if (error) return showToast("Gagal memperbarui barang!");
        showToast("Barang berhasil diperbarui!");
    } else {
        const { error } = await supabaseClient.from("barang").insert([payload]);
        if (error) return showToast("Gagal menambah barang!");
        showToast("Barang baru berhasil ditambahkan!");
    }

    resetForm();
    await loadItems();
}

async function deleteItem(id, name) {
    if (!confirm(`Hapus "${name}" dari stok?`)) return;

    const { error } = await supabaseClient.from("barang").delete().eq("id", id);
    if (error) return showToast("Gagal menghapus barang!");

    showToast("Barang berhasil dihapus!");
    await loadItems();
}

// Camera & OCR Handlers
if (cameraInput) {
    cameraInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        currentUploadedFile = file;
        const reader = new FileReader();
        reader.onload = function(evt) {
            modalImagePreview.src = evt.target.result;
            existingProductForm.style.display = "none";
            photoOptionModal.style.display = "flex";
        };
        reader.readAsDataURL(file);
        processOCR(file);
    });
}

if (btnOptionNew) {
    btnOptionNew.addEventListener("click", () => {
        photoOptionModal.style.display = "none";
        if (namaBarangInput) namaBarangInput.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

if (btnOptionExisting) {
    btnOptionExisting.addEventListener("click", () => {
        selectExistingItem.replaceChildren();
        if (items.length === 0) return alert("Belum ada daftar barang!");

        items.forEach(item => {
            const opt = document.createElement("option");
            opt.value = item.id;
            opt.textContent = `${item.nama_barang} (Stok: ${item.stok})`;
            selectExistingItem.appendChild(opt);
        });

        existingProductForm.style.display = "block";
    });
}

if (btnOptionCancel) {
    btnOptionCancel.addEventListener("click", () => {
        photoOptionModal.style.display = "none";
        currentUploadedFile = null;
        if (statusOCR) statusOCR.style.display = "none";
    });
}

if (btnSubmitAddStock) {
    btnSubmitAddStock.addEventListener("click", async () => {
        const selectedId = selectExistingItem.value;
        const addQty = parseInt(addQtyInput.value, 10) || 0;

        const targetItem = items.find(i => i.id == selectedId);
        if (!targetItem) return;

        await quickUpdateStock(targetItem.id, addQty);
        photoOptionModal.style.display = "none";
    });
}

// ===================================
// INITIALIZATION
// ===================================
function init() {
    if (itemForm) itemForm.addEventListener("submit", handleSubmit);
    if (btnCancel) btnCancel.addEventListener("click", resetForm);
    if (searchInput) searchInput.addEventListener("input", renderItems);
    if (filterCategory) filterCategory.addEventListener("change", renderItems);

    loadItems();
}

init();