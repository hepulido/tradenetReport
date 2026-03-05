import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudSun,
  Users,
  Wrench,
  Package,
  AlertTriangle,
  FileText,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { useAuth } from "@/components/auth-context";
import { EmptyState } from "@/components/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DailyLog, Project } from "@shared/schema";

const WEATHER_OPTIONS = [
  { value: "sunny", label: "Sunny", icon: Sun },
  { value: "partly_cloudy", label: "Partly Cloudy", icon: CloudSun },
  { value: "cloudy", label: "Cloudy", icon: Cloud },
  { value: "rainy", label: "Rainy", icon: CloudRain },
  { value: "snowy", label: "Snowy", icon: CloudSnow },
];

function getWeatherIcon(weather: string | null) {
  const option = WEATHER_OPTIONS.find((w) => w.value === weather);
  if (!option) return <Cloud className="h-4 w-4" />;
  const Icon = option.icon;
  return <Icon className="h-4 w-4" />;
}

export default function DailyLogs() {
  const { selectedCompany } = useCompany();
  const { getToken } = useAuth();
  const { toast } = useToast();

  const [selectedProject, setSelectedProject] = useState<string | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyLog | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    projectId: "",
    logDate: format(new Date(), "yyyy-MM-dd"),
    weather: "sunny",
    temperatureHigh: "",
    temperatureLow: "",
    workersOnSite: "",
    workPerformed: "",
    materialsDelivered: "",
    equipmentUsed: "",
    delays: "",
    safetyIncidents: "",
    visitorLog: "",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      projectId: "",
      logDate: format(new Date(), "yyyy-MM-dd"),
      weather: "sunny",
      temperatureHigh: "",
      temperatureLow: "",
      workersOnSite: "",
      workPerformed: "",
      materialsDelivered: "",
      equipmentUsed: "",
      delays: "",
      safetyIncidents: "",
      visitorLog: "",
      notes: "",
    });
    setEditingLog(null);
  };

  // Fetch projects
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects", { companyId: selectedCompany?.id }],
    enabled: !!selectedCompany,
  });

  // Fetch daily logs
  const { data: logs, isLoading } = useQuery<DailyLog[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "daily-logs", { projectId: selectedProject }],
    queryFn: async () => {
      const token = await getToken();
      const params = new URLSearchParams();
      if (selectedProject !== "all") params.set("projectId", selectedProject);
      const response = await fetch(
        `/api/companies/${selectedCompany!.id}/daily-logs?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Failed to fetch daily logs");
      return response.json();
    },
    enabled: !!selectedCompany,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const token = await getToken();
      const response = await fetch(`/api/companies/${selectedCompany!.id}/daily-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create daily log");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", selectedCompany?.id, "daily-logs"] });
      toast({ title: "Daily log created" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const token = await getToken();
      const response = await fetch(`/api/daily-logs/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update daily log");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", selectedCompany?.id, "daily-logs"] });
      toast({ title: "Daily log updated" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update daily log", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const response = await fetch(`/api/daily-logs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete daily log");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", selectedCompany?.id, "daily-logs"] });
      toast({ title: "Daily log deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete daily log", variant: "destructive" });
    },
  });

  const handleEdit = (log: DailyLog) => {
    setEditingLog(log);
    setFormData({
      projectId: log.projectId,
      logDate: log.logDate,
      weather: log.weather || "sunny",
      temperatureHigh: log.temperatureHigh || "",
      temperatureLow: log.temperatureLow || "",
      workersOnSite: log.workersOnSite?.toString() || "",
      workPerformed: log.workPerformed || "",
      materialsDelivered: log.materialsDelivered || "",
      equipmentUsed: log.equipmentUsed || "",
      delays: log.delays || "",
      safetyIncidents: log.safetyIncidents || "",
      visitorLog: log.visitorLog || "",
      notes: log.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.projectId) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    if (editingLog) {
      updateMutation.mutate({ id: editingLog.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getProjectName = (projectId: string) => {
    return projects?.find((p) => p.id === projectId)?.name || "Unknown Project";
  };

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={Calendar}
          title="No Company Selected"
          description="Please select a company to view daily logs."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Daily Logs</h1>
          <p className="text-muted-foreground mt-1">
            Document daily job site activities and conditions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Log
          </Button>
        </div>
      </div>

      {/* Logs List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No Daily Logs Yet"
          description="Start documenting your job site activities. Daily logs help track progress, weather conditions, and any issues."
          action={{
            label: "Create First Log",
            onClick: () => { resetForm(); setDialogOpen(true); },
          }}
        />
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <Card key={log.id} className="hover-elevate">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {format(parseISO(log.logDate), "EEEE, MMMM d, yyyy")}
                    </CardTitle>
                    <CardDescription>{getProjectName(log.projectId)}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      {getWeatherIcon(log.weather)}
                      {log.temperatureHigh && <span>{log.temperatureHigh}°</span>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(log)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(log.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {log.workersOnSite && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span>{log.workersOnSite} workers</span>
                    </div>
                  )}
                  {log.equipmentUsed && (
                    <div className="flex items-center gap-2 text-sm">
                      <Wrench className="h-4 w-4 text-orange-500" />
                      <span className="truncate">{log.equipmentUsed}</span>
                    </div>
                  )}
                  {log.materialsDelivered && (
                    <div className="flex items-center gap-2 text-sm">
                      <Package className="h-4 w-4 text-green-500" />
                      <span className="truncate">Materials delivered</span>
                    </div>
                  )}
                  {log.delays && (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span>Has delays</span>
                    </div>
                  )}
                </div>

                {log.workPerformed && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Work Performed</p>
                    <p className="text-sm">{log.workPerformed}</p>
                  </div>
                )}

                {log.safetyIncidents && (
                  <Badge variant="destructive" className="mt-2">
                    Safety Incident Reported
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editingLog ? "Edit Daily Log" : "New Daily Log"}
            </DialogTitle>
            <DialogDescription>
              Document the day's activities, weather, and any issues.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Project & Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select
                  value={formData.projectId}
                  onValueChange={(v) => setFormData({ ...formData, projectId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.logDate}
                  onChange={(e) => setFormData({ ...formData, logDate: e.target.value })}
                />
              </div>
            </div>

            {/* Weather */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Weather</Label>
                <Select
                  value={formData.weather}
                  onValueChange={(v) => setFormData({ ...formData, weather: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEATHER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.icon className="h-4 w-4" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>High Temp (°F)</Label>
                <Input
                  type="number"
                  value={formData.temperatureHigh}
                  onChange={(e) => setFormData({ ...formData, temperatureHigh: e.target.value })}
                  placeholder="85"
                />
              </div>
              <div className="space-y-2">
                <Label>Low Temp (°F)</Label>
                <Input
                  type="number"
                  value={formData.temperatureLow}
                  onChange={(e) => setFormData({ ...formData, temperatureLow: e.target.value })}
                  placeholder="65"
                />
              </div>
            </div>

            {/* Workers & Equipment */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Workers on Site</Label>
                <Input
                  type="number"
                  value={formData.workersOnSite}
                  onChange={(e) => setFormData({ ...formData, workersOnSite: e.target.value })}
                  placeholder="8"
                />
              </div>
              <div className="space-y-2">
                <Label>Equipment Used</Label>
                <Input
                  value={formData.equipmentUsed}
                  onChange={(e) => setFormData({ ...formData, equipmentUsed: e.target.value })}
                  placeholder="Scissor lift, scaffolding"
                />
              </div>
            </div>

            {/* Work Performed */}
            <div className="space-y-2">
              <Label>Work Performed</Label>
              <Textarea
                value={formData.workPerformed}
                onChange={(e) => setFormData({ ...formData, workPerformed: e.target.value })}
                placeholder="Describe the work completed today..."
                rows={3}
              />
            </div>

            {/* Materials Delivered */}
            <div className="space-y-2">
              <Label>Materials Delivered</Label>
              <Textarea
                value={formData.materialsDelivered}
                onChange={(e) => setFormData({ ...formData, materialsDelivered: e.target.value })}
                placeholder="List materials received on site..."
                rows={2}
              />
            </div>

            {/* Delays/Issues */}
            <div className="space-y-2">
              <Label>Delays or Issues</Label>
              <Textarea
                value={formData.delays}
                onChange={(e) => setFormData({ ...formData, delays: e.target.value })}
                placeholder="Document any delays or issues encountered..."
                rows={2}
              />
            </div>

            {/* Safety Incidents */}
            <div className="space-y-2">
              <Label>Safety Incidents</Label>
              <Textarea
                value={formData.safetyIncidents}
                onChange={(e) => setFormData({ ...formData, safetyIncidents: e.target.value })}
                placeholder="Document any safety incidents or concerns..."
                rows={2}
              />
            </div>

            {/* Visitor Log */}
            <div className="space-y-2">
              <Label>Visitor Log</Label>
              <Input
                value={formData.visitorLog}
                onChange={(e) => setFormData({ ...formData, visitorLog: e.target.value })}
                placeholder="Inspector, GC rep, etc."
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any other notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingLog
                ? "Update Log"
                : "Create Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
