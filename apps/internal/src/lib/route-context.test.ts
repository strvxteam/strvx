import { describe, it, expect } from "vitest";
import { resolveRouteContext } from "./route-context";

describe("resolveRouteContext", () => {
  it("returns null for non-entity pages", () => {
    expect(resolveRouteContext("/dashboard")).toBeNull();
    expect(resolveRouteContext("/pipeline")).toBeNull();
    expect(resolveRouteContext("/finances")).toBeNull();
  });

  it("resolves engagement detail", () => {
    expect(resolveRouteContext("/clients/abc-123")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });

  it("resolves engagement subpaths", () => {
    expect(resolveRouteContext("/clients/abc-123/activity")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });

  it("resolves project detail", () => {
    expect(resolveRouteContext("/projects/xyz-456")).toEqual({
      kind: "project",
      id: "xyz-456",
    });
  });

  it("resolves contact detail", () => {
    expect(resolveRouteContext("/contacts/c-789")).toEqual({
      kind: "contact",
      id: "c-789",
    });
  });

  it("ignores bare list pages", () => {
    expect(resolveRouteContext("/clients")).toBeNull();
    expect(resolveRouteContext("/projects")).toBeNull();
  });

  it("handles trailing slashes and query strings", () => {
    expect(resolveRouteContext("/clients/abc-123/")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
    expect(resolveRouteContext("/clients/abc-123?tab=activity")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });

  it("returns null for empty and root pathnames", () => {
    expect(resolveRouteContext("")).toBeNull();
    expect(resolveRouteContext("/")).toBeNull();
  });

  it("returns null for bare list with trailing slash", () => {
    expect(resolveRouteContext("/clients/")).toBeNull();
  });

  it("returns null for double-slash after prefix", () => {
    expect(resolveRouteContext("/clients//abc-123")).toBeNull();
  });

  it("strips URL hash fragments", () => {
    expect(resolveRouteContext("/clients/abc-123#notes")).toEqual({
      kind: "engagement",
      id: "abc-123",
    });
  });

  it("does not match on prefix collision", () => {
    expect(resolveRouteContext("/clientsXYZ/abc")).toBeNull();
  });
});
