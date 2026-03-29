"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    try {
      await register(name, email, password);
      toast.success("Account created successfully!");
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create account";
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
        <h1 className="text-2xl font-bold text-text-primary">
          Create your account
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Get started with MeetBot in seconds
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          leftIcon={<User className="h-4 w-4" />}
          required
          autoComplete="name"
        />

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
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="h-4 w-4" />}
          required
          autoComplete="new-password"
          hint="Must be at least 8 characters"
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
          Create Account
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-brand-primary hover:text-brand-secondary font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
