/**
 * Authentication Validation Schemas
 *
 * Built with Zod for server and client side validation.
 * Uses clear, user-friendly Arabic validation messages.
 */

import { z } from "zod";

// Egyptian mobile number regex: starts with 01, followed by 0/1/2/5, then 8 digits (total 11 digits)
export const EGYPTIAN_PHONE_REGEX = /^01[0125][0-9]{8}$/;

// Password regex: at least one letter and at least one number
export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-zA-Z])(?=.*[0-9])/;

// ─── Login Schema ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "هذا الحقل مطلوب.")
    .email("من فضلك أدخل بريدًا إلكترونيًا صحيحًا.")
    .trim()
    .toLowerCase(),
  password: z.string().min(1, "هذا الحقل مطلوب."),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Register Schema ──────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(1, "هذا الحقل مطلوب.")
      .min(3, "الاسم بالكامل يجب أن يكون 3 أحرف على الأقل.")
      .trim(),
    phone: z
      .string()
      .min(1, "هذا الحقل مطلوب.")
      .trim()
      .regex(
        EGYPTIAN_PHONE_REGEX,
        "رقم الموبايل يجب أن يكون رقم مصري صحيح (مثال: 01012345678).",
      ),
    email: z
      .string()
      .min(1, "هذا الحقل مطلوب.")
      .email("من فضلك أدخل بريدًا إلكترونيًا صحيحًا.")
      .trim()
      .toLowerCase(),
    password: z
      .string()
      .min(1, "هذا الحقل مطلوب.")
      .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل.")
      .regex(
        PASSWORD_COMPLEXITY_REGEX,
        "كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.",
      ),
    confirmPassword: z.string().min(1, "هذا الحقل مطلوب."),
    terms: z.boolean().refine((val) => val === true, {
      message: "يجب الموافقة على الشروط والأحكام وسياسة الخصوصية.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Forgot Password Schema ───────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "هذا الحقل مطلوب.")
    .email("من فضلك أدخل بريدًا إلكترونيًا صحيحًا.")
    .trim()
    .toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── Reset Password Schema ────────────────────────────────────────────────────

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, "هذا الحقل مطلوب.")
      .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل.")
      .regex(
        PASSWORD_COMPLEXITY_REGEX,
        "كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.",
      ),
    confirmPassword: z.string().min(1, "هذا الحقل مطلوب."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
