"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Key,
  Trash2,
  Clock,
  AlertTriangle,
  Code2,
  Shield,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading";
import { api, type ApiKey } from "@/lib/api";
import { maskApiKey } from "@/lib/utils";
import toast from "react-hot-toast";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys();
  }, []);

  async function loadApiKeys() {
    try {
      const keys = await api.listApiKeys();
      setApiKeys(keys);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a key name");
      return;
    }

    setIsCreating(true);
    try {
      const response = await api.createApiKey(newKeyName.trim());
      // Add to local list with keyPrefix derived from the full key
      const newApiKey: ApiKey = {
        id: response.id,
        name: response.name,
        keyPrefix: response.key.slice(0, 8) + "...",
        isActive: response.isActive,
        lastUsedAt: null,
        createdAt: response.createdAt,
      };
      setApiKeys((prev) => [newApiKey, ...prev]);
      setCreatedKey(response.key);
      setNewKeyName("");
      toast.success("API key created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create API key"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setIsRevoking(true);
    try {
      await api.revokeApiKey(keyId);
      setApiKeys((prev) =>
        prev.map((k) =>
          k.id === keyId ? { ...k, isActive: false } : k
        )
      );
      toast.success("API key revoked");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke API key"
      );
    } finally {
      setIsRevoking(false);
      setShowRevokeModal(null);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyName("");
    setCreatedKey(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            API Keys
          </h2>
          <p className="text-sm text-text-secondary">
            Manage your API keys for programmatic access
          </p>
        </div>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateModal(true)}
        >
          Create New Key
        </Button>
      </div>

      {/* Keys Table */}
      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : apiKeys.length === 0 ? (
        <EmptyState
          icon={<Key className="h-10 w-10" />}
          title="No API keys"
          description="Create an API key to start using the MeetBot API programmatically"
          action={
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Create API Key
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_200px_120px_120px_80px_60px] gap-4 px-6 py-3 bg-bg-secondary/50 border-b border-border text-xs font-medium text-text-muted uppercase tracking-wider">
            <div>Name</div>
            <div>Key</div>
            <div>Created</div>
            <div>Last Used</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border/50">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="grid grid-cols-[1fr_200px_120px_120px_80px_60px] gap-4 px-6 py-4 items-center hover:bg-bg-tertiary/20 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Key className="h-4 w-4 text-text-muted flex-shrink-0" />
                  <span className="text-sm font-medium text-text-primary truncate">
                    {key.name}
                  </span>
                </div>
                <div className="flex items-center">
                  <code className="text-xs text-text-secondary font-mono">
                    {key.keyPrefix ? maskApiKey(key.keyPrefix) : "••••••••"}
                  </code>
                </div>
                <div className="text-sm text-text-secondary">
                  {format(new Date(key.createdAt), "MMM d, yyyy")}
                </div>
                <div className="text-sm text-text-muted">
                  {key.lastUsedAt
                    ? format(new Date(key.lastUsedAt), "MMM d, yyyy")
                    : "Never"}
                </div>
                <div>
                  <Badge
                    variant={key.isActive ? "success" : "neutral"}
                  >
                    {key.isActive ? "Active" : "Revoked"}
                  </Badge>
                </div>
                <div className="text-right">
                  {key.isActive && (
                    <button
                      onClick={() => setShowRevokeModal(key.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Usage Examples */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-brand-primary" />
            <CardTitle>API Usage Examples</CardTitle>
          </div>
          <CardDescription>
            Use your API key to interact with MeetBot programmatically
          </CardDescription>
        </CardHeader>

        <div className="space-y-4">
          {/* Join Meeting */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">
              Join a meeting:
            </p>
            <div className="relative bg-bg-secondary rounded-lg p-4 border border-border">
              <pre className="text-xs text-text-secondary font-mono overflow-x-auto">
                <code>{`curl -X POST http://localhost:3001/bots \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"platform": "google_meet", "nativeMeetingId": "abc-defg-hij"}'`}</code>
              </pre>
              <CopyButton
                text={`curl -X POST http://localhost:3001/bots \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -d '{"platform": "google_meet", "nativeMeetingId": "abc-defg-hij"}'`}
                className="absolute top-2 right-2"
              />
            </div>
          </div>

          {/* Get Transcript */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">
              Get meeting transcript:
            </p>
            <div className="relative bg-bg-secondary rounded-lg p-4 border border-border">
              <pre className="text-xs text-text-secondary font-mono overflow-x-auto">
                <code>{`curl http://localhost:3001/transcripts/google_meet/abc-defg-hij \\
  -H "X-API-Key: YOUR_API_KEY"`}</code>
              </pre>
              <CopyButton
                text={`curl http://localhost:3001/transcripts/google_meet/abc-defg-hij \\\n  -H "X-API-Key: YOUR_API_KEY"`}
                className="absolute top-2 right-2"
              />
            </div>
          </div>

          {/* Stop Bot */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">
              Stop a bot:
            </p>
            <div className="relative bg-bg-secondary rounded-lg p-4 border border-border">
              <pre className="text-xs text-text-secondary font-mono overflow-x-auto">
                <code>{`curl -X DELETE http://localhost:3001/bots/google_meet/abc-defg-hij \\
  -H "X-API-Key: YOUR_API_KEY"`}</code>
              </pre>
              <CopyButton
                text={`curl -X DELETE http://localhost:3001/bots/google_meet/abc-defg-hij \\\n  -H "X-API-Key: YOUR_API_KEY"`}
                className="absolute top-2 right-2"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Create Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title={createdKey ? "API Key Created" : "Create New API Key"}
        description={
          createdKey
            ? "Make sure to copy your API key now. You won't be able to see it again."
            : "Give your API key a descriptive name to identify its usage."
        }
        size="sm"
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
              <p className="text-xs text-warning font-medium">
                Save this key — it won't be shown again
              </p>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary border border-border">
              <Shield className="h-4 w-4 text-text-muted flex-shrink-0" />
              <code className="flex-1 text-sm font-mono text-brand-secondary break-all select-all">
                {createdKey}
              </code>
              <CopyButton text={createdKey} />
            </div>
            <Button className="w-full" onClick={closeCreateModal}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Key Name"
              placeholder="e.g., Production Server, CI/CD Pipeline"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
            />
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={closeCreateModal}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateKey}
                isLoading={isCreating}
              >
                Create Key
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={!!showRevokeModal}
        onClose={() => setShowRevokeModal(null)}
        title="Revoke API Key"
        description="This action cannot be undone. Any applications using this key will lose access immediately."
        size="sm"
      >
        <div className="flex items-center gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={() => setShowRevokeModal(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => showRevokeModal && handleRevokeKey(showRevokeModal)}
            isLoading={isRevoking}
          >
            Revoke Key
          </Button>
        </div>
      </Modal>
    </div>
  );
}
