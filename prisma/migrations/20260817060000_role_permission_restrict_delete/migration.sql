-- Stop stale RBAC sync from deleting Permission rows that are still granted
-- to custom roles (cascade was wiping store.allocation.read off stores-level-*).
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_permissionId_fkey";
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
