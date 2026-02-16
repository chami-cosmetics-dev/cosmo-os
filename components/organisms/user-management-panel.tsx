"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Loader2, Mail, Copy, XCircle, UserPlus, ShieldPlus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";

type Location = { id: string; name: string };
type Department = { id: string; name: string };
type Designation = { id: string; name: string };

type Permission = {
  id: string;
  key: string;
  description: string | null;
};

type Role = {
  id: string;
  name: string;
  description: string | null;
  rolePermissions: Array<{ permission: Permission }>;
  _count: {
    userRoles: number;
  };
};

type User = {
  id: string;
  name: string | null;
  email: string | null;
  auth0Id: string;
  userRoles: Array<{
    role: {
      id: string;
      name: string;
    };
  }>;
};

type PendingInvite = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  role: { id: string; name: string };
  invitedBy: { id: string; name: string | null; email: string | null } | null;
  location: { id: string; name: string } | null;
};

interface UserManagementPanelProps {
  initialUsers: User[];
  initialRoles: Role[];
  initialPermissions: Permission[];
  initialLocations?: Location[];
  initialDepartments?: Department[];
  initialDesignations?: Designation[];
  initialPendingInvites?: PendingInvite[];
  canManageUsers: boolean;
  canManageRoles: boolean;
}

export function UserManagementPanel({
  initialUsers,
  initialRoles,
  initialPermissions,
  initialLocations,
  initialDepartments,
  initialDesignations,
  initialPendingInvites,
  canManageUsers,
  canManageRoles,
}: UserManagementPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [roles, setRoles] = useState(initialRoles);
  const [permissions] = useState(initialPermissions);
  const [draftRoleName, setDraftRoleName] = useState("");
  const [draftRoleDescription, setDraftRoleDescription] = useState("");
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<string[]>([]);
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string[]>>(() =>
    mapAssignments(initialUsers)
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteEmployeeNumber, setInviteEmployeeNumber] = useState("");
  const [inviteEpfNumber, setInviteEpfNumber] = useState("");
  const [inviteLocationId, setInviteLocationId] = useState("");
  const [inviteDepartmentId, setInviteDepartmentId] = useState("");
  const [inviteDesignationId, setInviteDesignationId] = useState("");
  const [inviteAppointmentDate, setInviteAppointmentDate] = useState("");
  const [showInviteEmployeeDetails, setShowInviteEmployeeDetails] = useState(false);
  const [locations, setLocations] = useState<Location[]>(initialLocations ?? []);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments ?? []);
  const [designations, setDesignations] = useState<Designation[]>(initialDesignations ?? []);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleDescription, setEditRoleDescription] = useState("");
  const [editRolePermissionKeys, setEditRolePermissionKeys] = useState<string[]>(
    []
  );
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>(
    initialPendingInvites ?? []
  );
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(10);
  const [rolesPage, setRolesPage] = useState(1);
  const [rolesLimit, setRolesLimit] = useState(10);
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [createRoleSheetOpen, setCreateRoleSheetOpen] = useState(false);
  const [editingUserRolesId, setEditingUserRolesId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    const res = await fetch("/api/admin/invites", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { invites: PendingInvite[] };
    setPendingInvites(data.invites ?? []);
  }, []);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.name.localeCompare(b.name)),
    [roles]
  );

  const paginatedUsers = useMemo(() => {
    const start = (usersPage - 1) * usersLimit;
    return users.slice(start, start + usersLimit);
  }, [users, usersPage, usersLimit]);

  const paginatedRoles = useMemo(() => {
    const start = (rolesPage - 1) * rolesLimit;
    return sortedRoles.slice(start, start + rolesLimit);
  }, [sortedRoles, rolesPage, rolesLimit]);

  const permissionsByGroup = useMemo(
    () => groupPermissionsByPrefix(permissions),
    [permissions]
  );

  const assignableRoles = useMemo(
    () => sortedRoles.filter((r) => r.name !== "super_admin"),
    [sortedRoles]
  );

  const isBusy = busyKey !== null;

  useEffect(() => {
    if (
      initialLocations !== undefined ||
      initialDepartments !== undefined ||
      initialDesignations !== undefined
    ) {
      return;
    }
    Promise.all([
      fetch("/api/admin/company/locations"),
      fetch("/api/admin/company/departments"),
      fetch("/api/admin/company/designations"),
    ]).then(([locRes, deptRes, desRes]) => {
      if (locRes.ok) locRes.json().then((d: Location[]) => setLocations(d));
      if (deptRes.ok) deptRes.json().then((d: Department[]) => setDepartments(d));
      if (desRes.ok) desRes.json().then((d: Designation[]) => setDesignations(d));
    });
  }, [initialLocations, initialDepartments, initialDesignations]);

  useEffect(() => {
    if (canManageUsers && initialPendingInvites === undefined) fetchInvites();
  }, [canManageUsers, initialPendingInvites, fetchInvites]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(users.length / usersLimit));
    if (usersPage > maxPage) setUsersPage(maxPage);
  }, [users.length, usersLimit, usersPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(sortedRoles.length / rolesLimit));
    if (rolesPage > maxPage) setRolesPage(maxPage);
  }, [sortedRoles.length, rolesLimit, rolesPage]);

  function togglePermission(key: string) {
    setSelectedPermissionKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  function toggleEditRolePermission(key: string) {
    setEditRolePermissionKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  function startEditingRole(role: Role) {
    setEditingRoleId(role.id);
    setEditRoleName(role.name);
    setEditRoleDescription(role.description ?? "");
    setEditRolePermissionKeys(
      role.rolePermissions.map((rp) => rp.permission.key)
    );
  }

  function cancelEditingRole() {
    setEditingRoleId(null);
    setEditRoleName("");
    setEditRoleDescription("");
    setEditRolePermissionKeys([]);
  }

  function toggleUserRole(userId: string, roleId: string) {
    setDraftAssignments((current) => {
      const existing = current[userId] ?? [];
      return {
        ...current,
        [userId]: existing.includes(roleId)
          ? existing.filter((id) => id !== roleId)
          : [...existing, roleId],
      };
    });
  }

  async function refreshData() {
    const response = await fetch("/api/admin/rbac", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to refresh data");
    }

    const data = await response.json();
    setUsers(data.users);
    setRoles(data.roles);
    setDraftAssignments(mapAssignments(data.users));
    if (canManageUsers) await fetchInvites();
  }

  async function saveUserRoles(userId: string) {
    try {
      setBusyKey(`user-${userId}`);
      const roleIds = draftAssignments[userId] ?? [];
      const response = await fetch(`/api/admin/users/${userId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to update roles");
      }

      await refreshData();
      notify.success("User roles updated.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to update roles.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createRole(): Promise<boolean> {
    if (!draftRoleName.trim()) {
      notify.error("Role name is required.");
      return false;
    }

    try {
      setBusyKey("create-role");
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftRoleName,
          description: draftRoleDescription || undefined,
          permissionKeys: selectedPermissionKeys,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to create role");
      }

      setDraftRoleName("");
      setDraftRoleDescription("");
      setSelectedPermissionKeys([]);
      await refreshData();
      notify.success("Role created.");
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to create role.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function inviteUser(): Promise<boolean> {
    if (!inviteEmail.trim() || !inviteRoleId) {
      notify.error("Email and role are required.");
      return false;
    }

    try {
      setBusyKey("invite-user");
      const body: Record<string, unknown> = {
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
      };
      if (inviteEmployeeNumber.trim()) body.employeeNumber = inviteEmployeeNumber.trim();
      if (inviteEpfNumber.trim()) body.epfNumber = inviteEpfNumber.trim();
      if (inviteLocationId) body.locationId = inviteLocationId;
      if (inviteDepartmentId) body.departmentId = inviteDepartmentId;
      if (inviteDesignationId) body.designationId = inviteDesignationId;
      if (inviteAppointmentDate.trim()) body.appointmentDate = inviteAppointmentDate.trim();
      const response = await fetch("/api/invite/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to send invite");
      }

      setInviteEmail("");
      setInviteRoleId("");
      setInviteEmployeeNumber("");
      setInviteEpfNumber("");
      setInviteLocationId("");
      setInviteDepartmentId("");
      setInviteDesignationId("");
      setInviteAppointmentDate("");
      await fetchInvites();
      notify.success("Invitation sent. Check your email for the activation link.");
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to send invite.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function resendInvite(inviteId: string) {
    try {
      setBusyKey(`resend-invite-${inviteId}`);
      const res = await fetch(`/api/admin/invites/${inviteId}/resend`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to resend invite");
      }
      await fetchInvites();
      notify.success("Invitation resent.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to resend invite.");
    } finally {
      setBusyKey(null);
    }
  }

  async function copyInviteLink(inviteId: string) {
    try {
      setBusyKey(`copy-link-${inviteId}`);
      const res = await fetch(`/api/admin/invites/${inviteId}/link`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to get link");
      }
      const data = (await res.json()) as { activationUrl: string };
      await navigator.clipboard.writeText(data.activationUrl);
      notify.success("Invite link copied to clipboard.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to copy link.");
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelInvite(inviteId: string, email: string) {
    const confirmed = window.confirm(
      `Cancel the invitation for ${email}? They will no longer be able to use the invite link.`
    );
    if (!confirmed) return;

    try {
      setBusyKey(`cancel-invite-${inviteId}`);
      const res = await fetch(`/api/admin/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to cancel invite");
      }
      await fetchInvites();
      notify.success("Invitation cancelled.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to cancel invite.");
    } finally {
      setBusyKey(null);
    }
  }

  function formatExpiry(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `Expires in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainder = mins % 60;
    return remainder > 0 ? `Expires in ${hours}h ${remainder}m` : `Expires in ${hours}h`;
  }

  async function removeUser(userId: string, userName: string) {
    const confirmed = window.confirm(
      `Remove user "${userName}"? They will no longer be able to sign in.`
    );
    if (!confirmed) return;

    try {
      setBusyKey(`remove-user-${userId}`);
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to remove user");
      }

      await refreshData();
      notify.success("User removed.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to remove user.");
    } finally {
      setBusyKey(null);
    }
  }

  async function updateRole(roleId: string) {
    if (!editRoleName.trim()) {
      notify.error("Role name is required.");
      return;
    }

    try {
      setBusyKey(`update-role-${roleId}`);
      const response = await fetch(`/api/admin/roles/${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editRoleName.trim(),
          description: editRoleDescription.trim() || undefined,
          permissionKeys: editRolePermissionKeys,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to update role");
      }

      cancelEditingRole();
      await refreshData();
      notify.success("Role updated.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to update role.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteRole(roleId: string, roleName: string) {
    const confirmed = window.confirm(`Delete role "${roleName}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setBusyKey(`delete-role-${roleId}`);
      const response = await fetch(`/api/admin/roles/${roleId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to delete role");
      }

      await refreshData();
      notify.success("Role deleted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to delete role.");
    } finally {
      setBusyKey(null);
    }
  }

  const editingUser = editingUserRolesId
    ? users.find((u) => u.id === editingUserRolesId)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "users"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Users
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "roles"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Roles
        </button>
      </div>

      {activeTab === "users" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Users</CardTitle>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Manage users and their role assignments.
                </p>
              </div>
              {canManageUsers && (
                <Button size="sm" onClick={() => setInviteSheetOpen(true)}>
                  <UserPlus className="mr-1.5 size-4" aria-hidden />
                  Invite user
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManageUsers && pendingInvites.length > 0 && (
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                  Pending ({pendingInvites.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {pendingInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
                    >
                      <span className="font-medium">{inv.email}</span>
                      <span className="text-muted-foreground text-xs">
                        {inv.role.name} · {formatExpiry(inv.expiresAt)}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => resendInvite(inv.id)}
                          disabled={isBusy}
                          aria-label="Resend invite"
                        >
                          {busyKey === `resend-invite-${inv.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Mail className="size-3.5" aria-hidden />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => copyInviteLink(inv.id)}
                          disabled={isBusy}
                          aria-label="Copy link"
                        >
                          <Copy className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => cancelInvite(inv.id, inv.email)}
                          disabled={isBusy}
                          aria-label="Cancel invite"
                        >
                          <XCircle className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paginatedUsers.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No users yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium">Name</th>
                        <th className="px-4 py-2.5 text-left font-medium">Email</th>
                        <th className="px-4 py-2.5 text-left font-medium">Roles</th>
                        {canManageUsers && (
                          <th className="w-24 px-4 py-2.5 text-right font-medium">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => {
                        const assignedRoles = draftAssignments[user.id] ?? [];
                        const isSuperAdmin = user.userRoles.some(
                          (ur) => ur.role.name === "super_admin"
                        );
                        const roleNames = isSuperAdmin
                          ? ["super_admin"]
                          : assignedRoles
                              .map((rid) => sortedRoles.find((r) => r.id === rid)?.name)
                              .filter(Boolean) as string[];
                        return (
                          <tr key={user.id} className="border-b last:border-0">
                            <td className="px-4 py-2.5 font-medium">
                              {user.name ?? "Unnamed"}
                            </td>
                            <td className="text-muted-foreground px-4 py-2.5">
                              {user.email ?? user.auth0Id}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {roleNames.map((name) => (
                                  <span
                                    key={name}
                                    className="bg-muted rounded px-1.5 py-0.5 text-xs"
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            {canManageUsers && (
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => setEditingUserRolesId(user.id)}
                                    disabled={isBusy}
                                    aria-label="Edit roles"
                                  >
                                    <Pencil className="size-4" aria-hidden />
                                  </Button>
                                  {!isSuperAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 text-destructive hover:text-destructive"
                                      onClick={() =>
                                        removeUser(
                                          user.id,
                                          user.name ?? user.email ?? "this user"
                                        )
                                      }
                                      disabled={isBusy}
                                      aria-label="Remove user"
                                    >
                                      <Trash2 className="size-4" aria-hidden />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={usersPage}
                  limit={usersLimit}
                  total={users.length}
                  onPageChange={setUsersPage}
                  onLimitChange={(l) => {
                    setUsersLimit(l);
                    setUsersPage(1);
                  }}
                  limitOptions={[10, 25, 50, 100]}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "roles" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Roles</CardTitle>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Manage roles and their permissions.
                </p>
              </div>
              {canManageRoles && (
                <Button size="sm" onClick={() => setCreateRoleSheetOpen(true)}>
                  <ShieldPlus className="mr-1.5 size-4" aria-hidden />
                  Create role
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {paginatedRoles.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No roles yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium">Name</th>
                        <th className="px-4 py-2.5 text-left font-medium">Description</th>
                        <th className="px-4 py-2.5 text-left font-medium">Permissions</th>
                        <th className="px-4 py-2.5 text-right font-medium">Users</th>
                        {canManageRoles && (
                          <th className="w-24 px-4 py-2.5 text-right font-medium">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRoles.map((role) => {
                        const canEdit =
                          canManageRoles &&
                          role.name !== "admin" &&
                          role.name !== "super_admin";
                        const permKeys = role.rolePermissions.map(
                          (rp) => rp.permission.key
                        );
                        return (
                          <tr
                            key={role.id}
                            className="border-b last:border-0"
                          >
                            <td className="px-4 py-2.5 font-medium">{role.name}</td>
                            <td className="text-muted-foreground max-w-[200px] truncate px-4 py-2.5 text-xs">
                              {role.description ?? "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex max-w-[280px] flex-wrap items-center gap-1">
                                {permKeys.slice(0, 5).map((k) => (
                                  <span
                                    key={k}
                                    className="bg-muted rounded px-1.5 py-0.5 text-xs"
                                  >
                                    {k}
                                  </span>
                                ))}
                                {permKeys.length > 5 && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-2"
                                      >
                                        +{permKeys.length - 5} more
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="start"
                                      className="max-h-64 w-72 overflow-y-auto"
                                    >
                                      <div className="space-y-1 p-2">
                                        <p className="text-muted-foreground mb-2 text-xs font-medium">
                                          All permissions ({permKeys.length})
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {permKeys.map((k) => (
                                            <span
                                              key={k}
                                              className="bg-muted rounded px-1.5 py-0.5 text-xs"
                                            >
                                              {k}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              {role._count.userRoles}
                            </td>
                            {canManageRoles && (
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex justify-end gap-1">
                                  {canEdit && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8"
                                        onClick={() => startEditingRole(role)}
                                        disabled={isBusy}
                                        aria-label="Edit role"
                                      >
                                        <Pencil className="size-4" aria-hidden />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 text-destructive hover:text-destructive"
                                        onClick={() => deleteRole(role.id, role.name)}
                                        disabled={isBusy}
                                        aria-label="Delete role"
                                      >
                                        <Trash2 className="size-4" aria-hidden />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={rolesPage}
                  limit={rolesLimit}
                  total={sortedRoles.length}
                  onPageChange={setRolesPage}
                  onLimitChange={(l) => {
                    setRolesLimit(l);
                    setRolesPage(1);
                  }}
                  limitOptions={[10, 25, 50]}
                  className="mt-4"
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite user sheet */}
      <Sheet open={inviteSheetOpen} onOpenChange={setInviteSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Invite user</SheetTitle>
            <SheetDescription>
              Send an invitation email. The recipient will set their password via the link.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="invite-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invite-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                disabled={isBusy}
                className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
              >
                <option value="">Select role</option>
                {sortedRoles
                  .filter((r) => r.name !== "super_admin")
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowInviteEmployeeDetails((v) => !v)}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              {showInviteEmployeeDetails ? "Hide" : "Add"} employee details (optional)
            </button>
            {showInviteEmployeeDetails && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs">Employee #</label>
                    <Input
                      value={inviteEmployeeNumber}
                      onChange={(e) => setInviteEmployeeNumber(e.target.value)}
                      disabled={isBusy}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs">EPF #</label>
                    <Input
                      value={inviteEpfNumber}
                      onChange={(e) => setInviteEpfNumber(e.target.value)}
                      disabled={isBusy}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs">Location</label>
                  <select
                    value={inviteLocationId}
                    onChange={(e) => setInviteLocationId(e.target.value)}
                    disabled={isBusy}
                    className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
                  >
                    <option value="">Select</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs">Department</label>
                    <select
                      value={inviteDepartmentId}
                      onChange={(e) => setInviteDepartmentId(e.target.value)}
                      disabled={isBusy}
                      className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
                    >
                      <option value="">Select</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs">Designation</label>
                    <select
                      value={inviteDesignationId}
                      onChange={(e) => setInviteDesignationId(e.target.value)}
                      disabled={isBusy}
                      className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
                    >
                      <option value="">Select</option>
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs">Appointment date</label>
                  <Input
                    type="date"
                    value={inviteAppointmentDate}
                    onChange={(e) => setInviteAppointmentDate(e.target.value)}
                    disabled={isBusy}
                  />
                </div>
              </div>
            )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setInviteSheetOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const ok = await inviteUser();
                if (ok) setInviteSheetOpen(false);
              }}
              disabled={isBusy}
            >
              {busyKey === "invite-user" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send invite"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Create role sheet */}
      <Sheet open={createRoleSheetOpen} onOpenChange={setCreateRoleSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create role</SheetTitle>
            <SheetDescription>
              Define a new role and assign permissions.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g. support-manager"
                value={draftRoleName}
                onChange={(e) => setDraftRoleName(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="Brief description"
                value={draftRoleDescription}
                onChange={(e) => setDraftRoleDescription(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Permissions</p>
              <div className="space-y-3">
                {permissionsByGroup.map(({ group, permissions: perms }) => (
                  <div key={group}>
                    <p className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map((p) => (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissionKeys.includes(p.key)}
                            onChange={() => togglePermission(p.key)}
                            disabled={isBusy}
                            className="rounded"
                          />
                          {p.key}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreateRoleSheetOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const ok = await createRole();
                if (ok) setCreateRoleSheetOpen(false);
              }}
              disabled={isBusy}
            >
              {busyKey === "create-role" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Creating...
                </>
              ) : (
                "Create role"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit user roles sheet */}
      <Sheet
        open={!!editingUserRolesId}
        onOpenChange={(open) => !open && setEditingUserRolesId(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit roles</SheetTitle>
            <SheetDescription>
              {editingUser && (
                <>Assign roles for {editingUser.name ?? editingUser.email ?? "this user"}.</>
              )}
            </SheetDescription>
          </SheetHeader>
          {editingUser && (
            <div className="space-y-4 py-4">
              <div className="flex flex-wrap gap-2">
                {assignableRoles.map((role) => {
                  const assignedRoles = draftAssignments[editingUser.id] ?? [];
                  const checked = assignedRoles.includes(role.id);
                  return (
                    <label
                      key={role.id}
                      className="flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUserRole(editingUser.id, role.id)}
                        disabled={isBusy}
                        className="rounded"
                      />
                      {role.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUserRolesId(null)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (editingUserRolesId) {
                  await saveUserRoles(editingUserRolesId);
                  setEditingUserRolesId(null);
                }
              }}
              disabled={isBusy}
            >
              {busyKey === `user-${editingUserRolesId}` ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                "Save roles"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit role sheet */}
      <Sheet
        open={!!editingRoleId}
        onOpenChange={(open) => !open && cancelEditingRole()}
      >
          <SheetContent className="overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Edit role</SheetTitle>
              <SheetDescription>
                Update role name, description, and permissions.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  value={editRoleDescription}
                  onChange={(e) => setEditRoleDescription(e.target.value)}
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Permissions</p>
                <div className="space-y-3">
                  {permissionsByGroup.map(({ group, permissions: perms }) => (
                    <div key={group}>
                      <p className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">
                        {group}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {perms.map((p) => (
                          <label
                            key={p.id}
                            className="flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              checked={editRolePermissionKeys.includes(p.key)}
                              onChange={() => toggleEditRolePermission(p.key)}
                              disabled={isBusy}
                              className="rounded"
                            />
                            {p.key}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={cancelEditingRole} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (editingRoleId) {
                    await updateRole(editingRoleId);
                    cancelEditingRole();
                  }
                }}
                disabled={isBusy}
              >
                {editingRoleId && busyKey === `update-role-${editingRoleId}` ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
    </div>
  );
}

function mapAssignments(users: User[]) {
  return users.reduce<Record<string, string[]>>((acc, user) => {
    acc[user.id] = user.userRoles.map((userRole) => userRole.role.id);
    return acc;
  }, {});
}

/** Group permissions by prefix (e.g. users.read → "Users") for better UX */
function groupPermissionsByPrefix(
  permissions: Permission[]
): Array<{ group: string; permissions: Permission[] }> {
  const map = new Map<string, Permission[]>();
  for (const p of permissions) {
    const prefix = p.key.split(".")[0] ?? "other";
    const group =
      prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/_/g, " ");
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(p);
  }
  const order = ["Users", "Staff", "Roles", "Settings", "Products"];
  return order
    .filter((g) => map.has(g))
    .map((group) => ({ group, permissions: map.get(group)! }))
    .concat(
      [...map.entries()]
        .filter(([g]) => !order.includes(g))
        .map(([group, permissions]) => ({ group, permissions }))
    );
}
