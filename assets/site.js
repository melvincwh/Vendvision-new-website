'use strict';

const ga4 = document.querySelector('meta[name="vendvision-ga4"]').content;
const PRODUCTION_SITE = location.origin === 'https://www.vendvision.co';
function storedConsent(key) {
  try { return localStorage.getItem(key) === 'granted'; } catch { return false; }
}
function permittedPageLocation() {
  // Preserve attribution without forwarding arbitrary URL query values to GA4.
  const allowed = /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|li_fat_id)$/i;
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()]) {
    if (!allowed.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.href;
}
if (ga4 && PRODUCTION_SITE && storedConsent('vendvision_analytics_consent_v1')) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // This is the only GA4 configuration on the website. Avoid adding another
  // GA4 page_view tag in GTM until the direct integration is retired.
  window.gtag('config', ga4, {
    page_location: permittedPageLocation(),
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
const CLARITY_ID = 'gj29wj0mfe';
const ANALYTICS_CONSENT_KEY = 'vendvision_analytics_consent_v1';
let clarityStarted = false;
function analyticsConsent() {
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY); }
  catch { return null; }
}
function enableClarity() {
  if (!META_PRODUCTION || clarityStarted || analyticsConsent() !== 'granted') return;
  clarityStarted = true;
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window,document,'clarity','script',CLARITY_ID);
  // Clarity loads only after analytics opt-in. No PII is passed in custom events.
  window.clarity('consentv2', { analytics_Storage: 'granted', ad_Storage: metaConsent() === 'granted' ? 'granted' : 'denied' });
}
function savePrivacy(analytics, marketing) {
  const previousAnalytics = analyticsConsent();
  const previousMarketing = metaConsent();
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, analytics ? 'granted' : 'denied');
    localStorage.setItem(META_CONSENT_KEY, marketing ? 'granted' : 'denied');
  } catch {
    // If storage is blocked, do not attempt to enable optional tracking.
    return;
  }
  const notice = document.querySelector('[data-meta-consent]');
  if (notice) notice.hidden = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'vv_privacy_updated',
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: marketing ? 'granted' : 'denied'
  });
  window.gtag?.('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: marketing ? 'granted' : 'denied',
    ad_user_data: marketing ? 'granted' : 'denied',
    ad_personalization: marketing ? 'granted' : 'denied'
  });
  if ((previousAnalytics === 'granted') !== analytics ||
      (previousMarketing === 'granted') !== marketing) {
    // Reinitialize optional tags with the chosen preferences and stop tags
    // promptly after withdrawal. Fresh page view is counted only on opt-in.
    location.reload();
  }
}
function displayMetaConsent() {
  if (!META_PRODUCTION) return;
  if (metaConsent() === 'granted') enableMetaPixel();
  if (analyticsConsent() === 'granted') enableClarity();
  const notice = document.createElement('aside');
  notice.className = 'vv-privacy-choice';
  notice.setAttribute('data-meta-consent', '');
  notice.setAttribute('aria-label', 'Vendvision privacy preferences');
  notice.innerHTML = '<div><strong>Privacy preferences</strong><p>Choose optional website analytics (Microsoft Clarity) and marketing measurement (Meta Pixel). Essential website functions do not require these choices.</p><label class="vv-privacy-toggle"><input type="checkbox" data-vv-analytics> Analytics and session insights</label><label class="vv-privacy-toggle"><input type="checkbox" data-vv-marketing> Marketing measurement</label><div class="vv-privacy-actions"><button type="button" data-vv-reject>Reject optional</button><button type="button" data-vv-save>Save choices</button><button type="button" data-vv-accept>Accept all</button></div></div>';
  notice.hidden = analyticsConsent() !== null && metaConsent() !== null;
  document.body.append(notice);
  const a = notice.querySelector('[data-vv-analytics]');
  const m = notice.querySelector('[data-vv-marketing]');
  function sync() {
    a.checked = analyticsConsent() === 'granted';
    m.checked = metaConsent() === 'granted';
  }
  sync();
  notice.querySelector('[data-vv-reject]').addEventListener('click', () => savePrivacy(false, false));
  notice.querySelector('[data-vv-accept]').addEventListener('click', () => savePrivacy(true, true));
  notice.querySelector('[data-vv-save]').addEventListener('click', () => savePrivacy(a.checked, m.checked));
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'vv-privacy-settings';
  settings.textContent = 'Cookie and privacy settings';
  settings.addEventListener('click', () => { sync(); notice.hidden = false; });
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
