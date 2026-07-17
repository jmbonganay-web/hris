import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const page=await readFile(new URL("../../app/(dashboard)/notifications/page.tsx",import.meta.url),"utf8");
const settings=await readFile(new URL("../../app/(dashboard)/admin/notifications/settings/page.tsx",import.meta.url),"utf8");
test("notification center uses live queries, filters, summary, list, and no unsafe props",()=>{for(const token of ["listNotifications","getNotificationDashboardSummary","parseNotificationFilters","NotificationSummaryCards","NotificationFilterForm","NotificationList"])assert.match(page,new RegExp(token));assert.doesNotMatch(page,/safeContext|recipientUserId|sourceEventKey|mockNotifications/);});
test("notification settings are permission-aware and use live rule and cycle queries",()=>{assert.match(settings,/requireNotificationSettingsViewer/);assert.match(settings,/listNotificationRules/);assert.match(settings,/getNotificationCycleStatus/);assert.match(settings,/NotificationRuleList/);assert.match(settings,/NotificationRunSummary/);});

const dashboardLayout = await readFile(new URL("../../app/(dashboard)/layout.tsx", import.meta.url), "utf8");
const appShell = await readFile(new URL("../../components/app-shell.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");
const topbar = await readFile(new URL("../../components/topbar.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");
const globalSettings = await readFile(new URL("../../app/(dashboard)/settings/page.tsx", import.meta.url), "utf8");
const notificationList = await readFile(new URL("../../components/notifications/notification-list.tsx", import.meta.url), "utf8");

test("shell loads only the aggregate unread count and links to notifications", () => {
  assert.match(dashboardLayout, /getUnreadNotificationCount/);
  assert.match(dashboardLayout, /unreadNotificationCount/);
  assert.match(appShell, /unreadNotificationCount:\s*number/);
  assert.doesNotMatch(appShell, /notificationBody|notificationItems|resourceMetadata/);
  assert.match(sidebar, /\/notifications/);
  assert.match(topbar, /\/notifications/);
  assert.match(sidebar, /unreadCountLabel/);
  assert.match(topbar, /unreadCountLabel/);
});

test("dashboard and settings integrate compact notification operations", () => {
  assert.match(dashboard, /getNotificationDashboardSummary/);
  assert.match(dashboard, /DashboardNotificationSummary/);
  assert.match(globalSettings, /\/admin\/notifications\/settings/);
  assert.match(globalSettings, /notification/i);
});

test("notification list refreshes through the Next router", () => {
  assert.match(notificationList, /useRouter/);
  assert.match(notificationList, /router\.refresh\(\)/);
  assert.doesNotMatch(notificationList, /location\.reload\(\)/);
});

const ruleForm = await readFile(new URL("../../components/notifications/notification-rule-form.tsx", import.meta.url), "utf8");
const settingsActionsComponent = await readFile(new URL("../../components/notifications/notification-settings-actions.tsx", import.meta.url), "utf8").catch(() => "");

test("destructive settings operations require explicit confirmation controls", () => {
  assert.match(settingsActionsComponent, /name="confirm"/);
  assert.match(settingsActionsComponent, /type="checkbox"/);
  assert.match(settingsActionsComponent, /required/);
  assert.doesNotMatch(settingsActionsComponent, /type="hidden"\s+name="confirm"\s+value="yes"/);
});

test("notification settings forms show safe action feedback and pending state", () => {
  assert.match(ruleForm, /useActionState/);
  assert.match(ruleForm, /form-error/);
  assert.match(ruleForm, /form-success/);
  assert.match(ruleForm, /pending/);
  assert.match(settingsActionsComponent, /useActionState/);
  assert.match(settingsActionsComponent, /form-error/);
  assert.match(settingsActionsComponent, /form-success/);
});
