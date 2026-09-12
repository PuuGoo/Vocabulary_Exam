import assert from "node:assert/strict";
import test from "node:test";
import { breadcrumbsForPath, routePageTitle } from "./routeMeta";

test("learning routes show the mode instead of a raw set id", () => {
  for (const [path, title] of [["/learn/123", "Flashcard"], ["/quiz/42", "Luyện từ"], ["/dictation/9", "Nghe & viết"]]) {
    assert.equal(routePageTitle(path), title);
    assert.equal(breadcrumbsForPath(path).some((item) => /^\d+$/.test(item.label)), false);
  }
});

test("unknown nested numeric routes never expose their database id", () => {
  assert.equal(breadcrumbsForPath("/study/123").some((item) => item.label === "123"), false);
  assert.equal(breadcrumbsForPath("/admin/sets/123").some((item) => item.label === "123"), false);
});

test("student and admin route metadata remain context aware", () => {
  assert.equal(routePageTitle("/my-words"), "Từ của tôi");
  assert.equal(routePageTitle("/admin/users"), "Người dùng");
});
