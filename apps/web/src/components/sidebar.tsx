"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CurrentUser } from "~/lib/auth";
import { BrandMark } from "./brand-mark";

interface NavItem {
  href: string;
  code: string;
  label: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", code: "00", label: "Overview" },
  { href: "/agents", code: "01", label: "Agents" },
  { href: "/approvals", code: "02", label: "Approvals" },
  { href: "/receipts", code: "03", label: "Receipts" },
  { href: "/policy", code: "04", label: "Policy" },
];

interface SidebarProps {
  active: string;
  approvalCount?: number;
  user: CurrentUser;
}

export function Sidebar({ active, approvalCount = 0, user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const displayName = user.username ?? user.name ?? user.email?.split("@")[0] ?? "Operator";
  const email = user.email ?? "No email linked";
  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("warden.sidebar") === "collapsed");
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(
        "warden.sidebar",
        next ? "collapsed" : "expanded",
      );
      return next;
    });
  }

  return (
    <aside
      className={`border-r border-hairline flex-shrink-0 flex flex-col bg-bg-deep/40 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[240px]"
      }`}
    >
      <div
        className={`pt-6 border-b border-hairline ${
          collapsed ? "px-4 pb-5" : "px-6 pb-8"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <Link href="/dashboard" aria-label="Warden dashboard">
            <BrandMark
              size="md"
              version={collapsed ? undefined : "v0.1"}
              showWordmark={!collapsed}
            />
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-8 shrink-0 place-items-center border border-hairline text-t4 hover:border-signal-dim hover:text-signal transition-colors"
          >
            <span className="mono text-[13px]">{collapsed ? ">" : "<"}</span>
          </button>
        </div>
        {!collapsed && (
          <p className="label mt-2 text-t4 leading-relaxed normal-case tracking-normal text-[10.5px]">
            Programmable spend control
            <br />
            for autonomous agents.
          </p>
        )}
      </div>

      <nav className="flex-1 py-4">
        {NAV.map((item) => {
          const isActive = active === item.href;
          const showBadge = item.href === "/approvals" && approvalCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={`group relative flex items-center gap-3 py-2 text-[13px] transition-colors ${
                collapsed ? "justify-center px-0" : "px-6"
              } ${
                isActive
                  ? "bg-bg-row-hover text-t1"
                  : "text-t2 hover:bg-bg-row hover:text-t1"
              }`}
              >
              <span
                className={`mono text-[10.5px] ${
                  isActive ? "text-signal" : "text-t4"
                }`}
              >
                {item.code}
              </span>
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {showBadge && !collapsed && (
                <span className="label-num text-pending text-[11px]">
                  {String(approvalCount).padStart(2, "0")}
                </span>
              )}
              {showBadge && collapsed && (
                <span className="absolute ml-8 mt-[-18px] size-1.5 bg-pending" />
              )}
              {isActive && !collapsed && (
                <span className="mono text-signal text-[10px]">▸</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div
        className={`border-t border-hairline py-4 flex flex-col gap-3 ${
          collapsed ? "items-center px-3" : "px-6"
        }`}
      >
        {!collapsed && <span className="label">Operator</span>}
        <div
          className={`flex items-center min-w-0 ${
            collapsed ? "justify-center" : "gap-3"
          }`}
        >
          <div className="size-10 shrink-0 overflow-hidden border border-hairline-strong bg-bg-raised">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="size-full object-cover"
                width={40}
                height={40}
              />
            ) : (
              <div className="size-full grid place-items-center mono text-t1 text-[14px]">
                {initials || "OP"}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="mono text-[12.5px] text-t1 truncate" title={displayName}>
                {displayName}
              </span>
              <span className="mono text-t4 text-[10.5px] truncate" title={email}>
                {email}
              </span>
            </div>
          )}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            className="label text-t4 hover:text-deny transition-colors mt-1 cursor-pointer"
          >
            {collapsed ? "OUT" : "SIGN OUT"}
          </button>
        </form>
      </div>
    </aside>
  );
}
