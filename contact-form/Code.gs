/**
 * Tech Nova — website contact form handler
 * ----------------------------------------
 * Receives submissions from the contact form on technovabb.com, emails them
 * to you, and logs every lead into the attached Google Sheet.
 *
 * Deploy: see contact-form/SETUP.md
 */

var TO_EMAIL   = 'Juwanprescod@Technovabb.com'; // where new leads are emailed
var SHEET_NAME = 'Leads';                        // tab used to log submissions

function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    // Honeypot: bots fill the hidden "company" field. Silently accept & drop.
    if (p.company) { return json({ ok: true }); }

    var name    = String(p.name    || '').trim();
    var email   = String(p.email   || '').trim();
    var phone   = String(p.phone   || '').trim();
    var topic   = String(p.topic   || 'General enquiry').trim();
    var message = String(p.message || '').trim();

    if (!name || !email || !message) {
      return json({ ok: false, error: 'Missing required fields' });
    }

    logToSheet_({ name: name, email: email, phone: phone, topic: topic, message: message });

    var subject = 'New website enquiry — ' + topic + ' — ' + name;
    var body =
      'New enquiry from the Tech Nova website\n\n' +
      'Name:    ' + name + '\n' +
      'Email:   ' + email + '\n' +
      'Phone:   ' + (phone || '—') + '\n' +
      'Need:    ' + topic + '\n\n' +
      'Message:\n' + message + '\n\n' +
      '— Sent ' + new Date().toLocaleString('en-US', { timeZone: 'America/Barbados' });

    MailApp.sendEmail({ to: TO_EMAIL, replyTo: email, subject: subject, body: body });

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// A plain GET just confirms the endpoint is live (open the URL in a browser).
function doGet() {
  return json({ ok: true, status: 'Tech Nova contact endpoint is live' });
}

function logToSheet_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Timestamp', 'Name', 'Email', 'Phone', 'Need', 'Message']);
  }
  sh.appendRow([new Date(), d.name, d.email, d.phone, d.topic, d.message]);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
