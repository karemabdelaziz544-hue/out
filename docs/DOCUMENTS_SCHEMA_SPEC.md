# مواصفات متطلبات قاعدة البيانات لمركز المستندات (Documents Schema Specification)

توثق هذه الورقة الحالة الراهنة لقاعدة بيانات المستندات في منصة **OUT**، والمواصفات المقترحة لجدول `documents` وحاوية التخزين (Storage Bucket) لتفعيل دورة حياة المستندات كاملة عند اعتمادها.

---

## 1. الفحص الفعلي الحالي (Current State Audit)

بناءً على فحص قاعدة بيانات Supabase الحالية:
* **جدول `documents`**: غير موجود حالياً في `public` schema.
* **جدول `shipments`**: غير موجود حالياً في `public` schema.
* **حاويات التخزين (Storage Buckets)**: لا يوجد أي Storage bucket للمستندات (`buckets: []`).
* **واجهة المستندات `/documents`**: تم بناؤها كـ Production UI Foundation كاملة ومحمية Server-side للأدمن فقط، وتتعامل مع قاعدة البيانات الحقيقية بأمان مع إظهار Empty State نظيف وصادق، دون أي بيانات وهمية (Mock Data).

---

## 2. مواصفات جدول المستندات المقترح (`public.documents`)

عند الرغبة في إنشاء الجدول عبر Migration رسمية، يُوصى بالهيكل التالي المتوافق تماماً مع الأنواع البرمجية المنفذة في كود الواجهة (`src/types/document.ts`):

```sql
-- 1. إنشاء جدول المستندات
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_path text NOT NULL,                -- المسار داخل Storage Bucket
  file_url text,                          -- الرابط المباشر أو الـ Signed URL
  file_type text,                         -- e.g. 'application/pdf', 'image/jpeg'
  file_size bigint,                       -- حجم الملف بالبايت
  document_type text,                     -- نوع المستند: 'بوليصة شحن', 'فاتورة تجارية', 'بيان جمركي'
  customer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  shipment_id uuid,                       -- مستقبلاً: REFERENCES public.shipments(id) ON DELETE SET NULL
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. الفهارس (Indexes)
CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON public.documents(customer_id);
CREATE INDEX IF NOT EXISTS documents_shipment_id_idx ON public.documents(shipment_id);
CREATE INDEX IF NOT EXISTS documents_document_type_idx ON public.documents(document_type);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents(created_at DESC);

-- 3. تفعيل RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 4. سياسات RLS المقترحة:
-- الأدمن يستطيع رؤية وتعديل كافة المستندات:
CREATE POLICY "documents_admin_all" ON public.documents
  FOR ALL USING (public.is_admin());

-- العميل يرى مستنداته فقط:
CREATE POLICY "documents_customer_select" ON public.documents
  FOR SELECT USING (auth.uid() = customer_id);
```

---

## 3. مواصفات حاوية التخزين (Supabase Storage Bucket)

* **اسم الحاوية المقترح**: `documents`
* **الخصوصية (Public Access)**: `false` (Private Bucket لمنع الوصول العام للمستندات الجمركية الحساسة).
* **آلية المعاينة والتنزيل**: استخدام Signed URLs بمدة صلاحية محددة (مثل 60 دقيقة) يتم توليدها Server-side دون كشف مفاتيح النظام.
* **أنواع الملفات المسموح بها**: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
* **الحد الأقصى لحجم الملف**: 25 ميجابايت للمستند.

---

## 4. جاهزية الربط البرمجي

كود المنصة في:
- [`src/lib/documents/queries.ts`](file:///Users/karemabdelaziz/Out/src/lib/documents/queries.ts)
- [`src/components/documents/`](file:///Users/karemabdelaziz/Out/src/components/documents/)
- [`src/app/(dashboard)/documents/page.tsx`](file:///Users/karemabdelaziz/Out/src/app/(dashboard)/documents/page.tsx)

مبني ومهيأ مسبقاً لاستقبال البيانات فور تطبيق هذا الـ Schema، حيث سيتعرف الاستعلام التلقائي على الجدول ويقوم بعرض المستندات والبحث والفلترة والمعاينة مباشرة دون الحاجة لتغيير هيكل الواجهة.
