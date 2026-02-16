"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Loader2, Mail, Copy, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  async function createRole() {
    if (!draftRoleName.trim()) {
      notify.error("Role name is required.");
      return;
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
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to create role.");
    } finally {
      setBusyKey(null);
    }
  }

  async function inviteUser() {
    if (!inviteEmail.trim() || !inviteRoleId) {
      notify.error("Email and role are required.");
      return;
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
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to send invite.");
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManageUsers && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Invite User</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1 space-y-1">
                  <label htmlFor="invite-email" className="sr-only">
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
                <div className="min-w-[140px] space-y-1">
                  <label htmlFor="invite-role" className="sr-only">
                    Role
                  </label>
                  <select
                    id="invite-role"
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    disabled={isBusy}
                    className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs disabled:opacity-50 disabled:pointer-events-none"
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
                <Button
                  size="sm"
                  onClick={inviteUser}
                  disabled={isBusy}
                >
                  {busyKey === "invite-user" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Sending...
                    </>
                  ) : (
                    "Send Invite"
                  )}
                </Button>
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteEmployeeDetails((v) => !v)}
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                >
                  {showInviteEmployeeDetails ? "Hide" : "Add"} employee details (optional)
                </button>
              </div>
              {showInviteEmployeeDetails && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="invite-employeeNumber" className="text-xs">
                      Employee number
                    </label>
                    <Input
                      id="invite-employeeNumber"
                      value={inviteEmployeeNumber}
                      onChange={(e) => setInviteEmployeeNumber(e.target.value)}
                      disabled={isBusy}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="invite-epfNumber" className="text-xs">
                      EPF number
                    </label>
                    <Input
                      id="invite-epfNumber"
                      value={inviteEpfNumber}
                      onChange={(e) => setInviteEpfNumber(e.target.value)}
                      disabled={isBusy}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="invite-location" className="text-xs">
                      Location
                    </label>
                    <select
                      id="invite-location"
                      value={inviteLocationId}
                      onChange={(e) => setInviteLocationId(e.target.value)}
                      disabled={isBusy}
                      className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
                    >
                      <option value="">Select location</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="invite-department" className="text-xs">
                      Department
                    </label>
                    <select
                      id="invite-department"
                      value={inviteDepartmentId}
                      onChange={(e) => setInviteDepartmentId(e.target.value)}
                      disabled={isBusy}
                      className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
                    >
                      <option value="">Select department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="invite-designation" className="text-xs">
                      Designation
                    </label>
                    <select
                      id="invite-designation"
                      value={inviteDesignationId}
                      onChange={(e) => setInviteDesignationId(e.target.value)}
                      disabled={isBusy}
                      className="border-input h-9 w-full rounded-md border px-3 py-1 text-sm"
                    >
                      <option value="">Select designation</option>
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="invite-appointmentDate" className="text-xs">
                      Appointment date
                    </label>
                    <Input
                      id="invite-appointmentDate"
                      type="date"
                      value={inviteAppointmentDate}
                      onChange={(e) => setInviteAppointmentDate(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {canManageUsers && pendingInvites.length > 0 && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Pending invitations</p>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">{inv.email}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Role: {inv.role.name}</span>
                        {inv.location && (
                          <span>Location: {inv.location.name}</span>
                        )}
                        {inv.invitedBy?.name && (
                          <span>Invited by: {inv.invitedBy.name}</span>
                        )}
                        <span>{formatExpiry(inv.expiresAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resendInvite(inv.id)}
                        disabled={isBusy}
                      >
                        {busyKey === `resend-invite-${inv.id}` ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <>
                            <Mail className="mr-1 size-4" aria-hidden />
                            Resend
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyInviteLink(inv.id)}
                        disabled={isBusy}
                      >
                        {busyKey === `copy-link-${inv.id}` ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <>
                            <Copy className="mr-1 size-4" aria-hidden />
                            Copy link
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => cancelInvite(inv.id, inv.email)}
                        disabled={isBusy}
                      >
                        {busyKey === `cancel-invite-${inv.id}` ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <>
                            <XCircle className="mr-1 size-4" aria-hidden />
                            Cancel
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {users.map((user) => {
            const assignedRoles = draftAssignments[user.id] ?? [];
            const isSuperAdmin = user.userRoles.some(
              (ur) => ur.role.name === "super_admin"
            );
            return (
              <div
                key={user.id}
                className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <p className="font-medium">{user.name ?? "Unnamed user"}</p>
                    <p className="text-muted-foreground text-sm">
                      {user.email ?? user.auth0Id}
                      {isSuperAdmin && (
                        <span className="ml-2 text-xs">(Super Admin)</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {assignableRoles.map((role) => (
                      <label
                        key={`${user.id}-${role.id}`}
                        className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={assignedRoles.includes(role.id)}
                          onChange={() => toggleUserRole(user.id, role.id)}
                          disabled={!canManageUsers || isBusy}
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
                    {isSuperAdmin && (
                      <span className="bg-muted rounded-md px-2 py-1 text-sm">
                        super_admin
                      </span>
                    )}
                  </div>

                  {canManageUsers && (
                    <Button
                      size="sm"
                      onClick={() => saveUserRoles(user.id)}
                      disabled={isBusy}
                    >
                      {busyKey === `user-${user.id}` ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Saving...
                        </>
                      ) : (
                        "Save Roles"
                      )}
                    </Button>
                  )}
                </div>

                {canManageUsers && !isSuperAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      removeUser(user.id, user.name ?? user.email ?? "this user")
                    }
                    disabled={isBusy}
                  >
                    {busyKey === `remove-user-${user.id}` ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden />
                        Removing...
                      </>
                    ) : (
                      "Remove"
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManageRoles && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Create Role</p>
              <Input
                placeholder="Role name (e.g. support-manager)"
                value={draftRoleName}
                onChange={(event) => setDraftRoleName(event.target.value)}
                disabled={isBusy}
              />
              <Input
                placeholder="Description (optional)"
                value={draftRoleDescription}
                onChange={(event) => setDraftRoleDescription(event.target.value)}
                disabled={isBusy}
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">Permissions</p>
                <div className="flex flex-wrap gap-2">
                  {permissions.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissionKeys.includes(permission.key)}
                        onChange={() => togglePermission(permission.key)}
                        disabled={isBusy}
                      />
                      <span>{permission.key}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={createRole} disabled={isBusy}>
                {busyKey === "create-role" ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Creating...
                  </>
                ) : (
                  "Create Role"
                )}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {sortedRoles.map((role) => {
              const isEditing = editingRoleId === role.id;
              const canEdit =
                canManageRoles &&
                role.name !== "admin" &&
                role.name !== "super_admin";

              return (
                <div
                  key={role.id}
                  className="flex flex-col gap-3 rounded-lg border p-4"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        placeholder="Role name"
                        value={editRoleName}
                        onChange={(e) => setEditRoleName(e.target.value)}
                        disabled={isBusy}
                      />
                      <Input
                        placeholder="Description (optional)"
                        value={editRoleDescription}
                        onChange={(e) => setEditRoleDescription(e.target.value)}
                        disabled={isBusy}
                      />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Permissions</p>
                        <div className="flex flex-wrap gap-2">
                          {permissions.map((permission) => (
                            <label
                              key={permission.id}
                              className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={editRolePermissionKeys.includes(
                                  permission.key
                                )}
                                onChange={() =>
                                  toggleEditRolePermission(permission.key)
                                }
                                disabled={isBusy}
                              />
                              <span>{permission.key}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateRole(role.id)}
                          disabled={isBusy}
                        >
                          {busyKey === `update-role-${role.id}` ? (
                            <>
                              <Loader2
                                className="animate-spin"
                                aria-hidden
                              />
                              Saving...
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEditingRole}
                          disabled={isBusy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{role.name}</p>
                        {role.description && (
                          <p className="text-muted-foreground text-sm">
                            {role.description}
                          </p>
                        )}
                        <p className="text-muted-foreground text-xs">
                          {role._count.userRoles} users
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {role.rolePermissions.map((rp) => (
                            <span
                              key={`${role.id}-${rp.permission.id}`}
                              className="bg-muted rounded-md px-2 py-1 text-xs"
                            >
                              {rp.permission.key}
                            </span>
                          ))}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditingRole(role)}
                            disabled={isBusy}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteRole(role.id, role.name)}
                            disabled={isBusy}
                          >
                            {busyKey === `delete-role-${role.id}` ? (
                              <>
                                <Loader2
                                  className="animate-spin"
                                  aria-hidden
                                />
                                Deleting...
                              </>
                            ) : (
                              "Delete"
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function mapAssignments(users: User[]) {
  return users.reduce<Record<string, string[]>>((acc, user) => {
    acc[user.id] = user.userRoles.map((userRole) => userRole.role.id);
    return acc;
  }, {});
}
