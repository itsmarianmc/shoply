"use client";

import { useState, useTransition } from "react";
import { updateSettingAction } from "@/app/admin/actions";
import type { CheckedItemBehavior } from "@/lib/types";
import {
  SHOPPING_SCAN_LANGUAGES,
  isShoppingScanLanguageCode,
  type ShoppingScanLanguageCode,
} from "@/lib/shopping-scan-languages";

export default function AdminSettingsPanel({
  behavior,
  scanLanguage,
}: {
  behavior: CheckedItemBehavior;
  scanLanguage: ShoppingScanLanguageCode;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedLanguage, setSelectedLanguage] = useState(scanLanguage);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formData = new FormData();
    if (e.target.checked) formData.set("checked_item_behavior", "on");
    startTransition(async () => {
      await updateSettingAction(formData);
    });
  }

  function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const language = e.target.value;
    if (!isShoppingScanLanguageCode(language)) return;
    setSelectedLanguage(language);
    const formData = new FormData();
    formData.set("shopping_scan_language", language);
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
        <div className="spl-row spl-admin-language-setting">
          <div className="spl-row-body">
            <label className="spl-row-label" htmlFor="shopping-scan-language">
              Shopping-list recognition language
            </label>
            <span className="spl-row-sub">
              Helps Gemini read the list. Item names stay in the language written.
            </span>
          </div>
          <select
            id="shopping-scan-language"
            className="spl-input spl-admin-language-select"
            value={selectedLanguage}
            onChange={handleLanguageChange}
            disabled={isPending}
          >
            {SHOPPING_SCAN_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
