// يتأكد أن الطلب يحمل كلمة مرور الإدارة الصحيحة قبل تنفيذ أي عملية حساسة
// (إضافة/حذف صيدليات، إضافة/حذف أدوية)

module.exports = function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة مرور الإدارة غير صحيحة' });
  }
  next();
};
