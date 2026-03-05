// Role-based permissions
// Owner/Admin: Full access to everything
// Member: Limited access - can work on projects but can't manage team/billing

export type Role = "owner" | "admin" | "member";

export const PERMISSIONS = {
  // Billing & Subscription
  "billing:view": ["owner", "admin"],
  "billing:manage": ["owner", "admin"],

  // Team Management
  "team:view": ["owner", "admin", "member"],
  "team:invite": ["owner", "admin"],
  "team:remove": ["owner", "admin"],
  "team:change-role": ["owner"], // Only owner can change roles

  // Company Settings
  "settings:view": ["owner", "admin", "member"],
  "settings:edit": ["owner", "admin"],

  // Projects
  "projects:view": ["owner", "admin", "member"],
  "projects:create": ["owner", "admin"],
  "projects:edit": ["owner", "admin", "member"],
  "projects:delete": ["owner", "admin"],

  // Invoices & Payments
  "invoices:view": ["owner", "admin", "member"],
  "invoices:create": ["owner", "admin", "member"],
  "invoices:edit": ["owner", "admin", "member"],
  "invoices:delete": ["owner", "admin"],

  // Change Orders
  "change-orders:view": ["owner", "admin", "member"],
  "change-orders:create": ["owner", "admin", "member"],
  "change-orders:edit": ["owner", "admin", "member"],
  "change-orders:delete": ["owner", "admin"],

  // Reports
  "reports:view": ["owner", "admin", "member"],
  "reports:generate": ["owner", "admin"],

  // Payroll
  "payroll:view": ["owner", "admin"],
  "payroll:edit": ["owner", "admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(role as any);
}

export function isAdminOrOwner(role: Role | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isOwner(role: Role | null | undefined): boolean {
  return role === "owner";
}

// Hook-friendly version
export function usePermissions(role: Role | null | undefined) {
  return {
    can: (permission: Permission) => hasPermission(role, permission),
    isAdmin: isAdminOrOwner(role),
    isOwner: isOwner(role),
    role,
  };
}
