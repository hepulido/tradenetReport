import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCompany } from "@/components/company-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Settings as SettingsIcon, Bell, AlertTriangle, Calendar, Link2, Link2Off, RefreshCw, X } from "lucide-react";
import { SiQuickbooks } from "react-icons/si";

interface CompanySettings {
  id: string;
  companyId: string;
  reportDay: string;
  reportTime: string;
  reportTimezone: string;
  marginThreshold: string;
  costSpikeThreshold: string;
  largeTxnThreshold: string;
  laborShareThreshold: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  whatsappNotifications: boolean;
  emailList: string[] | null;
  phoneList: string[] | null;
}

interface QbStatus {
  connected: boolean;
  status: string;
  lastSyncAt: string | null;
  realmId: string | null;
}

const DAYS_OF_WEEK = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
];

export default function Settings() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/settings", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch(`/api/settings?companyId=${selectedCompany?.id}`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    enabled: !!selectedCompany,
  });

  const { data: qbStatus, isLoading: qbLoading } = useQuery<QbStatus>({
    queryKey: ["/api/integrations/quickbooks/status", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch(`/api/integrations/quickbooks/status?companyId=${selectedCompany?.id}`);
      if (!res.ok) throw new Error("Failed to fetch QB status");
      return res.json();
    },
    enabled: !!selectedCompany,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<CompanySettings>) => {
      return await apiRequest("PUT", `/api/settings?companyId=${selectedCompany?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings", selectedCompany?.id] });
      toast({ title: "Settings saved", description: "Your settings have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const disconnectQbMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/integrations/quickbooks/disconnect?companyId=${selectedCompany?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/status", selectedCompany?.id] });
      toast({ title: "Disconnected", description: "QuickBooks has been disconnected." });
    },
  });

  const syncQbMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/integrations/quickbooks/sync-now?companyId=${selectedCompany?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/status", selectedCompany?.id] });
      toast({ title: "Sync Complete", description: "QuickBooks data has been synced." });
    },
  });

  const handleUpdateSetting = (key: keyof CompanySettings, value: unknown) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  const handleAddEmail = () => {
    if (!newEmail || !newEmail.includes("@")) return;
    const currentList = settings?.emailList || [];
    if (!currentList.includes(newEmail)) {
      handleUpdateSetting("emailList", [...currentList, newEmail]);
      setNewEmail("");
    }
  };

  const handleRemoveEmail = (email: string) => {
    const currentList = settings?.emailList || [];
    handleUpdateSetting("emailList", currentList.filter(e => e !== email));
  };

  const handleAddPhone = () => {
    if (!newPhone) return;
    const currentList = settings?.phoneList || [];
    if (!currentList.includes(newPhone)) {
      handleUpdateSetting("phoneList", [...currentList, newPhone]);
      setNewPhone("");
    }
  };

  const handleRemovePhone = (phone: string) => {
    const currentList = settings?.phoneList || [];
    handleUpdateSetting("phoneList", currentList.filter(p => p !== phone));
  };

  const handleConnectQb = async () => {
    const response = await fetch(`/api/integrations/quickbooks/connect?companyId=${selectedCompany?.id}`);
    const data = await response.json();
    if (data.authUrl) {
      toast({ 
        title: "Demo Mode", 
        description: "QuickBooks OAuth is not configured. This is a placeholder URL.",
      });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <SettingsIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Please select a company to view settings.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-8">
      <div className="px-4 md:px-6 py-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Report Schedule</CardTitle>
            </div>
            <CardDescription>Configure when weekly reports are generated and sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reportDay">Day of Week</Label>
                <Select
                  value={settings?.reportDay || "monday"}
                  onValueChange={(value) => handleUpdateSetting("reportDay", value)}
                >
                  <SelectTrigger id="reportDay" data-testid="select-report-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reportTime">Time</Label>
                <Input
                  id="reportTime"
                  type="time"
                  value={settings?.reportTime || "08:00"}
                  onChange={(e) => handleUpdateSetting("reportTime", e.target.value)}
                  data-testid="input-report-time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reportTimezone">Timezone</Label>
                <Select
                  value={settings?.reportTimezone || "America/New_York"}
                  onValueChange={(value) => handleUpdateSetting("reportTimezone", value)}
                >
                  <SelectTrigger id="reportTimezone" data-testid="select-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Alert Thresholds</CardTitle>
            </div>
            <CardDescription>Set thresholds that trigger alerts in your reports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marginThreshold">Minimum Gross Margin (%)</Label>
                <Input
                  id="marginThreshold"
                  type="number"
                  min="0"
                  max="100"
                  value={settings?.marginThreshold || "25"}
                  onChange={(e) => handleUpdateSetting("marginThreshold", e.target.value)}
                  data-testid="input-margin-threshold"
                />
                <p className="text-xs text-muted-foreground">Alert when project margin falls below this percentage</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costSpikeThreshold">Cost Spike Threshold (%)</Label>
                <Input
                  id="costSpikeThreshold"
                  type="number"
                  min="0"
                  max="100"
                  value={settings?.costSpikeThreshold || "10"}
                  onChange={(e) => handleUpdateSetting("costSpikeThreshold", e.target.value)}
                  data-testid="input-cost-spike-threshold"
                />
                <p className="text-xs text-muted-foreground">Alert when weekly costs increase by this percentage</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="largeTxnThreshold">Large Transaction ($)</Label>
                <Input
                  id="largeTxnThreshold"
                  type="number"
                  min="0"
                  value={settings?.largeTxnThreshold || "20000"}
                  onChange={(e) => handleUpdateSetting("largeTxnThreshold", e.target.value)}
                  data-testid="input-large-txn-threshold"
                />
                <p className="text-xs text-muted-foreground">Flag individual transactions above this amount</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="laborShareThreshold">Labor Share Threshold (%)</Label>
                <Input
                  id="laborShareThreshold"
                  type="number"
                  min="0"
                  max="100"
                  value={settings?.laborShareThreshold || "50"}
                  onChange={(e) => handleUpdateSetting("laborShareThreshold", e.target.value)}
                  data-testid="input-labor-share-threshold"
                />
                <p className="text-xs text-muted-foreground">Alert when labor exceeds this percentage of total costs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>Configure how you receive report notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive weekly reports via email</p>
                </div>
                <Switch
                  checked={settings?.emailNotifications || false}
                  onCheckedChange={(checked) => handleUpdateSetting("emailNotifications", checked)}
                  data-testid="switch-email-notifications"
                />
              </div>
              {settings?.emailNotifications && (
                <div className="pl-4 border-l-2 border-muted space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                      data-testid="input-add-email"
                    />
                    <Button onClick={handleAddEmail} size="sm" data-testid="button-add-email">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(settings?.emailList || []).map((email) => (
                      <Badge key={email} variant="secondary" className="gap-1">
                        {email}
                        <button onClick={() => handleRemoveEmail(email)} className="ml-1" data-testid={`button-remove-email-${email}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive alerts via text message</p>
                </div>
                <Switch
                  checked={settings?.smsNotifications || false}
                  onCheckedChange={(checked) => handleUpdateSetting("smsNotifications", checked)}
                  data-testid="switch-sms-notifications"
                />
              </div>
              {(settings?.smsNotifications || settings?.whatsappNotifications) && (
                <div className="pl-4 border-l-2 border-muted space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="+1 555 123 4567"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddPhone()}
                      data-testid="input-add-phone"
                    />
                    <Button onClick={handleAddPhone} size="sm" data-testid="button-add-phone">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(settings?.phoneList || []).map((phone) => (
                      <Badge key={phone} variant="secondary" className="gap-1">
                        {phone}
                        <button onClick={() => handleRemovePhone(phone)} className="ml-1" data-testid={`button-remove-phone-${phone}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label>WhatsApp Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive alerts via WhatsApp (coming soon)</p>
              </div>
              <Switch
                checked={settings?.whatsappNotifications || false}
                onCheckedChange={(checked) => handleUpdateSetting("whatsappNotifications", checked)}
                data-testid="switch-whatsapp-notifications"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SiQuickbooks className="h-5 w-5 text-[#2CA01C]" />
              <CardTitle>QuickBooks Integration</CardTitle>
            </div>
            <CardDescription>Connect your QuickBooks account to automatically import transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {qbLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking connection status...</span>
              </div>
            ) : qbStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="bg-green-600 gap-1">
                    <Link2 className="h-3 w-3" />
                    Connected
                  </Badge>
                  {qbStatus.lastSyncAt && (
                    <span className="text-sm text-muted-foreground">
                      Last synced: {new Date(qbStatus.lastSyncAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => syncQbMutation.mutate()}
                    disabled={syncQbMutation.isPending}
                    data-testid="button-sync-qb"
                  >
                    {syncQbMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Now
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => disconnectQbMutation.mutate()}
                    disabled={disconnectQbMutation.isPending}
                    data-testid="button-disconnect-qb"
                  >
                    {disconnectQbMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Link2Off className="h-4 w-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your QuickBooks Online account to automatically import your transactions, invoices, and expenses.
                </p>
                <Button onClick={handleConnectQb} data-testid="button-connect-qb">
                  <SiQuickbooks className="h-4 w-4 mr-2" />
                  Connect to QuickBooks
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {updateSettingsMutation.isPending && (
          <div className="fixed bottom-20 md:bottom-4 right-4 bg-background border rounded-md px-4 py-2 shadow-lg flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Saving...</span>
          </div>
        )}
      </div>
    </div>
  );
}
