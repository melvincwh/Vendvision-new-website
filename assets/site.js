'use strict';

const ga4 = document.querySelector('meta[name="vendvision-ga4"]').content;
if (ga4 && location.origin === 'https://www.vendvision.co') {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ga4, {
    page_location: location.origin + location.pathname,
    allow_google_signals: false
  });
  const script = document.createElement('script');
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4);
  script.async = true;
  document.head.append(script);
}


/*
 * Meta browser Pixel: consent-gated, production-only.
 * Keep this Pixel ID out of GTM to avoid double-firing the base Pixel.
 * Do not pass enquiry form contents, names, emails or phone numbers to Meta.
 * CAPI is NOT enabled by this browser-only integration.
 */
const META_PIXEL_ID = '1870143103988077';
const META_CONSENT_KEY = 'vendvision_meta_consent_v1';
const META_PRODUCTION = location.origin === 'https://www.vendvision.co';
let metaPixelReady = false;
function metaConsent() {
  try { return localStorage.getItem(META_CONSENT_KEY); }
  catch { return null; }
}
function metaTrack(name, data = {}) {
  if (META_PRODUCTION && metaPixelReady && metaConsent() === 'granted') {
    window.fbq('track', name, data);
  }
}
function enableMetaPixel() {
  if (!META_PRODUCTION || metaPixelReady || metaConsent() !== 'granted') return;
  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
    s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', META_PIXEL_ID);
  metaPixelReady = true;
  metaTrack('PageView');
}
function setMetaConsent(value) {
  try { localStorage.setItem(META_CONSENT_KEY, value); } catch {}
  const notice = document.querySelector('[data-meta-consent]');
  if (notice) notice.hidden = true;
  if (value === 'granted') enableMetaPixel();
  // A revoked choice must take effect immediately. Reload to clear the
  // current in-memory Pixel; never schedule another Pixel request on rejection.
  if (value === 'denied' && metaPixelReady) location.reload();
}
function displayMetaConsent() {
  if (!META_PRODUCTION) return;
  if (metaConsent() === 'granted') enableMetaPixel();
  const notice = document.createElement('aside');
  notice.className = 'vv-privacy-choice';
  notice.setAttribute('data-meta-consent', '');
  notice.setAttribute('aria-label', 'Optional Meta advertising cookies');
  notice.innerHTML = '<div><strong>Optional advertising cookies</strong><p>Vendvision can use Meta Pixel to measure Facebook and Instagram ad visits and contact clicks. Choose whether to allow this optional tracking. You can change your choice anytime.</p><div class="vv-privacy-actions"><button type="button" data-meta-choice="denied">Reject optional</button><button type="button" data-meta-choice="granted">Accept optional</button></div></div>';
  notice.hidden = metaConsent() !== null;
  document.body.append(notice);
  notice.querySelectorAll('[data-meta-choice]').forEach(button => {
    button.addEventListener('click', () => setMetaConsent(button.dataset.metaChoice));
  });
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'vv-privacy-settings';
  settings.textContent = 'Advertising cookie settings';
  settings.addEventListener('click', () => { notice.hidden = false; });
  document.querySelector('footer')?.append(settings);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', displayMetaConsent);
} else {
  displayMetaConsent();
}

function track(name, parameters) {
  // Non-PII event payload for future GTM custom-event triggers.
  // Do not include form values, email addresses, phone numbers or visitor names.
  if (location.origin === 'https://www.vendvision.co') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'vv_' + name, ...parameters });
  }
  // Existing direct GA4 instrumentation remains active until it is migrated to GTM.
  window.gtag?.('event', name, parameters);
  if (name === 'whatsapp_click' || (name === 'enquiry_handoff' && parameters.channel === 'email')) {
    metaTrack('Contact', { content_category: parameters.journey || 'direct_contact' });
  } else if (Object.values(completionEvents).includes(name)) {
    metaTrack('Lead', { content_category: parameters.journey || 'enquiry' });
  }
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href]');
  if (anchor && new URL(anchor.href).hostname === 'wa.me') {
    track('whatsapp_click', { journey: 'direct_contact' });
  }
});

const completionEvents = {
  campaign: 'campaign_enquiry_completed',
  machine_quote: 'machine_quote_completed',
  operator: 'operator_application_completed',
  location: 'location_submission_completed',
  pantry: 'pantry_enquiry_completed'
};
const deliveryPath = location.origin === 'https://www.vendvision.co'
  ? document.querySelector('meta[name="vendvision-delivery"]').content : '';

async function deliver(form, journey, fields) {
  const status = form.querySelector('[role="status"]');
  const button = form.querySelector('button[value="deliver"]');
  button.disabled = true;
  status.hidden = false;
  status.textContent = 'Sending your enquiry…';
  try {
    const response = await fetch(deliveryPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journey, fields: Object.fromEntries(fields) }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok || (await response.json()).delivered !== true) {
      throw new Error('Delivery unconfirmed');
    }
    track(completionEvents[journey], { journey });
    form.reset();
    status.textContent = 'Vendvision received your enquiry.';
  } catch {
    status.textContent = 'Delivery could not be confirmed. Please use WhatsApp or email to follow up.';
  } finally {
    button.disabled = false;
  }
}

for (const form of document.querySelectorAll('[data-enquiry]')) {
  form.hidden = false;
  if (deliveryPath) {
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.name = 'channel';
    submit.value = 'deliver';
    submit.className = 'button';
    submit.textContent = 'Send enquiry';
    form.querySelector('.actions').prepend(submit);
    form.querySelector('.form-note').textContent = 'Send your enquiry here, or open a draft in WhatsApp or email.';
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const channel = event.submitter?.value || 'email';
    const fields = Array.from(new FormData(form), ([key, value]) => [key, value.trim()]);
    const message = fields.filter(([, value]) => value).map(([key, value]) => key + ': ' + value).join('\n');
    const subject = form.dataset.subject;
    const section = form.closest('section');
    const journey = form.dataset.enquiry;
    if (channel === 'deliver' && deliveryPath) {
      void deliver(form, journey, fields);
      return;
    }
    track('enquiry_handoff', { journey, channel });
    if (channel === 'whatsapp') {
      const chat = new URL(section.querySelector('a[href^="https://wa.me/"]').href);
      chat.searchParams.set('text', subject + '\n\n' + message);
      track('whatsapp_click', { journey });
      window.location.href = chat.href;
    } else {
      const mail = section.querySelector('a[href^="mailto:"]').href;
      window.location.href = mail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message);
    }
  });
}
