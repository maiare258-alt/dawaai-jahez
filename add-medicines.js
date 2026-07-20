// هذا الملف يضيف قائمة أدوية جديدة لملف data/db.json
// بدون ما يمسح أي صيدلية أو بيانات مسجّلة مسبقاً
// طريقة الاستخدام: ضع هذا الملف داخل مجلد backend وشغّله مرة واحدة بالأمر:
//   node add-medicines.js

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

const newMedicines = [
  { name: "بروفين", generic_name: "إيبوبروفين", alt_names: ["brufen", "ibuprofen"] },
  { name: "كاتافلام", generic_name: "ديكلوفيناك", alt_names: ["cataflam"] },
  { name: "أموكسيل", generic_name: "أموكسيسيلين", alt_names: ["amoxil", "amoxicillin"] },
  { name: "كلاسيد", generic_name: "كلاريثروميسين", alt_names: ["klacid", "clarithromycin"] },
  { name: "فلاجيل", generic_name: "ميترونيدازول", alt_names: ["flagyl", "metronidazole"] },
  { name: "توسيران", generic_name: "ديكستروميثورفان", alt_names: ["tosseran"] },
  { name: "كولدريكس", generic_name: "باراسيتامول + مضاد احتقان", alt_names: ["coldrex"] },
  { name: "زيرتك", generic_name: "سيتريزين", alt_names: ["zyrtec", "cetirizine"] },
  { name: "كلاريتين", generic_name: "لوراتادين", alt_names: ["claritine", "loratadine"] },
  { name: "نيكسيوم", generic_name: "إيزوميبرازول", alt_names: ["nexium", "esomeprazole"] },
  { name: "زانتاك", generic_name: "رانيتيدين", alt_names: ["zantac", "ranitidine"] },
  { name: "إيموديوم", generic_name: "لوبيراميد", alt_names: ["imodium", "loperamide"] },
  { name: "فينتولين", generic_name: "سالبوتامول", alt_names: ["ventolin", "salbutamol"] },
  { name: "كونكور", generic_name: "بيسوبرولول", alt_names: ["concor", "bisoprolol"] },
  { name: "كابوتين", generic_name: "كابتوبريل", alt_names: ["capoten", "captopril"] },
  { name: "غلوكوفاج", generic_name: "ميتفورمين", alt_names: ["glucophage", "metformin"] },
  { name: "أماريل", generic_name: "غليميبيريد", alt_names: ["amaryl", "glimepiride"] },
  { name: "فيتامين سي", generic_name: "حمض الأسكوربيك", alt_names: ["vitamin c"] },
  { name: "فيروجلوبين", generic_name: "حديد وفيتامينات", alt_names: ["feroglobin"] },
  { name: "أسبرين", generic_name: "حمض أسيتيل ساليسيليك", alt_names: ["aspirin"] },
  { name: "بيتادين", generic_name: "بوفيدون آيودين", alt_names: ["betadine"] },
  { name: "فيوسيدين", generic_name: "فوسيديك أسيد", alt_names: ["fucidin"] },
  { name: "أدول", generic_name: "باراسيتامول", alt_names: ["adol", "paracetamol"] }
];

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

let addedCount = 0;
newMedicines.forEach(med => {
  const exists = db.medicines.some(m => m.name === med.name);
  if (!exists) {
    db.medicines.push({ id: db.nextMedicineId, ...med });
    db.nextMedicineId += 1;
    addedCount++;
  }
});

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');

console.log(`تمت إضافة ${addedCount} دواء جديد. إجمالي الأدوية الآن: ${db.medicines.length}`);
