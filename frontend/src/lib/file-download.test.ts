import assert from "node:assert/strict";
import { downloadFileFromUrl } from "./file-download";

async function run() {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;

  try {
    // 1. Non-DOM environment fallback (Node.js style)
    let openedUrl = "";
    (globalThis as any).window = {
      open: (url: string) => {
        openedUrl = url;
      },
    };
    delete (globalThis as any).document;

    await downloadFileFromUrl("https://example.com/test.pdf", "test.pdf");
    assert.equal(openedUrl, "https://example.com/test.pdf", "Falls back to window.open when document is not present");

    // 2. Browser DOM environment with Blob URL and <a> click
    const createdLinks: any[] = [];
    const clickedLinks: any[] = [];
    let revokedUrl = "";

    (globalThis as any).window = {
      URL: {
        createObjectURL: (_blob: any) => "blob:http://localhost:3000/mock-uuid",
        revokeObjectURL: (url: string) => {
          revokedUrl = url;
        },
      },
      setTimeout: (fn: () => void) => {
        fn();
        return 1;
      },
    };

    (globalThis as any).document = {
      body: {
        appendChild: (el: any) => {
          createdLinks.push(el);
        },
        removeChild: (el: any) => {
          const index = createdLinks.indexOf(el);
          if (index > -1) createdLinks.splice(index, 1);
        },
      },
      createElement: (tag: string) => {
        if (tag === "a") {
          const a = {
            tag: "a",
            href: "",
            download: "",
            click: () => {
              clickedLinks.push({ ...a });
            },
          };
          return a;
        }
        return {};
      },
    };

    (globalThis as any).fetch = async (url: string) => {
      assert.equal(url, "https://example.com/file.png");
      return {
        ok: true,
        statusText: "OK",
        blob: async () => ({ size: 1024, type: "image/png" }),
      };
    };

    await downloadFileFromUrl("https://example.com/file.png", "file.png");
    assert.equal(clickedLinks.length, 1, "Simulated <a> element was clicked");
    assert.equal(clickedLinks[0].href, "blob:http://localhost:3000/mock-uuid", "Link used the blob URL");
    assert.equal(clickedLinks[0].download, "file.png", "Download attribute matches filename");
    assert.equal(createdLinks.length, 0, "Link element was cleaned up from body");
    assert.equal(revokedUrl, "blob:http://localhost:3000/mock-uuid", "Object URL was revoked");

    // 3. Fallback when fetch fails (e.g. network/CORS error)
    clickedLinks.length = 0;
    (globalThis as any).fetch = async () => {
      throw new Error("Network error");
    };

    await downloadFileFromUrl("https://example.com/fallback.docx", "fallback.docx");
    assert.equal(clickedLinks.length, 1, "Fallback link was clicked");
    assert.equal(clickedLinks[0].href, "https://example.com/fallback.docx", "Fallback link used the original URL");
    assert.equal(clickedLinks[0].download, "fallback.docx", "Fallback link preserved the download filename");

    console.log("file-download: non-DOM fallback, blob direct download, and network fallback all passed.");
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
