import { SOURCES } from "../data/sources";

/**
 * MCP resources: read-only data a client can show or attach. The source
 * bibliography is JSON, not Markdown, because tools cite sources by id with
 * the same id, title and url fields; JSON lets a client or model join the
 * two without parsing prose, and keeps `accessed: null` and `note` (an
 * unverified source and its caveat) explicit.
 */

export const SOURCES_RESOURCE_URI = "cafe-listo://sources";

export interface McpResourceListing {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export interface McpResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

const sourcesResource: McpResourceListing = {
  uri: SOURCES_RESOURCE_URI,
  name: "sources",
  title: "Sources",
  description:
    "Every public source behind Cafe Listo's preparedness guidance: id, title, publisher, url, the date it was last read (null if it could not be retrieved and is unverified), and any caveat. Tools cite these ids.",
  mimeType: "application/json",
};

export function buildMcpResourceList(): McpResourceListing[] {
  return [sourcesResource];
}

/** The resource's contents, or null for an unknown URI. */
export function readMcpResource(uri: string): McpResourceContents | null {
  if (uri !== SOURCES_RESOURCE_URI) return null;
  return {
    uri,
    mimeType: sourcesResource.mimeType,
    text: JSON.stringify({ sources: SOURCES }),
  };
}
