import { describe, expect, it } from "vitest";
import { serializeConfigForRoute } from "../src/index.js";

describe("serializeConfigForRoute", () => {
  it("strips uploadPassword from serialized config by default", () => {
    const json = serializeConfigForRoute({
      site: "https://example.com",
      uploadPassword: "s3cret",
    });
    expect(json).not.toContain("s3cret");
    expect(json).not.toContain("uploadPassword");
    expect(JSON.parse(json)).toEqual({ site: "https://example.com" });
  });

  it("keeps uploadPassword when explicitly requested for upload route", () => {
    const json = serializeConfigForRoute(
      { site: "https://example.com", uploadPassword: "s3cret" },
      { includeUploadPassword: true },
    );
    expect(JSON.parse(json).uploadPassword).toBe("s3cret");
  });

  it("passes through configs without uploadPassword unchanged", () => {
    const config = { site: "https://example.com", perPage: 20 };
    const json = serializeConfigForRoute(config);
    expect(JSON.parse(json)).toEqual(config);
  });
});
