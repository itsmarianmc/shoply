"use client";

import { useTransition } from "react";
import { updateSettingAction } from "@/app/admin/actions";
import type { CheckedItemBehavior } from "@/lib/types";

export default function AdminSettingsPanel({ behavior }: { behavior: CheckedItemBehavior }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formData = new FormData();
    if (e.target.checked) formData.set("checked_item_behavior", "on");
    startTransition(async () => {
      await updateSettingAction(formData);
    });
  }

  return (
    <section className="spl-card">
      <div className="spl-card-header">
        <span className="spl-card-icon">
          <i className="fa-solid fa-sliders" aria-hidden="true" />
        </span>
        <h2 className="spl-card-title">Settings</h2>
      </div>

      <div className="spl-list">
        <div className="spl-row">
          <div className="spl-row-body">
            <span className="spl-row-label">Archive checked items automatically</span>
            <span className="spl-row-sub">
              Off: checked items stay in the list. On: they move straight to the archive.
              This only applies to items checked from now on.
            </span>
          </div>
          <input
            type="checkbox"
            className="spl-toggle"
            defaultChecked={behavior === "ARCHIVE"}
            onChange={handleChange}
            disabled={isPending}
            aria-label="Archive checked items automatically"
          />
        </div>
      </div>
    </section>
  );
}
