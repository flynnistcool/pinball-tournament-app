import { PropsWithChildren } from "react";
import clsx from "clsx";

export function Card({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={clsx("rounded-2xl border bg-white shadow-sm", className)}>{children}</div>;
}
export function CardHeader({ children }: PropsWithChildren) {
  // Mobile: etwas kompaktere horizontal padding
  return <div className="px-4 md:px-5 pt-5 pb-3 border-b">{children}</div>;
}
export function CardBody({ children }: PropsWithChildren) {
  return <div className="px-4 md:px-5 py-4">{children}</div>;
}
export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed";
  const v =
    variant === "primary"
      ? "bg-black text-white hover:bg-neutral-800"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-neutral-100 text-black hover:bg-neutral-200";
  return <button className={clsx(base, v, className)} {...props} />;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-black/10", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-black/10", props.className)} />;
}
export function Pill({ children }: PropsWithChildren) {
  return <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm">{children}</span>;
}
