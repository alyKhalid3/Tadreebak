import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, escapeUrl, escapeList } from "./escapeHtml";

test("escapeHtml escapes the five HTML metacharacters", () => {
    assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
    assert.equal(escapeHtml(`O'Reilly "Book"`), "O&#39;Reilly &quot;Book&quot;");
    assert.equal(escapeHtml("a & b"), "a &amp; b");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(42), "42");
});

test("escapeUrl neutralises the javascript: scheme", () => {
    assert.equal(escapeUrl("javascript:alert(1)"), "#");
    assert.equal(escapeUrl("JAVASCRIPT:alert(1)"), "#");
    assert.equal(escapeUrl("data:text/html,foo"), "#");
    assert.equal(escapeUrl("vbscript:msgbox"), "#");
    assert.equal(escapeUrl("https://example.com/x"), "https://example.com/x");
});

test("escapeList escapes each entry independently", () => {
    const out = escapeList(["<b>hi</b>", "ok"], " | ");
    assert.equal(out, "&lt;b&gt;hi&lt;/b&gt; | ok");
});

test("escapeList returns empty string for non-array", () => {
    assert.equal(escapeList(undefined), "");
    assert.equal(escapeList(null as any), "");
    assert.equal(escapeList("not an array" as any), "");
});
