const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// إرسال طلب جديد من المريض (بتنقسم تلقائياً لعدة طلبات لو السلة فيها أكتر من صيدلية)
// POST /api/orders  { patient_name, patient_phone, items: [{pharmacyId, medicineName, genericName, quantity}], notes? }
router.post('/', async (req, res) => {
  const { patient_name, patient_phone, items, notes } = req.body;
  if (!patient_name || !patient_phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'الاسم ورقم الهاتف والأدوية مطلوبة لإتمام الطلب' });
  }
  if (!/^[0-9]{7,15}$/.test(patient_phone)) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يتكون من أرقام فقط' });
  }
  try {
    const byPharmacy = {};
    for (const item of items) {
      const key = item.pharmacyId;
      if (!byPharmacy[key]) byPharmacy[key] = [];
      byPharmacy[key].push({
        medicineName: item.medicineName,
        genericName: item.genericName || null,
        quantity: item.quantity || 1
      });
    }

    const orders = [];
    for (const pharmacyId of Object.keys(byPharmacy)) {
      const order = await db.createOrder(Number(pharmacyId), patient_name, patient_phone, byPharmacy[pharmacyId], notes);
      orders.push(order);
    }
    res.status(201).json({ success: true, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إرسال الطلب' });
  }
});

// جلب حالة مجموعة طلبات معينة (للمريض، عشان يشوف إذا الصيدلية استجابت)
// GET /api/orders/status?ids=1,2,3
router.get('/status', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return res.json([]);
    const rows = await db.getOrdersStatus(ids);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب حالة الطلبات' });
  }
});

// جلب طلبات صيدلية معينة (للوحة الصيدلي) — يتطلب تأكيد اسم المستخدم وكلمة مرور الصيدلية صاحبة الطلبات
// GET /api/orders/:pharmacyId  Headers: { x-pharmacy-username, x-pharmacy-password }
// ملاحظة: الترويسات تُرسل مشفّرة (encodeURIComponent) من الواجهة لتفادي كسرها لو احتوت على
// أحرف غير إنكليزية (عربي مثلاً) — نفك التشفير هون قبل أي استخدام لها
router.get('/:pharmacyId', async (req, res) => {
  const rawUsername = req.headers['x-pharmacy-username'];
  const rawPassword = req.headers['x-pharmacy-password'];
  if (!rawUsername || !rawPassword) {
    return res.status(401).json({ error: 'بيانات الدخول مطلوبة' });
  }

  let username, password;
  try {
    username = decodeURIComponent(rawUsername);
    password = decodeURIComponent(rawPassword);
  } catch (err) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    if (Number(req.params.pharmacyId) !== pharmacy.id) {
      return res.status(403).json({ error: 'غير مصرح بالوصول لهذه البيانات' });
    }

    const orders = await db.getOrdersForPharmacy(pharmacy.id);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الطلبات' });
  }
});

// تعليم طلب كمُطّلع عليه
// PUT /api/orders/:id/seen
router.put('/:id/seen', async (req, res) => {
  try {
    await db.markOrderSeen(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث الطلب' });
  }
});

// تأكيد إنه الصيدلية استجابت للطلب وحجزت الدواء
// PUT /api/orders/:id/confirm
router.put('/:id/confirm', async (req, res) => {
  try {
    await db.confirmOrder(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تأكيد الطلب' });
  }
});

// حذف طلب نهائياً (بعد ما يتعامل الصيدلي معه)
// DELETE /api/orders/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteOrder(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الطلب' });
  }
});

module.exports = router;
