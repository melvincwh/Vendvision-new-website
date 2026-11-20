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

function track(name, parameters) {
  // Non-PII event payload for future GTM custom-event triggers.
  // Do not include form values, email addresses, phone numbers or visitor names.
  if (location.origin === 'https://www.vendvision.co') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'vv_' + name, ...parameters });
  }
  // Existing direct GA4 instrumentation remains active until it is migrated to GTM.
  window.gtag?.('event', name, parameters);
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
