import { api, ApiError } from "./client";

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
  htmlUrl: string;
}

export interface GitHubFileWriteResult {
  path: string;
  sha: string;
  commitSha: string;
  htmlUrl: string;
}

export interface GitHubTreeEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
  size: number;
}

export const githubFilesApi = {
  getFile: (projectId: string, filePath: string, ref?: string) => {
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return api.get<GitHubFile>(`/projects/${projectId}/files/${filePath}${qs}`);
  },

  putFile: (
    projectId: string,
    filePath: string,
    data: { content: string; message: string; sha?: string; branch?: string },
  ) => api.put<GitHubFileWriteResult>(`/projects/${projectId}/files/${filePath}`, data),

  listFiles: (projectId: string, dirPath?: string, ref?: string) => {
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const path = dirPath ? `/projects/${projectId}/tree/${dirPath}${qs}` : `/projects/${projectId}/tree${qs}`;
    return api.get<GitHubTreeEntry[]>(path);
  },
};

/** Check if an ApiError is a version conflict (409) */
export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
