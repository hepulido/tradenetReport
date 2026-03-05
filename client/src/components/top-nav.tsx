import { useLocation, Link } from "wouter";
import { LayoutDashboard, FolderKanban, FileBarChart, Users, Settings, LogOut, User, CreditCard, UserPlus, FileText, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CompanySelector } from "@/components/company-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/components/auth-context";
import { useCompany } from "@/components/company-context";
import { usePermissions } from "@/lib/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/estimates", icon: FileText, label: "Estimates" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/daily-logs", icon: Calendar, label: "Daily Logs" },
  { href: "/payroll", icon: Users, label: "Payroll" },
  { href: "/reports", icon: FileBarChart, label: "Reports" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface TopNavProps {
  onCreateCompany?: () => void;
  onTeamInvite?: () => void;
}

export function TopNav({ onCreateCompany, onTeamInvite }: TopNavProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const { currentCompany, currentRole } = useCompany();
  const { can, isAdmin } = usePermissions(currentRole);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">JC</span>
            </div>
            <span className="font-semibold text-lg hidden sm:inline">JobCost AI</span>
          </Link>
          <CompanySelector onCreateNew={onCreateCompany} />
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));

            return (
              <Button
                key={item.href}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                data-testid={`nav-${item.label.toLowerCase()}`}
                asChild
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user && <NotificationBell />}
          <ThemeToggle />

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.photoUrl || undefined} alt={user.displayName || ""} />
                    <AvatarFallback>{getInitials(user.displayName, user.email)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.displayName || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    {currentRole && (
                      <p className="text-xs leading-none text-muted-foreground capitalize mt-1">
                        Role: {currentRole}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {isAdmin && onTeamInvite && (
                  <DropdownMenuItem onClick={onTeamInvite}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Team Member
                  </DropdownMenuItem>
                )}

                {can("billing:view") && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings?tab=billing">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Billing & Subscription
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <User className="mr-2 h-4 w-4" />
                    Account Settings
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
