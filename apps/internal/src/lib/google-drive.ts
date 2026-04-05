import { google } from "googleapis";
import { getAuthedDriveClient, isDriveConnected } from "./google-calendar";

// Full Drive scope — allows read, write, create, and move for all files
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
];

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  type: "document" | "spreadsheet" | "presentation" | "image" | "video" | "folder" | "other";
  modifiedTime: string;
  modifiedBy: string;
  size: string;
  starred: boolean;
  webViewLink: string;
  iconLink: string;
  parents: string[];
}

export interface DriveFolder {
  id: string;
  name: string;
  children: DriveFolder[];
}

const MIME_TYPE_MAP: Record<string, DriveFile["type"]> = {
  "application/vnd.google-apps.document": "document",
  "application/vnd.google-apps.spreadsheet": "spreadsheet",
  "application/vnd.google-apps.presentation": "presentation",
  "application/vnd.google-apps.folder": "folder",
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
};

function resolveType(mimeType: string): DriveFile["type"] {
  if (MIME_TYPE_MAP[mimeType]) return MIME_TYPE_MAP[mimeType];
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

function formatSize(bytes: string | undefined | null): string {
  if (!bytes) return "—";
  const n = parseInt(bytes, 10);
  if (isNaN(n) || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listDriveFiles(
  userId: string,
  folderId?: string,
  pageToken?: string,
): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const oauth2Client = await getAuthedDriveClient(userId);
  if (!oauth2Client) return { files: [], nextPageToken: null };

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const query = folderId
    ? `'${folderId}' in parents and trashed = false`
    : "trashed = false";

  const response = await drive.files.list({
    q: query,
    fields: "nextPageToken, files(id, name, mimeType, modifiedTime, lastModifyingUser, size, starred, webViewLink, iconLink, parents)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
    pageToken: pageToken || undefined,
  });

  const files: DriveFile[] = (response.data.files || []).map((f) => ({
    id: f.id || "",
    name: f.name || "",
    mimeType: f.mimeType || "",
    type: resolveType(f.mimeType || ""),
    modifiedTime: f.modifiedTime || "",
    modifiedBy: f.lastModifyingUser?.displayName || "",
    size: formatSize(f.size),
    starred: f.starred || false,
    webViewLink: f.webViewLink || "",
    iconLink: f.iconLink || "",
    parents: (f.parents as string[]) || [],
  }));

  return {
    files,
    nextPageToken: response.data.nextPageToken || null,
  };
}

export async function getDriveFolderTree(userId: string): Promise<DriveFolder[]> {
  const oauth2Client = await getAuthedDriveClient(userId);
  if (!oauth2Client) return [];

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  // Fetch all folders
  const folders: Array<{ id: string; name: string; parents: string[] }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "nextPageToken, files(id, name, parents)",
      pageSize: 500,
      pageToken,
    });

    for (const f of response.data.files || []) {
      folders.push({
        id: f.id || "",
        name: f.name || "",
        parents: (f.parents as string[]) || [],
      });
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  // Build tree from flat list
  const folderMap = new Map<string, DriveFolder>();
  for (const f of folders) {
    folderMap.set(f.id, { id: f.id, name: f.name, children: [] });
  }

  const roots: DriveFolder[] = [];
  for (const f of folders) {
    const node = folderMap.get(f.id)!;
    const parentId = f.parents[0];
    const parent = parentId ? folderMap.get(parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically
  function sortTree(nodes: DriveFolder[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortTree(n.children);
  }
  sortTree(roots);

  return roots;
}

export async function createDriveFolder(
  userId: string,
  name: string,
  parentId?: string,
): Promise<{ id: string; name: string } | null> {
  const oauth2Client = await getAuthedDriveClient(userId);
  if (!oauth2Client) return null;

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id, name",
  });

  return {
    id: response.data.id || "",
    name: response.data.name || "",
  };
}

export async function uploadDriveFile(
  userId: string,
  file: { name: string; mimeType: string; body: Buffer },
  parentId?: string,
): Promise<DriveFile | null> {
  const oauth2Client = await getAuthedDriveClient(userId);
  if (!oauth2Client) return null;

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const { Readable } = await import("stream");

  const response = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: parentId ? [parentId] : undefined,
    },
    media: {
      mimeType: file.mimeType,
      body: Readable.from(file.body),
    },
    fields: "id, name, mimeType, modifiedTime, lastModifyingUser, size, starred, webViewLink, iconLink, parents",
  });

  const f = response.data;
  return {
    id: f.id || "",
    name: f.name || "",
    mimeType: f.mimeType || "",
    type: resolveType(f.mimeType || ""),
    modifiedTime: f.modifiedTime || "",
    modifiedBy: f.lastModifyingUser?.displayName || "",
    size: formatSize(f.size),
    starred: f.starred || false,
    webViewLink: f.webViewLink || "",
    iconLink: f.iconLink || "",
    parents: (f.parents as string[]) || [],
  };
}

export async function moveDriveFile(
  userId: string,
  fileId: string,
  newParentId: string,
): Promise<boolean> {
  const oauth2Client = await getAuthedDriveClient(userId);
  if (!oauth2Client) return false;

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  // Get current parents so we can remove them
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents || []).join(",");

  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: previousParents,
    fields: "id, parents",
  });

  return true;
}

export async function isGoogleDriveConnected(userId: string): Promise<boolean> {
  return isDriveConnected(userId);
}
