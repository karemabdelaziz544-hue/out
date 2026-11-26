/**
 * Company Page Header Component
 *
 * Title and descriptive subtitle for customer company settings.
 */

export function CompanyHeader() {
  return (
    <div className="customers-header">
      <div>
        <h1 className="customers-header__title">بيانات الشركة</h1>
        <p className="customers-header__desc">
          بيانات الشركة الأساسية المستخدمة في إجراءات التخليص والشحنات القادمة.
        </p>
      </div>
    </div>
  );
}
