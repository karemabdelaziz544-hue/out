"use client";

import {
  SearchX,
  AlertTriangle,
  Clock,
  KeyRound,
  ShieldAlert,
  RotateCcw,
  FileQuestion,
  HelpCircle,
} from "lucide-react";
import type { TrackingResultStatus } from "@/lib/tracking/types";

interface TrackingErrorStateProps {
  status: TrackingResultStatus;
  userMessage?: string;
  trackingNumber: string;
  onRetry?: () => void;
}

interface ErrorConfig {
  icon: typeof SearchX;
  title: string;
  description: string;
  actionHint: string;
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
  not_found: {
    icon: SearchX,
    title: "لم يتم العثور على بيانات لهذه الشحنة",
    description:
      "لم تتلق أنظمة الملاحة البحرية بعد أي سجلات نشطة مرتبطة بهذا المعرف. قد يكون الحجز مسجلاً حديثاً أو الرقم مدخلاً بصيغة غير دقيقة.",
    actionHint:
      "تحقق من دقة الأحرف والأرقام وفق بوليصة الشحن، أو تواصل مع الخط الملاحي للتأكد من تفعيل رقم الحجز.",
  },
  invalid_number: {
    icon: AlertTriangle,
    title: "صيغة رقم التتبع غير صالحة",
    description:
      "الرقم المدخل لا يتوافق مع المعايير القياسية الملاحية (مثل كود ISO 6346 للحاويات المكون من 4 أحرف و 7 أرقام).",
    actionHint:
      "يرجى مراجعة بوليصة الشحن (B/L) أو رقم الحاوية المدون والتأكد من إدخاله بالإنجليزية دون رموز خاصة.",
  },
  provider_error: {
    icon: ShieldAlert,
    title: "تعذر الاتصال بمزود التتبع الملاحي",
    description:
      "نواجه صعوبة مؤقتة في الاستعلام من أنظمة الخطوط الملاحية العالمية.",
    actionHint:
      "يرجى إعادة المحاولة بعد بضع دقائق، أو التواصل مع الدعم الفني إذا استمرت المشكلة.",
  },
  timeout: {
    icon: Clock,
    title: "انتهت مهلة الاتصال بالخادم الملاحي",
    description:
      "استغرقت خوادم الخط الملاحي وقتاً أطول من المعتاد للرد على الاستعلام.",
    actionHint:
      "يمكنك الضغط على زر إعادة المحاولة الآن لتكرار الطلب.",
  },
  no_api_key: {
    icon: KeyRound,
    title: "خدمة التتبع المباشر قيد الإعداد",
    description:
      "يتطلب الربط الملاحي المباشر تفعيل مفتاح اشتراك مزود الخدمة (SeaRates API Key).",
    actionHint:
      "يرجى من مسؤول النظام مراجعة إعدادات متغيرات البيئة SEARATES_API_KEY.",
  },
  rate_limited: {
    icon: Clock,
    title: "تم تجاوز الحد المسموح به من الطلبات",
    description:
      "لأسباب أمنية ولحماية استقرار الخدمة، تم تقييد عدد الاستعلامات المتتالية من عنوانك مؤقتاً.",
    actionHint:
      "يرجى الانتظار لمدة دقيقة واحدة قبل إجراء عملية بحث جديدة.",
  },
  unsupported_identifier: {
    icon: FileQuestion,
    title: "نوع المعرف غير مدعوم للتتبع البحري",
    description:
      "المعرف الذي أدخلته غير مخصص للاستعلام لدى خطوط الملاحة البحرية الدولية.",
    actionHint:
      "استخدم رقم الحاوية الملاحية (Container Number) أو رقم بوليصة الشحن (B/L) للحصول على مسار الرحلة.",
  },
};

export function TrackingErrorState({
  status,
  userMessage,
  trackingNumber,
  onRetry,
}: TrackingErrorStateProps) {
  const config = ERROR_CONFIGS[status] || {
    icon: HelpCircle,
    title: "تعذر إتمام عملية التتبع",
    description: userMessage || "حدث خطأ غير متوقع أثناء معالجة استعلام التتبع.",
    actionHint: "يرجى التحقق من الرقم المدخل والمحاولة لاحقاً.",
  };

  const IconComponent = config.icon;

  return (
    <div className="tracking-error-card" dir="rtl" role="alert">
      <div className="error-icon-wrapper">
        <IconComponent size={32} />
      </div>

      <div className="error-content">
        <h3 className="error-title">{config.title}</h3>
        <p className="error-description">
          {userMessage ? userMessage : config.description}
        </p>

        {trackingNumber && (
          <div className="error-queried-number">
            الرقم المستعلم عنه: <strong dir="ltr">{trackingNumber}</strong>
          </div>
        )}

        <div className="error-action-hint">
          <strong>ماذا يمكنك أن تفعل؟</strong> {config.actionHint}
        </div>

        {onRetry && (
          <div className="error-actions">
            <button
              type="button"
              onClick={onRetry}
              className="error-retry-btn"
            >
              <RotateCcw size={15} />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
