import type { Metadata } from "next";
import { SignInWidget } from "@/components/auth/sign-in-widget";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <SignInWidget />;
}
