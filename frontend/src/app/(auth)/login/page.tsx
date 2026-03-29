"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const checkRegistration = async () => {
      try {
        const result = await api.getRegistrationStatus();
        setRegistrationEnabled(result.registrationEnabled);
      } catch {
        // If we can't check, default to showing the link
        setRegistrationEnabled(true);
      }
    };
    checkRegistration();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sign in";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-2xl">
      {/* Gradient border accent */}
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-primary to-transparent" />

      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
        <p className="text-sm text-text-secondary mt-1">
          Sign in to your account to continue
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="h-4 w-4" />}
          required
          autoComplete="email"
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="h-4 w-4" />}
          required
          autoComplete="current-password"
        />

        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isLoading}
        >
          Sign In
        </Button>
      </form>

      {registrationEnabled !== false && (
        <div className="mt-6 text-center">
          <p className="text-sm text-text-secondary">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-brand-primary hover:text-brand-secondary font-medium transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
