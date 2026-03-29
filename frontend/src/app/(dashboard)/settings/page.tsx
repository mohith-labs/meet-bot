"use client";

import { useState, type FormEvent } from "react";
import { User, Mail, Bot, Languages, AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useAuthStore } from "@/stores/auth-store";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { user } = useAuthStore();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [defaultBotName, setDefaultBotName] = useState("MeetBot");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [isSavingApi, setIsSavingApi] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      // No backend endpoint for profile update yet
      await new Promise((resolve) => setTimeout(resolve, 300));
      toast("Profile update coming soon", { icon: "\u2139\uFE0F" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveApiSettings = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingApi(true);
    try {
      // No backend endpoint for API settings yet
      await new Promise((resolve) => setTimeout(resolve, 300));
      toast("API settings update coming soon", { icon: "\u2139\uFE0F" });
    } finally {
      setIsSavingApi(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    toast("Account deletion coming soon", { icon: "\u2139\uFE0F" });
    setShowDeleteModal(false);
    setDeleteConfirmText("");
  };

  const LANGUAGES = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "pt", label: "Portuguese" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
    { value: "zh", label: "Chinese" },
    { value: "hi", label: "Hindi" },
    { value: "ar", label: "Arabic" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Manage your account information
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input
            label="Name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftIcon={<User className="h-4 w-4" />}
          />

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="h-4 w-4" />}
            disabled
          />

          <div className="flex justify-end">
            <Button
              type="submit"
              leftIcon={<Save className="h-4 w-4" />}
              isLoading={isSavingProfile}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Card>

      {/* API Settings */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>API Settings</CardTitle>
            <CardDescription>
              Configure default settings for bot deployments
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSaveApiSettings} className="space-y-4">
          <Input
            label="Default Bot Name"
            type="text"
            placeholder="MeetBot"
            value={defaultBotName}
            onChange={(e) => setDefaultBotName(e.target.value)}
            leftIcon={<Bot className="h-4 w-4" />}
            hint="The default name used when creating new bots"
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Default Language
            </label>
            <div className="relative">
              <Languages className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full bg-bg-secondary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary hover:border-border-hover appearance-none cursor-pointer"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Default transcription language for new bots
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              leftIcon={<Save className="h-4 w-4" />}
              isLoading={isSavingApi}
            >
              Save Settings
            </Button>
          </div>
        </form>
      </Card>

      {/* Danger Zone */}
      <Card className="border-error/20">
        <CardHeader>
          <div>
            <CardTitle className="text-error">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </div>
        </CardHeader>

        <div className="flex items-center justify-between p-4 rounded-lg border border-error/20 bg-error/5">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Delete Account
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Permanently delete your account and all associated data
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Delete Account Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText("");
        }}
        title="Delete Account"
        description="This will permanently delete your account, all meetings, transcripts, and API keys. This action cannot be undone."
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-error/5 border border-error/20">
            <AlertTriangle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-error">
                This is irreversible
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                All your data will be permanently deleted. Type{" "}
                <code className="px-1 py-0.5 rounded bg-bg-tertiary text-error text-xs font-mono">
                  DELETE
                </code>{" "}
                to confirm.
              </p>
            </div>
          </div>

          <Input
            placeholder="Type DELETE to confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE"}
            >
              Delete My Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
