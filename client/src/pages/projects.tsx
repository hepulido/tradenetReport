import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FolderKanban, Search, Trash2, X, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { ProjectCard } from "@/components/project-card";
import { ProjectCardSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { apiRequest } from "@/lib/queryClient";
import type { Project } from "@/lib/types";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// Status configuration
const STATUS_CONFIG = {
  active: { label: "Active", color: "bg-green-100 text-green-800 border-green-200" },
  completed: { label: "Completed", color: "bg-blue-100 text-blue-800 border-blue-200" },
  on_hold: { label: "On Hold", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200" },
} as const;

type ProjectStatus = keyof typeof STATUS_CONFIG;

export default function Projects() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Multi-select state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      status: string;
      startDate?: string;
      endDate?: string;
    }) => {
      return await apiRequest("POST", `/api/companies/${selectedCompany!.id}/projects`, {
        companyId: selectedCompany!.id,
        name: data.name,
        status: data.status,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "projects"],
      });
      setShowCreateDialog(false);
      toast({
        title: "Project Created",
        description: "The project has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Delete projects one by one
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/projects/${id}`, { method: "DELETE" })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "projects"],
      });
      setSelectedIds(new Set());
      setIsSelecting(false);
      setShowDeleteConfirm(false);
      toast({
        title: "Projects Deleted",
        description: `${selectedIds.size} project(s) have been deleted.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete some projects. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredProjects = projects?.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Group projects by status (using correct status values)
  const projectsByStatus = {
    active: filteredProjects?.filter((p) => p.status === "active") || [],
    completed: filteredProjects?.filter((p) => p.status === "completed") || [],
    on_hold: filteredProjects?.filter((p) => p.status === "on_hold") || [],
    cancelled: filteredProjects?.filter((p) => p.status === "cancelled") || [],
  };

  const toggleSelectProject = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAllVisible = () => {
    const newSelected = new Set(selectedIds);
    filteredProjects?.forEach((p) => newSelected.add(p.id));
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  };

  const handleProjectClick = (project: Project) => {
    if (isSelecting) {
      toggleSelectProject(project.id);
    } else {
      navigate(`/projects/${project.id}/crm`);
    }
  };

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={FolderKanban}
          title="No Company Selected"
          description="Please select or create a company to view projects."
        />
      </div>
    );
  }

  const renderProjectSection = (status: ProjectStatus, projectList: Project[]) => {
    if (projectList.length === 0) return null;
    const config = STATUS_CONFIG[status];

    return (
      <div key={status}>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">{config.label}</h2>
          <Badge variant="outline" className={config.color}>
            {projectList.length}
          </Badge>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {projectList.map((project) => (
            <div key={project.id} className="relative">
              {isSelecting && (
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedIds.has(project.id)}
                    onCheckedChange={() => toggleSelectProject(project.id)}
                    className="h-5 w-5 bg-white border-2"
                  />
                </div>
              )}
              <div
                className={cn(
                  isSelecting && selectedIds.has(project.id) && "ring-2 ring-primary rounded-lg"
                )}
              >
                <ProjectCard
                  project={project}
                  onClick={() => handleProjectClick(project)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-projects-title">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage projects for {selectedCompany.name}
          </p>
        </div>
        <div className="flex gap-2">
          {isSelecting ? (
            <>
              <Button variant="outline" onClick={selectAllVisible}>
                <CheckSquare className="h-4 w-4 mr-2" />
                Select All
              </Button>
              <Button variant="outline" onClick={clearSelection}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedIds.size})
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsSelecting(true)}>
                <CheckSquare className="h-4 w-4 mr-2" />
                Select
              </Button>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-project">
                <Plus className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      ) : filteredProjects && filteredProjects.length > 0 ? (
        <div className="space-y-8">
          {renderProjectSection("active", projectsByStatus.active)}
          {renderProjectSection("completed", projectsByStatus.completed)}
          {renderProjectSection("on_hold", projectsByStatus.on_hold)}
          {renderProjectSection("cancelled", projectsByStatus.cancelled)}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title="No Projects Found"
          description={
            searchQuery || statusFilter !== "all"
              ? "No projects match your search criteria. Try adjusting your filters."
              : "Create your first project to start tracking costs and revenue."
          }
          action={
            !searchQuery && statusFilter === "all"
              ? {
                  label: "Create Project",
                  onClick: () => setShowCreateDialog(true),
                }
              : undefined
          }
        />
      )}

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
        }}
        isSubmitting={createMutation.isPending}
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Project(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete these projects? This will also delete all related
              invoices, payroll entries, and daily logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              className="bg-red-600 hover:bg-red-700"
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
