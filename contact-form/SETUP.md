# Contact form — 3-minute setup

The contact form on the website sends leads to your **own Google account** — no
third-party form company, no monthly limits, no cost. It emails you each lead
*and* logs them in a Google Sheet you own.

You do this part once. I've already built the form and the script (`Code.gs`).

---

## Step 1 — Create the Sheet that will hold your leads

1. Go to <https://sheets.new> (signed in as the Google account you want to own this).
2. Rename it something like **Tech Nova — Website Leads**.

## Step 2 — Open the script editor

1. In that Sheet, click **Extensions → Apps Script**.
2. Delete whatever sample code is in the editor.
3. Open `contact-form/Code.gs` from this project, copy **all** of it, and paste it in.
4. Click the **Save** icon (💾).

> The email address at the top of the script is already set to
> `Juwanprescod@Technovabb.com`. Change that line if you ever want leads to go
> somewhere else.

## Step 3 — Deploy it as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear ⚙ next to "Select type" → choose **Web app**.
3. Set:
   - **Description:** `Tech Nova contact form`
   - **Execute as:** **Me** (your email)
   - **Who has access:** **Anyone**  ← important, this lets the website reach it
4. Click **Deploy**.
5. Google asks you to **Authorize access** → pick your account → on the
   "Google hasn't verified this app" screen click **Advanced → Go to
   (project name) → Allow**. (This is normal — it's *your* script.)
6. Copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfy........./exec`

## Step 4 — Give me the URL (or paste it yourself)

Paste that URL into the site in **one** place — `index.html`, near the bottom:

```js
var SCRIPT_URL = "PASTE_YOUR_WEB_APP_URL_HERE";
```

Replace the placeholder with your real URL, save, commit, and push. That's it —
the form is live.

*(If you send me the URL, I'll drop it in and push for you.)*

---

## Testing it

- Open the site, fill in the form, hit **Send message**.
- You should get an email at `Juwanprescod@Technovabb.com` within a few seconds,
  and a new row should appear in the **Leads** tab of your Sheet.

## If you ever change the script

Apps Script → **Deploy → Manage deployments → ✏ edit → Version: New version →
Deploy**. The URL stays the same, so you don't need to touch the website again.

## Good to know

- **Until the URL is pasted in**, the form safely falls back to opening a
  pre-filled email — so no lead is ever lost, even mid-setup.
- A hidden anti-spam field ("honeypot") quietly blocks most bots.
- Free Google limits are ~100 emails/day — far more than a contact form needs.
