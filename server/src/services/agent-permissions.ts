import { ROLE_DEFAULT_PERMISSIONS, type AgentRole, type PermissionKey } from "@paperclipai/shared";

export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  const defaults = getDefaultPermissionKeysForRole(role);
  return {
    canCreateAgents: defaults.includes("agents:create"),
  };
}

export function getDefaultPermissionKeysForRole(role: string): readonly PermissionKey[] {
  const agentRole = role as AgentRole;
  return ROLE_DEFAULT_PERMISSIONS[agentRole] ?? ROLE_DEFAULT_PERMISSIONS.general;
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;
  return {
    canCreateAgents:
      typeof record.canCreateAgents === "boolean"
        ? record.canCreateAgents
        : defaults.canCreateAgents,
  };
}
