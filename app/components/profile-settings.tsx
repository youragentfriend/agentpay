"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentPaySettings } from "@/lib/settings-types";

const PROFILE_IMAGE_SIZE = 256;
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

async function prepareProfileImage(file: File): Promise<string> {
  if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Choose an image smaller than 10 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("This image could not be read."));
      candidate.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_IMAGE_SIZE;
    canvas.height = PROFILE_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not resize the image.");
    const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - cropSize) / 2;
    const sourceY = (image.naturalHeight - cropSize) / 2;
    context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE);
    return canvas.toDataURL("image/webp", 0.84);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const FRIENDLY_TIME_ZONES = [
  { value: "UTC", label: "GMT / UTC" },
  { value: "America/New_York", label: "EST / EDT" },
  { value: "America/Chicago", label: "CST / CDT" },
  { value: "America/Denver", label: "MST / MDT" },
  { value: "America/Los_Angeles", label: "PST / PDT" },
  { value: "America/Sao_Paulo", label: "UTC−3" },
  { value: "Europe/London", label: "GMT / BST" },
  { value: "Europe/Paris", label: "UTC+1 / UTC+2" },
  { value: "Asia/Dubai", label: "UTC+4" },
  { value: "Asia/Kolkata", label: "UTC+5:30" },
  { value: "Asia/Bangkok", label: "UTC+7" },
  { value: "Asia/Singapore", label: "UTC+8" },
  { value: "Asia/Tokyo", label: "UTC+9" },
  { value: "Australia/Sydney", label: "UTC+10 / UTC+11" },
] as const;

export function ProfileSettings({ settings, onSaved }: { settings: AgentPaySettings; onSaved: (settings: AgentPaySettings) => void }) {
  const [displayName, setDisplayName] = useState(settings.displayName);
  const [profileImageDataUrl, setProfileImageDataUrl] = useState(settings.profileImageDataUrl);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [processingImage, setProcessingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(settings.displayName);
    setProfileImageDataUrl(settings.profileImageDataUrl);
    setTimeZone(settings.timeZone);
  }, [settings.displayName, settings.profileImageDataUrl, settings.timeZone]);

  const browserTimeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch { return "UTC"; }
  }, []);

  const timeZoneOptions = useMemo(() => {
    if (FRIENDLY_TIME_ZONES.some((zone) => zone.value === settings.timeZone)) return FRIENDLY_TIME_ZONES;
    return [{ value: settings.timeZone, label: `Saved timezone — ${settings.timeZone}` }, ...FRIENDLY_TIME_ZONES];
  }, [settings.timeZone]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          profileImageDataUrl,
          displayCurrency: "USD",
          timeZone,
          spendingLimits: settings.spendingLimits,
          trustedWalletDestinations: settings.trustedWalletDestinations,
          trustedX402Hosts: settings.trustedX402Hosts,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save settings.");
      onSaved(data as AgentPaySettings);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  let datePreview = "Invalid time zone";
  try {
    datePreview = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date());
  } catch { /* server validation will provide the actionable error */ }

  const savedAt = settings.updatedAt && Number.isFinite(Date.parse(settings.updatedAt)) ? `Saved ${new Date(settings.updatedAt).toLocaleString()}` : "Loading saved settings…";
  const avatarInitials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";

  async function chooseProfileImage(file: File | undefined) {
    if (!file) return;
    setProcessingImage(true);
    setError("");
    setSaved(false);
    try { setProfileImageDataUrl(await prepareProfileImage(file)); }
    catch (imageError) { setError(imageError instanceof Error ? imageError.message : "Unable to process this image."); }
    finally { setProcessingImage(false); }
  }

  return <div className="settings-card profile-settings-card">
    <div className="settings-section-heading"><div><strong>Profile and localization</strong><span>Used across the Overview greeting, sidebar, and account controls.</span></div><span className="settings-saved-at">{savedAt}</span></div>
    <div className="profile-image-setting"><div className="profile-image-preview">{profileImageDataUrl ? <img src={profileImageDataUrl} alt="Profile preview"/> : avatarInitials}</div><div className="profile-image-copy"><strong>Profile image</strong><span>Shown in your account avatar, sidebar profile, and recent chats. Images are cropped to a square and saved in AgentPay.</span><div className="profile-image-actions"><label className={`secondary-button profile-image-upload${processingImage ? " disabled" : ""}`}>{processingImage ? "Processing…" : profileImageDataUrl ? "Change image" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={processingImage} onChange={(event) => { void chooseProfileImage(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label>{profileImageDataUrl && <button type="button" className="ghost-button" disabled={processingImage} onClick={() => { setProfileImageDataUrl(null); setSaved(false); }}>Remove</button>}</div></div></div>
    <div className="settings-fields">
      <label className="field"><span>Display name</span><input value={displayName} maxLength={50} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name"/><small className="field-help">Initials are used whenever no profile image is saved.</small></label>
      <label className="field"><span>Display currency</span><select value="USD" disabled><option value="USD">USD</option></select><small className="field-help">USD is the currently supported valuation currency.</small></label>
      <label className="field"><span>Time zone</span><div className="timezone-control"><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{timeZoneOptions.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select><button className="secondary-button" type="button" onClick={() => setTimeZone(browserTimeZone)}>Use browser time zone</button></div><small className="field-help">Choose a familiar GMT, UTC, or regional timezone. Preview: {datePreview}</small></label>
    </div>
    {error && <div className="workflow-error">{error}</div>}
    {saved && <div className="settings-success">Settings saved. Your AgentPay identity has been updated.</div>}
    <div className="settings-actions"><button className="primary-button" disabled={saving || processingImage || !displayName.trim() || !timeZone.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></div>
  </div>;
}
