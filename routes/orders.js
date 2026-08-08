const express = require('express');
const router = express.Router();
const db = require('../db');

// إرسال طلب جديد من المريض (بتنقسم تلقائياً لعدة طلبات لو السلة فيها أكتر من صيدلية)
// POST /api/orders  { patient_name, patient_phone, items: [{pharmacyId, medicineName, genericName, quantity}] }
router.post('/', async (req, res) => {
  const { patient_name, patient_phone, items } = req.body;
  if (!patient_name || !patient_phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'الاسم ورقم الهاتف والأدوية مطلوبة لإتمام الطلب' });
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
      const order = await db.createOrder(Number(pharmacyId), patient_name, patient_phone, byPharmacy[pharmacyId]);
      orders.push(order);
    }
    res.status(201).json({ success: true, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إرسال الطلب' });
  }
});

// جلب طلبات صيدلية معينة (للوحة الصيدلي)
// GET /api/orders/:pharmacyId
router.get('/:pharmacyId', async (req, res) => {
  try {
    const orders = await db.getOrdersForPharmacy(req.params.pharmacyId);
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

module.exports = router;
