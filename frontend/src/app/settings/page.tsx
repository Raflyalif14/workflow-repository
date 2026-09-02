"use client";

import React from "react";
import { Settings, Shield, Server, Database, Key, Bell, Palette, RadioTower, Workflow } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/components/auth/auth-provider";
import { RoleGuard } from "@/components/auth/role-guard";

export default function SettingsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "HEAD_SA"]}>
      <SettingsPageContent />
    </RoleGuard>
  );
}

function SettingsPageContent() {
  const { user } = useAuth();

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <Settings className="h-4 w-4" />
            <span>Enterprise System Configuration</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure authentication rules and workflow templates for the repository.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /><CardTitle className="text-base">Workflow Templates</CardTitle></div>
            <CardDescription className="text-xs">Manage scenarios and ordered workflow stages</CardDescription>
          </CardHeader>
          <CardContent><Link href="/settings/workflows"><Button className="gap-2"><Workflow className="h-4 w-4" />Open Workflow Management</Button></Link></CardContent>
        </Card>
        {user?.role === "SUPER_ADMIN" && (
          <Card className="border-border/60 bg-card/70 shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-md">
            <CardHeader className="space-y-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                <RadioTower className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">Telegram Delivery Health</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Monitor Telegram delivery status, retry backlog, and recent failures.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/settings/telegram-delivery-health">
                <Button className="gap-2">
                  <RadioTower className="h-4 w-4" aria-hidden="true" />
                  Open Delivery Monitoring
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Supabase Authentication</CardTitle>
            </div>
            <CardDescription className="text-xs">Managed authentication and session policies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-border/30">
              <span className="text-muted-foreground">Authentication Provider</span>
              <Badge variant="outline" className="font-mono text-[10px]">Supabase Auth</Badge>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/30">
              <span className="text-muted-foreground">Application Roles</span>
              <Badge variant="outline" className="font-mono text-[10px]">4 Roles</Badge>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Profile Storage</span>
              <Badge variant="outline" className="font-mono text-[10px]">Supabase Database</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-base">Repository Storage</CardTitle>
            </div>
            <CardDescription className="text-xs">Document repository cloud storage endpoint</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-border/30">
              <span className="text-muted-foreground">Storage Provider</span>
              <Badge variant="success" className="font-mono text-[10px]">Supabase Storage</Badge>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/30">
              <span className="text-muted-foreground">Access</span>
              <span className="font-mono text-foreground">Backend-signed download URLs</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Bucket</span>
              <span className="font-mono text-foreground">Environment configured</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
