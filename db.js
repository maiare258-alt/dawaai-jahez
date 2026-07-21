// طبقة تخزين بسيطة تعتمد على ملف JSON بدل قاعدة بيانات منفصلة
// كل البيانات محفوظة بملف data/db.json على جهازك
// لاحقاً يمكن استبدال هذا الملف بالكامل بقاعدة بيانات حقيقية (PostgreSQL مثلاً) دون تغيير باقي الكود كثيراً

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function readDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- الأدوية ----------

function searchMedicines(query) {
  const db = readDb();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return db.medicines.filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.generic_name || '').toLowerCase().includes(q) ||
    (m.alt_names || []).some(a => a.toLowerCase().includes(q))
  );
}

function addMedicine({ name, generic_name, alt_names }) {
  const db = readDb();
  const medicine = {
    id: db.nextMedicineId,
    name,
    generic_name: generic_name || null,
    alt_names: alt_names || []
  };
  db.medicines.push(medicine);
  db.nextMedicineId += 1;
  writeDb(db);
  return medicine;
}

function getAllMedicines() {
  return readDb().medicines;
}

function deleteMedicine(medicineId) {
  const db = readDb();
  const id = Number(medicineId);
  db.medicines = db.medicines.filter(m => m.id !== id);
  Object.keys(db.stock).forEach(pharmacyId => {
    delete db.stock[pharmacyId][id];
  });
  writeDb(db);
}

// ---------- الصيدليات ----------

function getAllPharmacies() {
  const db = readDb();
  return db.pharmacies.map(({ owner_password_hash, ...rest }) => rest);
}

function findPharmacyByUsername(username) {
  const db = readDb();
  return db.pharmacies.find(p => p.owner_username === username);
}

function addPharmacy({ name, address, phone, username, passwordHash }) {
  const db = readDb();
  const pharmacy = {
    id: db.nextPharmacyId,
    name,
    address: address || null,
    phone: phone || null,
    owner_username: username,
    owner_password_hash: passwordHash
  };
  db.pharmacies.push(pharmacy);
  db.nextPharmacyId += 1;
  db.stock[pharmacy.id] = {};
  writeDb(db);
  return pharmacy;
}

function deletePharmacy(pharmacyId) {
  const db = readDb();
  const id = Number(pharmacyId);
  db.pharmacies = db.pharmacies.filter(p => p.id !== id);
  delete db.stock[id];
  writeDb(db);
}

// ---------- المخزون ----------

function getAvailability(medicineId) {
  const db = readDb();
  return db.pharmacies.map(ph => ({
    pharmacy_id: ph.id,
    pharmacy_name: ph.name,
    address: ph.address,
    phone: ph.phone,
    available: !!(db.stock[ph.id] && db.stock[ph.id][medicineId])
  }));
}

function getStockForPharmacy(pharmacyId) {
  const db = readDb();
  const pharmacyStock = db.stock[pharmacyId] || {};
  return db.medicines.map(m => ({
    medicine_id: m.id,
    name: m.name,
    generic_name: m.generic_name,
    available: !!pharmacyStock[m.id]
  }));
}

function setStock(pharmacyId, medicineId, available) {
  const db = readDb();
  if (!db.stock[pharmacyId]) db.stock[pharmacyId] = {};
  db.stock[pharmacyId][medicineId] = !!available;
  writeDb(db);
}

module.exports = {
  searchMedicines,
  addMedicine,
  getAllMedicines,
  deleteMedicine,
  getAllPharmacies,
  findPharmacyByUsername,
  addPharmacy,
  deletePharmacy,
  getAvailability,
  getStockForPharmacy,
  setStock
};
